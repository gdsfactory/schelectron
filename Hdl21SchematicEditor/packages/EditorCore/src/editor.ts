//
// # Hdl21 Schematics Editor
//
// Essentially the entirety of the schematic GUI, drawing logic, saving and loading logic.
//

// Workspace Imports
import {
  Platform,
  Message,
  MessageKind,
  MessageHandler,
  SymbolValidation,
  SymbolPortStatus,
} from "PlatformInterface";

// Local Imports
import {
  exhaust,
  Direction,
  SvgImporter,
  SvgExporter,
  createPdkElement,
  generatePdkImport,
  PdkDeviceInfo,
  createCustomElement,
  CustomSymbolInfo,
  orientation,
} from "SchematicsCore";
import { nearestOnGrid } from "./drawing/grid";
import { ColorTheme, setCurrentTheme, getThemeColors } from "./drawing/style";

import { PanelProps, PanelUpdater } from "./panels";
import { Keys } from "./keys";
import { Change, ChangeKind } from "./changes";
import { UiState } from "./uistate";
import { UiModes, ModeHandlers } from "./modes";
import { MousePos } from "./mousepos";
import { Entity, EntityKind, Schematic, setupGrid, Canvas, Instance, SchPort, Wire } from "./drawing";

// A dummy "Platform", which does nothing, and stands in for a real one between Editor construction and startup.
const NoPlatform = {
  sendMessage: (msg: Message) => {},
  registerMessageHandler: (handler: MessageHandler) => {},
};
// Kinda the same thing for the `Panels` updater-function.
const NoPanelUpdater = (_: PanelProps) => {};

// # The Schematic Editor UI
//
// The "top-level" for the schematic editor UI,
// including all UI state and the contents of the schematic.
// Includes essentially all behavior of the schematic editor;
// core attributes `schematic` and `uiState` are largely "data only".
//
// Schematic Editors communicate with an underlying "platform" via Message passing.
// The platform is responsible for tasks such as file I/O and launching the editor in the first place.
// Each platform-type implements the `Platform` interface, which consists of two methods:
// * `registerMessageHandler` - registers a callback to handle incoming messages. Called once during Editor initialization.
// * `sendMessage` - sends a message from the Editor to the Platform
//
// At construction time, each editor needs a sole attribute: its `Platform`.
// The platform is responsible for providing initial schematic content,
// after the editor is constructed and indicates it is ready via messages.
//
export class SchEditor {
  platform: Platform = NoPlatform; // Platform interface. Set upon the one (and only) call to `start`.
  schematic: Schematic = new Schematic(this); // The schematic content
  uiState: UiState = new UiState(this); // Non-schematic UI state
  canvas: Canvas = new Canvas(this); // The drawing canvas
  panelUpdater: PanelUpdater = NoPanelUpdater; // Function to update the peripheral `Panels`
  failer: (msg: string) => void = console.log; // Function called on errors

  // Editor startup
  // Sets the `platform` attribute, and does all our one-time startup activity.
  // This can be called (usefully) exactly once.
  start(platform: Platform) {
    if (this.platform !== NoPlatform) {
      return; // We've already started, and won't start again.
    }
    this.platform = platform;

    // Perform all of our one-time startup activity, binding the canvas to the DOM, binding events, etc.

    // Attach the drawing canvas to the DOM
    this.canvas.attach();

    // Detect and apply initial color theme
    const initialTheme = this.detectColorTheme();
    setCurrentTheme(initialTheme);
    const colors = getThemeColors(initialTheme);
    this.canvas.setBackgroundColor(colors.background);

    // Listener for color-scheme changes
    // Note the `Panels` have separate tracking of this.
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", this.handleColorSchemeChange);
    // The key event listener seems to need to be on `window`, while mouse events are on the canvas's parent div.
    window.addEventListener("keydown", this.handleKey);
    // FIXME: where will this `wheel` event eventually attach
    window.addEventListener("wheel", this.handleWheel);
    // window.addEventListener('resize', this.handleResize);
    this.canvas.parentDomElement!.addEventListener(
      "mousedown",
      this.handleMouseDown,
      true
    );
    this.canvas.parentDomElement!.addEventListener(
      "mouseup",
      this.handleMouseUp,
      true
    );
    this.canvas.parentDomElement!.addEventListener(
      "mousemove",
      this.handleMouseMove,
      true
    );
    this.canvas.parentDomElement!.addEventListener(
      "dblclick",
      this.handleDoubleClick
    );
    // Add right-click (context menu) handler
    this.canvas.parentDomElement!.addEventListener(
      "contextmenu",
      this.handleContextMenu
    );
    // this.canvas.parentDomElement!.addEventListener("click", this.handleClick);

    // Get ourselves out of the "before startup" mode, and into UI idle.
    this.goUiIdle();

    // Register our message-handler with the platform.
    this.platform.registerMessageHandler(this.handleMessage);

    // Send a message back to the main process, to indicate this has all run.
    this.platform.sendMessage({ kind: MessageKind.RendererUp });
  }
  handleColorSchemeChange = (e: MediaQueryListEvent) => {
    const theme = e.matches ? ColorTheme.Dark : ColorTheme.Light;
    this.applyColorTheme(theme);
  };
  // Apply a color theme to the editor
  applyColorTheme = (theme: ColorTheme) => {
    setCurrentTheme(theme);

    // Update the canvas background color
    const colors = getThemeColors(theme);
    this.canvas.setBackgroundColor(colors.background);

    // Redraw the schematic with new colors
    this.canvas.clear();
    setupGrid(this.schematic.size, this.canvas);
    this.schematic.draw();
  };
  // Get the current color theme from system preference
  detectColorTheme = (): ColorTheme => {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? ColorTheme.Dark
      : ColorTheme.Light;
  };
  // Request keyboard focus for the editor canvas.
  // This is called when adding components from the sidebar to ensure R/H/V keys work.
  requestFocus = () => {
    // Focus the canvas parent element to receive keyboard events
    if (this.canvas.parentDomElement) {
      this.canvas.parentDomElement.focus();
    }
    // Also try focusing the window/document
    window.focus();
  };
  // Send the schematic's SVG content to the platform for saving.
  sendSaveFile = () => {
    const schData = this.schematic.toData();
    let svgContent: string;
    try {
      svgContent = SvgExporter.export(schData);
    } catch (e) {
      console.log("SVG Exporter failed");
      console.log(e);
      return;
    }
    return this.platform.sendMessage({
      kind: MessageKind.SaveFile,
      body: svgContent,
    });
  };
  // Send a schematic-changed message back to the platform.
  sendChangeMessage = () => {
    return this.platform.sendMessage({ kind: MessageKind.Change });
  };
  // Handle incoming Messages from the platform.
  handleMessage = (msg: Message) => {
    const { kind } = msg;
    switch (kind) {
      case MessageKind.NewSchematic:
        return this.newSchematic();
      case MessageKind.LoadFile: {
        // Load schematic content from the file.
        // FIXME: error handling via Result
        try {
          this.canvas.clear();
          const schData = SvgImporter.import(msg.body);
          const schematic = Schematic.fromData(this, schData);
          return this.loadSchematic(schematic);
        } catch (e) {
          return this.failer(`Error loading schematic: ${e}`);
        }
      }
      case MessageKind.AddPdkDevice: {
        // Add a PDK device to the schematic
        const { device, pdkName } = msg.body;
        return this.addPdkDevice(device, pdkName);
      }
      case MessageKind.AddCustomSymbol: {
        // Add a custom symbol to the schematic
        return this.addCustomSymbol(msg.body);
      }
      case MessageKind.SymbolValidation: {
        // Handle symbol validation for hierarchical diagrams
        return this.handleSymbolValidation(msg);
      }
      case MessageKind.RequestContent: {
        // Platform is requesting current content for saving
        return this.sendSaveFile();
      }
      case MessageKind.RequestFocus: {
        // Platform is requesting we take keyboard focus
        return this.requestFocus();
      }
      // Messages designed to sent *from* us, to the platform.
      // Log it as out of place, and carry on.
      case MessageKind.RendererUp:
      case MessageKind.SaveFile:
      case MessageKind.LogInMain:
      case MessageKind.Change:
      case MessageKind.OpenSchematic: {
        return this.failer(`Invalid message from platform to editor: ${msg}`);
      }
      default:
        throw exhaust(kind);
    }
  };
  // Load a new and empty schematic into the editor.
  newSchematic = () => {
    this.loadSchematic(new Schematic(this));
  };
  // Load `schematic` into the UI and draw it.
  loadSchematic = (schematic: Schematic) => {
    this.schematic = schematic;

    // Clear the drawing window, in case we have a previous drawing.
    this.canvas.clear();

    // Set up the background grid
    setupGrid(this.schematic.size, this.canvas);

    // Load the schematic's code-prelude into the `Panels` editor area.
    // This will also set `schematic.prelude` back to itself, but meh, it's harmless and we share that line.
    this.updateCodePrelude(schematic.prelude);

    // And draw the loaded schematic
    this.schematic.draw();
  };
  // Go to the "UI Idle" state, in which nothing is moving, being drawn, or really doing anything.
  goUiIdle = () => {
    this.uiState.modeHandler = ModeHandlers.Idle.start(this);
  };
  // Start the "Edit Prelude" state
  startEditPrelude = () => {
    this.uiState.modeHandler = ModeHandlers.EditPrelude.start(
      this,
      structuredClone(this.schematic.prelude)
    );
  };
  // Handle zoom via the mouse scroll wheel.
  handleWheel = (e: WheelEvent) => {
    // Prevent default scrolling behavior
    e.preventDefault();

    // Disable zoom during placement/drawing modes to avoid confusion
    const mode = this.uiState.mode;
    if (
      mode === UiModes.WireReady ||
      mode === UiModes.DrawWire ||
      mode === UiModes.InstanceReady ||
      mode === UiModes.PortReady
    ) {
      return;
    }

    // Get raw canvas coordinates (before zoom/pan transform) for zooming
    const parentLoc = this.canvas.getParentOrigin();
    const canvasX = e.pageX - parentLoc.x;
    const canvasY = e.pageY - parentLoc.y;

    // Zoom in/out based on scroll direction
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoomAtPoint(zoomFactor, canvasX, canvasY);
  };

  // Current zoom scale (1.0 = 100%)
  private zoomScale: number = 1.0;
  private panOffset = { x: 0, y: 0 };

  // Panning state
  private isPanning: boolean = false;
  private panStartPos = { x: 0, y: 0 };

  // Get the current zoom/pan transform values
  getTransform = () => {
    return {
      zoomScale: this.zoomScale,
      panOffset: { x: this.panOffset.x, y: this.panOffset.y },
    };
  };

  // Zoom at a specific point (keeps that point stationary)
  zoomAtPoint = (factor: number, pointX: number, pointY: number) => {
    const oldScale = this.zoomScale;
    const newScale = Math.max(0.1, Math.min(5.0, oldScale * factor));

    // Calculate the point in scene coordinates before zoom
    const sceneX = (pointX - this.panOffset.x) / oldScale;
    const sceneY = (pointY - this.panOffset.y) / oldScale;

    // Update scale
    this.zoomScale = newScale;

    // Adjust pan so the point under cursor stays in place
    this.panOffset.x = pointX - sceneX * newScale;
    this.panOffset.y = pointY - sceneY * newScale;

    this.applyTransform();
  };

  // Zoom by a factor (centered on viewport)
  zoom = (factor: number) => {
    // Get the center of the visible canvas area
    const canvasWidth = this.canvas.two.width;
    const canvasHeight = this.canvas.two.height;
    this.zoomAtPoint(factor, canvasWidth / 2, canvasHeight / 2);
  };

  // Zoom in by a fixed factor
  zoomIn = () => {
    this.zoom(1.2);
  };

  // Zoom out by a fixed factor
  zoomOut = () => {
    this.zoom(0.8);
  };

  // Fit the schematic content to the view
  fitToView = () => {
    // Get the schematic size and canvas dimensions
    const schematicWidth = this.schematic.size.x;
    const schematicHeight = this.schematic.size.y;
    const canvasWidth = this.canvas.two.width;
    const canvasHeight = this.canvas.two.height;

    // Calculate the scale to fit the schematic in the canvas with some padding
    const padding = 40;
    const scaleX = (canvasWidth - padding * 2) / schematicWidth;
    const scaleY = (canvasHeight - padding * 2) / schematicHeight;
    const fitScale = Math.min(scaleX, scaleY, 1.0); // Don't zoom in past 100%

    // Center the schematic in the canvas
    this.zoomScale = fitScale;
    this.panOffset.x = (canvasWidth - schematicWidth * fitScale) / 2;
    this.panOffset.y = (canvasHeight - schematicHeight * fitScale) / 2;

    this.applyTransform();
  };

  // Pan the view by an offset
  pan = (dx: number, dy: number) => {
    this.panOffset.x += dx;
    this.panOffset.y += dy;
    this.applyTransform();
  };

  // Start panning (called on middle mouse down or space+click)
  startPan = (e: MouseEvent) => {
    this.isPanning = true;
    this.panDidMove = false;
    this.panStartPos = { x: e.clientX, y: e.clientY };
  };

  // Update pan while dragging
  updatePan = (e: MouseEvent) => {
    if (!this.isPanning) return;

    const dx = e.clientX - this.panStartPos.x;
    const dy = e.clientY - this.panStartPos.y;

    // Only consider it a move if we moved more than a small threshold
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      this.panDidMove = true;
    }

    this.panStartPos = { x: e.clientX, y: e.clientY };
    this.pan(dx, dy);
  };

  // End panning
  endPan = () => {
    this.isPanning = false;
  };

  // Apply the current zoom and pan transform to the canvas
  private applyTransform = () => {
    const scene = this.canvas.two.scene;
    scene.scale = this.zoomScale;
    scene.translation.set(this.panOffset.x, this.panOffset.y);
  };
  // Handle keystrokes.
  handleKey = (e: KeyboardEvent) => {
    if (this.uiState.mode === UiModes.EditPrelude) {
      // FIXME: bailing here in favor of letting the text-input handle keystrokes.
      // This is particularly for ESCAPE, which exits the UI state, but we haven't figured out how to de-select the text input.
      return;
    }
    // Always abort any pending operation and go back to idle mode on escape.
    if (e.key === Keys.Escape) {
      return this.uiState.modeHandler.abort();
    }
    // FIXME: these OS-specific keys should probably come from the platform instead.
    // Handle Cmd/Ctrl shortcuts
    if (e.metaKey || e.ctrlKey) {
      // In Ready modes (InstanceReady, PortReady), ignore clipboard/selection shortcuts
      // to prevent accidentally committing the pending component
      if (
        this.uiState.mode === UiModes.InstanceReady ||
        this.uiState.mode === UiModes.PortReady
      ) {
        e.preventDefault();
        return; // Ignore Ctrl+A/C/X/V in Ready modes
      }
      if (e.shiftKey && e.key === Keys.z) {
        // Command-Shift-Z: redo
        return this.redo();
      }
      switch (e.key.toLowerCase()) {
        case "z":
          return this.undo();
        case "a":
          e.preventDefault();
          return this.selectAll();
        case "c":
          e.preventDefault();
          return this.copySelection();
        case "x":
          e.preventDefault();
          return this.cutSelection();
        case "v":
          e.preventDefault();
          return this.pasteClipboard();
      }
      // Skip other modifier key combinations
      return;
    }
    if (e.altKey) {
      // Skip alt key combinations
      return;
    }
    // Save with... comma(?). FIXME: modifier keys plz!
    if (e.key === Keys.Comma) {
      return this.sendSaveFile();
    }

    // Delegate everything else to the mode-specific key handler.
    return this.uiState.modeHandler.handleKey(e);
  };
  // Log a `Change` to the change history and to the platform.
  logChange(change: Change): void {
    this.uiState.changeLog.add(change);
    this.platform.sendMessage({ kind: MessageKind.Change });
  }
  // Apply a `Change`, generally as part of an undo or redo operation.
  applyChange(change: Change): void {
    switch (change.kind) {
      case ChangeKind.Add:
        this.schematic.addEntity(change.entity);
        // FIXME: update dots incrementally, instead of re-inferring them all!
        this.schematic.updateDots();
        return change.entity.draw();

      case ChangeKind.Remove:
        this.schematic.removeEntity(change.entity);
        // FIXME: update dots incrementally, instead of re-inferring them all!
        this.schematic.updateDots();
        return;

      case ChangeKind.Move:
        const { entity, to } = change;
        entity.data.loc = to.loc;
        entity.data.orientation = to.orientation;
        // FIXME: update dots incrementally, instead of re-inferring them all!
        this.schematic.updateDots();
        return entity.draw();

      case ChangeKind.EditText:
        change.label.update(change.to);
        return change.label.draw();

      case ChangeKind.MoveWire:
        // Set the wire points directly from the change
        change.wire.points = change.to.map((p) => structuredClone(p));
        change.wire.segments = null;
        change.wire.draw();
        // FIXME: update dots incrementally, instead of re-inferring them all!
        this.schematic.updateDots();
        return;

      case ChangeKind.Batch:
        for (const subChange of change.changes) {
          this.applyChange(subChange);
        }
        return;

      default:
        throw exhaust(change); // Exhaustiveness check
    }
  }
  // Undo the last change, if there is one.
  undo(): void {
    const inverseChange = this.uiState.changeLog.undo();
    if (inverseChange) {
      this.applyChange(inverseChange);
    }
  }
  // Redo the last undone change, if there is one.
  redo(): void {
    const redoChange = this.uiState.changeLog.redo();
    if (redoChange) {
      this.applyChange(redoChange);
    }
  }
  // Delete the selected entity, if we have one, and it is deletable.
  deleteSelectedEntity = () => {
    if (!this.uiState.selected_entity) {
      return;
    }
    const entity = this.uiState.selected_entity;
    const { entityKind } = entity;
    switch (entityKind) {
      // Delete-able entities
      case EntityKind.SchPort:
      case EntityKind.Dot:
      case EntityKind.Wire:
      case EntityKind.Instance: {
        // Delete the selected entity
        this.deselect();
        this.schematic.removeEntity(entity);
        // FIXME: update dots incrementally, instead of re-inferring them all!
        this.schematic.updateDots();
        this.logChange({
          kind: ChangeKind.Remove,
          entity,
        });
        return this.goUiIdle();
      }
      // Non-delete-able "child" entities
      case EntityKind.Label:
      case EntityKind.InstancePort:
        return;
      default:
        throw exhaust(entityKind);
    }
  };
  // Hit test all schematic entities.
  // Returns the "highest priority" entity that is hit, or `null` if none are hit.
  whatdWeHit(mousePos: MousePos): Entity | null {
    // Check all Instance Labels
    for (const instance of this.schematic.instances) {
      for (const label of instance.labels()) {
        if (label && label.hitTest(mousePos)) {
          return label;
        }
      }
    }
    // Check all Port Labels
    for (const port of this.schematic.ports) {
      for (const label of port.labels()) {
        if (label && label.hitTest(mousePos)) {
          return label;
        }
      }
    }
    // Check all Instance symbols / bodies
    for (const instance of this.schematic.instances) {
      if (instance.hitTest(mousePos)) {
        return instance;
      }
    }
    // Check all Port symbols / bodies
    for (const port of this.schematic.ports) {
      if (port.hitTest(mousePos)) {
        return port;
      }
    }
    // Check all Wires
    for (const wire of this.schematic.wires) {
      if (wire.hitTest(mousePos)) {
        return wire;
      }
    }
    // Didn't hit anything, return null.
    return null;
  }
  // Make `entity` the selected, highlighted entity (single selection).
  select(entity: Entity): void {
    this.deselectAll();
    this.uiState.selected_entity = entity;
    this.uiState.selected_entities.add(entity);
    entity.highlight();
    // Clear group transform center when selection changes
    this.uiState.groupTransformCenter = null;
  }

  // Deselect the highlighted entity, if any (single selection).
  deselect = () => {
    if (this.uiState.selected_entity) {
      this.uiState.selected_entity.unhighlight();
    }
    this.uiState.selected_entity = null;
    this.uiState.selected_entities.clear();
    // Clear group transform center when selection changes
    this.uiState.groupTransformCenter = null;
  };

  // Deselect all selected entities (multi-selection).
  deselectAll = () => {
    for (const entity of this.uiState.selected_entities) {
      entity.unhighlight();
    }
    this.uiState.selected_entities.clear();
    this.uiState.selected_entity = null;
    // Clear group transform center when selection changes
    this.uiState.groupTransformCenter = null;
  };

  // Add an entity to the current selection (multi-selection).
  addToSelection = (entity: Entity) => {
    entity.highlight();
    this.uiState.selected_entities.add(entity);
    // Also set selected_entity to the last added entity for backwards compatibility
    this.uiState.selected_entity = entity;
    // Clear group transform center when selection changes
    this.uiState.groupTransformCenter = null;
  };

  // Check if any entities are selected
  hasSelection = (): boolean => {
    return this.uiState.selected_entities.size > 0;
  };

  // Select all entities in the schematic
  selectAll = () => {
    this.deselectAll();
    // Select all instances
    for (const instance of this.schematic.instances) {
      this.addToSelection(instance);
    }
    // Select all ports
    for (const port of this.schematic.ports) {
      this.addToSelection(port);
    }
    // Select all wires
    for (const wire of this.schematic.wires) {
      this.addToSelection(wire);
    }
    // Update toolbar to show context tools
    this.goUiIdle();
  };

  // Clipboard for copy/paste operations
  private clipboard: Array<{
    type: "instance" | "port" | "wire";
    data: any;
  }> = [];

  // Copy the current selection to clipboard
  copySelection = () => {
    this.clipboard = [];
    for (const entity of this.uiState.selected_entities) {
      if (entity.entityKind === EntityKind.Instance) {
        const instance = entity as any;
        this.clipboard.push({
          type: "instance",
          data: structuredClone(instance.data),
        });
      } else if (entity.entityKind === EntityKind.SchPort) {
        const port = entity as any;
        this.clipboard.push({
          type: "port",
          data: structuredClone(port.data),
        });
      } else if (entity.entityKind === EntityKind.Wire) {
        const wire = entity as any;
        this.clipboard.push({
          type: "wire",
          data: { points: structuredClone(wire.points) },
        });
      }
    }
  };

  // Cut the current selection (copy + delete)
  cutSelection = () => {
    this.copySelection();
    this.deleteSelectedEntities();
  };

  // Delete all selected entities
  deleteSelectedEntities = () => {
    const entitiesToDelete = Array.from(this.uiState.selected_entities);
    this.deselectAll();
    for (const entity of entitiesToDelete) {
      this.schematic.removeEntity(entity);
      this.logChange({
        kind: ChangeKind.Remove,
        entity,
      });
    }
    this.schematic.updateDots();
    this.goUiIdle();
  };

  // Paste from clipboard
  pasteClipboard = () => {
    if (this.clipboard.length === 0) return;

    // Calculate offset from original position (paste with small offset)
    const offset = 20;

    this.deselectAll();

    for (const item of this.clipboard) {
      if (item.type === "instance") {
        const data = structuredClone(item.data);
        data.loc.x += offset;
        data.loc.y += offset;
        // Generate a new unique name
        data.name = data.name + "_copy";
        const instance = Instance.create(data);
        this.schematic.addInstance(instance);
        instance.draw();
        this.addToSelection(instance);
        this.logChange({ kind: ChangeKind.Add, entity: instance });
      } else if (item.type === "port") {
        const data = structuredClone(item.data);
        data.loc.x += offset;
        data.loc.y += offset;
        data.name = data.name + "_copy";
        const port = SchPort.create(data);
        this.schematic.addPort(port);
        port.draw();
        this.addToSelection(port);
        this.logChange({ kind: ChangeKind.Add, entity: port });
      } else if (item.type === "wire") {
        const points = structuredClone(item.data.points);
        for (const point of points) {
          point.x += offset;
          point.y += offset;
        }
        const wire = Wire.create(points);
        wire.updateSegments();
        this.schematic.addWire(wire);
        wire.draw();
        this.addToSelection(wire);
        this.logChange({ kind: ChangeKind.Add, entity: wire });
      }
    }

    this.schematic.updateDots();
    this.goUiIdle();
  };

  // FIXME: whether we want a "click" handler, in addition to mouse up/down.
  // handleClick = e => {}

  // Track if we actually moved during a pan (to distinguish click from drag)
  private panDidMove: boolean = false;

  // Handle mouse-down events. Fully delegated to the mode-handlers.
  handleMouseDown = (e: MouseEvent) => {
    // Always update mouse position first for all modes
    this.uiState.mousePos = this.canvas.newMousePos(e);

    // Middle mouse button always starts panning
    if (e.button === 1) {
      e.preventDefault();
      this.startPan(e);
      return;
    }

    // For left click in Idle mode, handle special cases
    if (e.button === 0 && this.uiState.mode === UiModes.Idle) {
      const whatd_we_hit = this.whatdWeHit(this.uiState.mousePos);

      if (e.shiftKey) {
        // Shift+click behavior
        if (!whatd_we_hit) {
          // Shift+click on blank space - start rectangle selection
          e.preventDefault();
          this.uiState.modeHandler = ModeHandlers.RectSelect.start(this);
          return;
        } else {
          // Shift+click on entity - add to selection (toggle)
          e.preventDefault();
          const { entityKind } = whatd_we_hit;
          if (entityKind === EntityKind.Instance ||
              entityKind === EntityKind.SchPort ||
              entityKind === EntityKind.Wire) {
            if (this.uiState.selected_entities.has(whatd_we_hit)) {
              // Already selected - remove from selection
              whatd_we_hit.unhighlight();
              this.uiState.selected_entities.delete(whatd_we_hit);
              if (this.uiState.selected_entity === whatd_we_hit) {
                this.uiState.selected_entity = null;
              }
            } else {
              // Not selected - add to selection
              this.addToSelection(whatd_we_hit);
            }
            this.goUiIdle(); // Update toolbar
            return;
          }
        }
      }

      if (!whatd_we_hit) {
        // Clicking blank space - start potential pan
        e.preventDefault();
        this.startPan(e);
        return;
      }
    }

    this.uiState.modeHandler.handleMouseDown();
  };
  // Handle mouse-up events. Fully delegated to the mode-handlers.
  handleMouseUp = (_: MouseEvent) => {
    // End panning if we were panning
    if (this.isPanning) {
      const didMove = this.panDidMove;
      this.endPan();

      // If we were in a blank-space pan that didn't actually move,
      // treat it as a click to deselect all
      if (!didMove && this.uiState.mode === UiModes.Idle) {
        this.deselectAll();
        this.goUiIdle(); // Update toolbar
      }
      return;
    }
    this.uiState.modeHandler.handleMouseUp();
  };
  // Handle double-click events. Fully delegated to the mode-handlers.
  handleDoubleClick = (_: MouseEvent) =>
    this.uiState.modeHandler.handleDoubleClick();
  // Handle right-click (context menu) events. Prevents default context menu.
  handleContextMenu = (e: MouseEvent) => {
    e.preventDefault(); // Prevent browser context menu
    this.uiState.modeHandler.handleContextMenu();
  };
  // Handle mouse movement events.
  handleMouseMove = (e: MouseEvent) => {
    // Handle panning if we're in pan mode
    if (this.isPanning) {
      this.updatePan(e);
      return;
    }
    // Update our tracking of the mouse position.
    this.uiState.mousePos = this.canvas.newMousePos(e);
    // And delegate to the mode-handler.
    return this.uiState.modeHandler.handleMouseMove();
  };

  // Get all rotatable entities (Instance or SchPort) from the current selection
  // Get all transformable entities (placeables and wires) from the selection
  private getTransformableEntities = (): {
    placeables: Array<Instance | SchPort>;
    wires: Array<Wire>;
  } => {
    const placeables: Array<Instance | SchPort> = [];
    const wires: Array<Wire> = [];
    for (const entity of this.uiState.selected_entities) {
      if (entity.entityKind === EntityKind.Instance || entity.entityKind === EntityKind.SchPort) {
        placeables.push(entity as Instance | SchPort);
      } else if (entity.entityKind === EntityKind.Wire) {
        wires.push(entity as Wire);
      }
    }
    return { placeables, wires };
  };

  // Calculate the center point of all transformable entities in the selection
  private getSelectionCenter = (
    placeables: Array<Instance | SchPort>,
    wires: Array<Wire>
  ): { x: number; y: number } | null => {
    const totalCount = placeables.length + wires.length;
    if (totalCount === 0) {
      return null;
    }

    let sumX = 0;
    let sumY = 0;

    // Add placeable entity locations
    for (const entity of placeables) {
      const loc = entity.data.loc;
      sumX += loc.x;
      sumY += loc.y;
    }

    // Add wire centroids
    for (const wire of wires) {
      const centroid = wire.getCentroid();
      sumX += centroid.x;
      sumY += centroid.y;
    }

    return {
      x: sumX / totalCount,
      y: sumY / totalCount,
    };
  };

  // Flip all selected entities (placeables and wires) around their group center
  flipSelected = (dir: Direction) => {
    const { placeables, wires } = this.getTransformableEntities();
    const totalCount = placeables.length + wires.length;

    if (totalCount === 0) {
      return;
    }

    // For single placeable entity, just flip it in place
    if (totalCount === 1 && placeables.length === 1) {
      const entity = placeables[0];
      const placeFrom = structuredClone(entity.place());
      entity.flip(dir);
      const placeTo = structuredClone(entity.place());
      this.logChange({
        kind: ChangeKind.Move,
        entity,
        from: placeFrom,
        to: placeTo,
      });
      return;
    }

    // For single wire, flip it around its own centroid
    if (totalCount === 1 && wires.length === 1) {
      const wire = wires[0];
      const from = wire.points.map((p) => structuredClone(p));
      const center = wire.getCentroid();
      wire.flipAround(center, dir === Direction.Horiz);
      const to = wire.points.map((p) => structuredClone(p));
      this.logChange({
        kind: ChangeKind.MoveWire,
        wire,
        from,
        to,
      });
      this.schematic.updateDots();
      return;
    }

    // For multiple entities, flip around a fixed group center.
    // Use the stored center if available, otherwise calculate and store it.
    if (!this.uiState.groupTransformCenter) {
      const center = this.getSelectionCenter(placeables, wires);
      if (!center) return;
      // Snap center to grid and store it
      this.uiState.groupTransformCenter = nearestOnGrid(center);
    }
    const gridCenter = this.uiState.groupTransformCenter;

    const changes: Array<Change> = [];

    // Flip placeables
    for (const entity of placeables) {
      const placeFrom = structuredClone(entity.place());
      const loc = entity.data.loc;

      // Flip the entity's position around the center
      if (dir === Direction.Horiz) {
        // Horizontal flip: reflect x coordinate around center
        const dx = loc.x - gridCenter.x;
        loc.x = gridCenter.x - dx;
      } else {
        // Vertical flip: reflect y coordinate around center
        const dy = loc.y - gridCenter.y;
        loc.y = gridCenter.y - dy;
      }

      // Snap to grid
      entity.data.loc = nearestOnGrid(loc);

      // Also flip the entity itself
      entity.flip(dir);

      const placeTo = structuredClone(entity.place());
      changes.push({
        kind: ChangeKind.Move,
        entity,
        from: placeFrom,
        to: placeTo,
      });
    }

    // Flip wires
    for (const wire of wires) {
      const from = wire.points.map((p) => structuredClone(p));
      wire.flipAround(gridCenter, dir === Direction.Horiz);
      const to = wire.points.map((p) => structuredClone(p));
      changes.push({
        kind: ChangeKind.MoveWire,
        wire,
        from,
        to,
      });
    }

    // Log all changes as a single batch for atomic undo
    if (changes.length > 0) {
      this.logChange({
        kind: ChangeKind.Batch,
        changes,
      });
    }

    // Update dots after all transformations
    this.schematic.updateDots();
  };

  // Rotate all selected entities (placeables and wires) by 90 degrees around their group center
  rotateSelected = () => {
    const { placeables, wires } = this.getTransformableEntities();
    const totalCount = placeables.length + wires.length;

    if (totalCount === 0) {
      return;
    }

    // For single placeable entity, just rotate it in place
    if (totalCount === 1 && placeables.length === 1) {
      const entity = placeables[0];
      const placeFrom = structuredClone(entity.place());
      entity.rotate();
      const placeTo = structuredClone(entity.place());
      this.logChange({
        kind: ChangeKind.Move,
        entity,
        from: placeFrom,
        to: placeTo,
      });
      return;
    }

    // For single wire, rotate it around its own centroid
    if (totalCount === 1 && wires.length === 1) {
      const wire = wires[0];
      const from = wire.points.map((p) => structuredClone(p));
      const center = wire.getCentroid();
      wire.rotateAround(center);
      const to = wire.points.map((p) => structuredClone(p));
      this.logChange({
        kind: ChangeKind.MoveWire,
        wire,
        from,
        to,
      });
      this.schematic.updateDots();
      return;
    }

    // For multiple entities, rotate around a fixed group center.
    // Use the stored center if available, otherwise calculate and store it.
    if (!this.uiState.groupTransformCenter) {
      const center = this.getSelectionCenter(placeables, wires);
      if (!center) return;
      // Snap center to grid and store it
      this.uiState.groupTransformCenter = nearestOnGrid(center);
    }
    const gridCenter = this.uiState.groupTransformCenter;

    const changes: Array<Change> = [];

    // Rotate placeables
    for (const entity of placeables) {
      const placeFrom = structuredClone(entity.place());
      const loc = entity.data.loc;

      // Rotate the entity's position 90° clockwise around the center
      const dx = loc.x - gridCenter.x;
      const dy = loc.y - gridCenter.y;
      // Clockwise 90° rotation: (x, y) -> (y, -x) relative to center
      loc.x = gridCenter.x + dy;
      loc.y = gridCenter.y - dx;

      // Snap to grid
      entity.data.loc = nearestOnGrid(loc);

      // Also rotate the entity itself
      entity.rotate();

      const placeTo = structuredClone(entity.place());
      changes.push({
        kind: ChangeKind.Move,
        entity,
        from: placeFrom,
        to: placeTo,
      });
    }

    // Rotate wires
    for (const wire of wires) {
      const from = wire.points.map((p) => structuredClone(p));
      wire.rotateAround(gridCenter);
      const to = wire.points.map((p) => structuredClone(p));
      changes.push({
        kind: ChangeKind.MoveWire,
        wire,
        from,
        to,
      });
    }

    // Log all changes as a single batch for atomic undo
    if (changes.length > 0) {
      this.logChange({
        kind: ChangeKind.Batch,
        changes,
      });
    }

    // Update dots after all transformations
    this.schematic.updateDots();
  };
  // Add a PDK device to the schematic.
  // This creates the appropriate element, ensures the import is in the prelude,
  // and starts the AddInstance mode for placing the device.
  addPdkDevice = (device: PdkDeviceInfo, pdkName: string) => {
    // Create the PDK element (reuses base symbols with PDK-specific defaults)
    const element = createPdkElement(device, pdkName);

    // Update the last instance data to use this element
    this.uiState.lastInstanceData = {
      name: element.defaultNamePrefix,
      of: element.defaultOf,
      kind: element.kind,
      element: element,
      loc: nearestOnGrid(this.uiState.mousePos.canvas),
      orientation: orientation.default(),
    };

    // Ensure the PDK import is in the prelude
    this.ensurePdkImport(device, pdkName);

    // Start instance ready mode (preview follows mouse, R/H/V allowed before click)
    this.uiState.modeHandler = ModeHandlers.InstanceReady.start(this);
  };

  // Ensure the PDK import statement is in the schematic's prelude.
  ensurePdkImport = (device: PdkDeviceInfo, pdkName: string) => {
    const importStmt = generatePdkImport(device, pdkName);

    // Check if import already exists in prelude
    if (!this.schematic.prelude.includes(device.name)) {
      // Add the import to the prelude
      const currentPrelude = this.schematic.prelude.trim();
      const newPrelude = currentPrelude
        ? `${currentPrelude}\n${importStmt}`
        : importStmt;

      this.updateCodePrelude(newPrelude);
    }
  };

  // Add a custom symbol (hierarchical module) to the schematic
  addCustomSymbol = (symbolInfo: CustomSymbolInfo) => {
    // Create the custom element from the symbol info
    const element = createCustomElement(symbolInfo);

    // Update the last instance data to use this element
    this.uiState.lastInstanceData = {
      name: element.defaultNamePrefix,
      of: element.defaultOf,
      kind: element.kind,
      element: element,
      loc: nearestOnGrid(this.uiState.mousePos.canvas),
      orientation: orientation.default(),
    };

    // Start instance ready mode (preview follows mouse, R/H/V allowed before click)
    this.uiState.modeHandler = ModeHandlers.InstanceReady.start(this);
  };

  // Update the schematic's code-prelude.
  // Note a copy of this is also kept in the `PanelProps`; this is in fact the one rendered to the screen.
  updateCodePrelude = (codePrelude: string) => {
    // Set the prelude on the `schematic`
    this.schematic.prelude = codePrelude;
    // And set it on the `Panels`
    this.updatePanels({
      ...this.uiState.panelProps,
      codePrelude: { codePrelude },
    });
  };
  // Update the peripheral `Panels`
  // Notes:
  // * We generally need to keep a copy of our `PanelProps` in the `UiState`, to enable partial edits.
  //   * Updates really need to route through here, or the `PanelProps` will get out of sync.
  // * Calling `panelUpdater` will generally re-render everything but the central schematic canvas.
  updatePanels = (props: PanelProps): void => {
    // Set the `PanelProps` in the `UiState`
    this.uiState.panelProps = props;
    // And set them on the `Panels`
    return this.panelUpdater(props);
  };

  // Symbol validation state
  symbolValidation: SymbolValidation["body"] | null = null;

  // Track whether we're editing a symbol (.sym.svg) or schematic (.sch.svg)
  isSymbolFile: boolean = false;

  // Handle symbol validation message for hierarchical diagram support
  handleSymbolValidation = (msg: SymbolValidation) => {
    // Store the validation data
    this.symbolValidation = msg.body;
    // Track file type
    this.isSymbolFile = msg.body.isSymbol;

    // Build port sync status for the panel (only for symbol files with implementation)
    const portSyncStatus = msg.body.isSymbol && msg.body.hasImplementation
      ? {
          enabled: true,
          symbolPorts: msg.body.symbolPorts,
          unconnectedPorts: msg.body.unconnectedPorts,
        }
      : undefined;

    // Update panel props and visibility based on file type
    this.uiState.panelProps = {
      ...this.uiState.panelProps,
      panelOpen: true, // Always show the tools panel
      isSymbolFile: this.isSymbolFile,
      portSyncStatus,
    };

    // Re-enter idle mode to update control panel items for the correct file type
    this.goUiIdle();
  };
}

// Our sole export: the editor singleton.
export const theEditor = new SchEditor();
