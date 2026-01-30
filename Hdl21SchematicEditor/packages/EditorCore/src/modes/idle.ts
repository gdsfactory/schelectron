/*
 * # Idle Mode Handler
 */

// Local Imports
import { Direction, exhaust, PdkParamInfo, elementLib, portLib } from "SchematicsCore";
import { MessageKind } from "PlatformInterface";

import { EntityKind, Wire, Instance, SchPort } from "../drawing";
import { Keys } from "../keys";
import { SchEditor } from "../editor";
import { ControlPanelItem, ToolbarItem, ToolbarDropdownItem, ToolIcons } from "../panels";

import { UiModes, UiModeHandlerBase } from "./base";
import { AddPort, AddInstance, InstanceReady, PortReady } from "./add";
import { MoveInstance } from "./move";
import { EditLabel } from "./edit_label";
import { DrawWire, WireReady } from "./draw_wire";
import {
  DrawLine, DrawRect, DrawCircle, DrawText,
  LineReady, RectReady, CircleReady, TextReady
} from "./draw_symbol";

// # Idle Mode
//
// The typical state of sitting there, doing nothing.
// Primarily this state waits for actions to enter other modes.
// Clicking on entities selects them.
// Note having something `selected` is orthogonal to `Idle`;
// we can be in this state and have something selected.
//
export class Idle extends UiModeHandlerBase {
  mode: UiModes.Idle = UiModes.Idle;

  static start(editor: SchEditor) {
    const me = new Idle(editor);
    me.updatePanels();
    return me;
  }
  updatePanels = () => {
    const { panelProps } = this.editor.uiState;

    // Build toolbar items based on file type
    let toolbarItems: Array<ToolbarItem>;
    let contextTools: Array<ToolbarItem> = [];

    // Canvas manipulation tools (common to both schematic and symbol)
    const canvasTools: Array<ToolbarItem> = [
      {
        id: "select",
        text: "Select",
        icon: ToolIcons["select"],
        shortcutKey: "Esc",
        onClick: () => this.editor.goUiIdle(),
      },
      {
        id: "rect-select",
        text: "Rectangle Select",
        icon: ToolIcons["rect-select"],
        shortcutKey: "Shift+Drag",
        onClick: () => {}, // Rectangle select is started with shift+drag
      },
      {
        id: "fit-view",
        text: "Fit to View",
        icon: ToolIcons["fit-view"],
        shortcutKey: "0",
        onClick: () => this.editor.fitToView(),
      },
    ];

    if (this.editor.isSymbolFile) {
      // Symbol tools: Draw tools → Port insertion
      toolbarItems = [
        // Draw tools
        {
          id: "draw-line",
          text: "Draw Line",
          icon: ToolIcons["draw-line"],
          shortcutKey: Keys.l,
          onClick: () => this.startDrawLine(),
        },
        {
          id: "draw-rect",
          text: "Draw Rect",
          icon: ToolIcons["draw-rect"],
          shortcutKey: Keys.r,
          onClick: () => this.startDrawRect(),
        },
        {
          id: "draw-circle",
          text: "Draw Circle",
          icon: ToolIcons["draw-circle"],
          shortcutKey: Keys.c,
          onClick: () => this.startDrawCircle(),
        },
        {
          id: "draw-text",
          text: "Draw Text",
          icon: ToolIcons["draw-text"],
          shortcutKey: Keys.t,
          onClick: () => this.startDrawText(),
        },
        // Port insertion
        {
          id: "add-port",
          text: "Add Port",
          icon: ToolIcons["add-port"],
          shortcutKey: Keys.p,
          onClick: () => this.startAddPort(),
          dropdownItems: this.buildPortDropdownItems(),
        },
      ];
    } else {
      // Schematic tools: Wire → Device/Port insertion
      toolbarItems = [
        // Wire tool
        {
          id: "add-wire",
          text: "Add Wire",
          icon: ToolIcons["add-wire"],
          shortcutKey: Keys.w,
          onClick: () => this.enterWireMode(),
        },
        // Device/port insertion
        {
          id: "add-instance",
          text: "Add Instance",
          icon: ToolIcons["add-instance"],
          shortcutKey: Keys.i,
          onClick: () => this.startAddInstance(),
          dropdownItems: this.buildInstanceDropdownItems(),
        },
        {
          id: "add-port",
          text: "Add Port",
          icon: ToolIcons["add-port"],
          shortcutKey: Keys.p,
          onClick: () => this.startAddPort(),
          dropdownItems: this.buildPortDropdownItems(),
        },
      ];
    }

    // Add context tools when any entities are selected
    if (this.editor.hasSelection()) {
      contextTools = [
        {
          id: "rotate",
          text: "Rotate",
          icon: ToolIcons["rotate"],
          shortcutKey: Keys.r,
          onClick: () => this.editor.rotateSelected(),
        },
        {
          id: "flip-h",
          text: "Flip Horizontal",
          icon: ToolIcons["flip-h"],
          shortcutKey: Keys.h,
          onClick: () => this.editor.flipSelected(Direction.Horiz),
        },
        {
          id: "flip-v",
          text: "Flip Vertical",
          icon: ToolIcons["flip-v"],
          shortcutKey: Keys.v,
          onClick: () => this.editor.flipSelected(Direction.Vert),
        },
        {
          id: "delete",
          text: "Delete",
          icon: ToolIcons["delete"],
          shortcutKey: "Del",
          onClick: () => this.editor.deleteSelectedEntities(),
        },
      ];
    }

    this.editor.updatePanels({
      ...panelProps,
      canvasTools,
      toolbarItems,
      contextTools,
      // Keep controlPanel for backwards compatibility
      controlPanel: { items: [] },
    });
  };

  // Build dropdown items for Add Instance
  buildInstanceDropdownItems = (): Array<ToolbarDropdownItem> => {
    return elementLib.list.map((element) => ({
      text: element.kind,
      shortcutKey: element.keyboardShortcut,
      onClick: () => this.startAddInstanceOfKind(element),
    }));
  };

  // Build dropdown items for Add Port
  buildPortDropdownItems = (): Array<ToolbarDropdownItem> => {
    return portLib.list.map((port) => ({
      text: port.kind,
      shortcutKey: port.keyboardShortcut,
      onClick: () => this.startAddPortOfKind(port),
    }));
  };

  // Start InstanceReady mode with a specific element kind
  startAddInstanceOfKind = (element: any) => {
    const { editor } = this;
    // Update lastInstanceData with the selected element, preserving other defaults
    editor.uiState.lastInstanceData = {
      ...editor.uiState.lastInstanceData,
      element,
      kind: element.kind,
      name: element.defaultNamePrefix,
      of: element.defaultOf,
    };
    editor.uiState.modeHandler = InstanceReady.start(editor);
  };

  // Start PortReady mode with a specific port kind
  startAddPortOfKind = (portElement: any) => {
    const { editor } = this;
    // Update lastPortData with the selected port element, preserving other defaults
    editor.uiState.lastPortData = {
      ...editor.uiState.lastPortData,
      portElement,
      kind: portElement.kind,
      name: portElement.defaultName,
    };
    editor.uiState.modeHandler = PortReady.start(editor);
  };
  // Move to the `InstanceReady` mode (preview follows mouse, R/H/V allowed before click).
  startAddInstance = () => {
    const { editor } = this;
    editor.uiState.modeHandler = InstanceReady.start(editor);
  };
  // Move to the `PortReady` mode (preview follows mouse, R/H/V allowed before click).
  startAddPort = () => {
    const { editor } = this;
    editor.uiState.modeHandler = PortReady.start(editor);
  };
  // Enter wire mode - waits for a click before starting to draw.
  // Used by the wire button and keyboard shortcut.
  enterWireMode = () => {
    const { editor } = this;
    editor.uiState.modeHandler = WireReady.start(editor);
  };
  // Move to the `DrawWire` mode immediately at the current mouse position.
  // Used when clicking on a port or dot to start drawing from that location.
  startDrawWire = () => {
    const { editor } = this;
    editor.uiState.modeHandler = DrawWire.start(editor);
  };
  // Move to the `LineReady` mode (waits for first click to start line).
  startDrawLine = () => {
    const { editor } = this;
    editor.uiState.modeHandler = LineReady.start(editor);
  };
  // Move to the `RectReady` mode (waits for first click to start rectangle).
  startDrawRect = () => {
    const { editor } = this;
    editor.uiState.modeHandler = RectReady.start(editor);
  };
  // Move to the `CircleReady` mode (waits for first click to start circle).
  startDrawCircle = () => {
    const { editor } = this;
    editor.uiState.modeHandler = CircleReady.start(editor);
  };
  // Move to the `TextReady` mode (waits for click to place text).
  startDrawText = () => {
    const { editor } = this;
    editor.uiState.modeHandler = TextReady.start(editor);
  };
  // In idle mode, left click selects/moves entities.
  // Wire drawing must be explicitly started via toolbar or keyboard shortcut.
  override handleMouseDown = () => {
    const { editor } = this;
    // Hit test, finding which element was clicked on.
    const whatd_we_hit = editor.whatdWeHit(editor.uiState.mousePos);

    if (!whatd_we_hit) {
      // Hit "blank space" - just deselect (no longer auto-starts wire)
      return editor.deselect();
    }
    // Select the clicked-on entity and react based on its type.
    const { entityKind } = whatd_we_hit;
    switch (entityKind) {
      // "Movable" entities. Start moving them.
      case EntityKind.SchPort:
      case EntityKind.Instance: {
        // Check if this entity is already part of a multi-selection
        const selectedEntities = editor.uiState.selected_entities;
        if (selectedEntities.size > 1 && selectedEntities.has(whatd_we_hit)) {
          // Start moving the entire group (including wires)
          const { placeables, wires } = this.getMovablesFromSelection();
          if (placeables.length + wires.length > 1) {
            editor.uiState.modeHandler = MoveInstance.startGroup(
              editor,
              placeables,
              wires,
              editor.uiState.mousePos.canvas
            );
            return; // Don't change selection
          }
        }
        // Single entity or clicked entity not in selection - start single move
        editor.uiState.modeHandler = MoveInstance.start(editor, whatd_we_hit);
        return editor.select(whatd_we_hit);
      }
      case EntityKind.Label: {
        editor.uiState.modeHandler = EditLabel.start(editor, whatd_we_hit);
        return editor.select(whatd_we_hit);
      }
      case EntityKind.Wire: {
        // Check if this wire is part of a multi-selection
        const selectedEntities = editor.uiState.selected_entities;
        if (selectedEntities.size > 1 && selectedEntities.has(whatd_we_hit)) {
          // Start moving the entire group (including this wire and others)
          const { placeables, wires } = this.getMovablesFromSelection();
          if (placeables.length + wires.length > 1) {
            editor.uiState.modeHandler = MoveInstance.startGroup(
              editor,
              placeables,
              wires,
              editor.uiState.mousePos.canvas
            );
            return; // Don't change selection
          }
        }
        // Single wire - start wire move
        editor.uiState.modeHandler = MoveInstance.startWire(
          editor,
          whatd_we_hit as Wire,
          editor.uiState.mousePos.canvas
        );
        return editor.select(whatd_we_hit);
      }
      case EntityKind.InstancePort: {
        // Start drawing a wire from this port
        editor.deselect();
        return this.startDrawWire();
      }
      case EntityKind.Dot: {
        // Start drawing a wire from this dot
        editor.deselect();
        return this.startDrawWire();
      }
      default:
        throw exhaust(entityKind);
    }
  };

  // Get all movable entities from the current selection, separated by type
  getMovablesFromSelection = (): { placeables: Array<Instance | SchPort>; wires: Array<Wire> } => {
    const { editor } = this;
    const placeables: Array<Instance | SchPort> = [];
    const wires: Array<Wire> = [];
    for (const entity of editor.uiState.selected_entities) {
      if (entity.entityKind === EntityKind.Instance || entity.entityKind === EntityKind.SchPort) {
        placeables.push(entity as Instance | SchPort);
      } else if (entity.entityKind === EntityKind.Wire) {
        wires.push(entity as Wire);
      }
    }
    return { placeables, wires };
  };
  // Handle right-click: just deselect (no auto port insertion)
  override handleContextMenu = () => {
    const { editor } = this;
    editor.deselect();
  };
  // Handle keystrokes.
  override handleKey = (e: KeyboardEvent) => {
    const { editor } = this;

    // All other UI states: check for "command" keystrokes.
    switch (e.key) {
      case Keys.Delete:
      case Keys.Backspace: {
        // Delete the selected entity
        return editor.deleteSelectedEntities();
      }
      // Zoom/Pan keyboard shortcuts
      case "+":
      case "=": // Also handle '=' key for zoom in (no shift needed)
        return editor.zoomIn();
      case "-":
        return editor.zoomOut();
      case "0":
        return editor.fitToView();
      // Mode-Changing Command Keys - different for symbol vs schematic
      case Keys.i:
        if (!editor.isSymbolFile) {
          return this.startAddInstance();
        }
        break;
      case Keys.p:
        return this.startAddPort();
      case Keys.w:
        if (!editor.isSymbolFile) {
          return this.enterWireMode();
        }
        break;
      case Keys.l:
        if (editor.isSymbolFile) {
          return this.startDrawLine();
        }
        break;
      case Keys.c:
        if (editor.isSymbolFile) {
          return this.startDrawCircle();
        }
        break;
      case Keys.t:
        if (editor.isSymbolFile) {
          return this.startDrawText();
        }
        break;
      // Rotation & refelection
      // Note these are versions of rotation & reflection which *are*
      // added to the undo/redo changelog.
      case Keys.r:
        if (editor.isSymbolFile) {
          return this.startDrawRect();
        }
        return editor.rotateSelected();
      case Keys.v:
        return editor.flipSelected(Direction.Vert);
      case Keys.h:
        return editor.flipSelected(Direction.Horiz);
      default:
        // Note this *is not* an exhaustive check, on purpose.
        // There's lots of keys we don't care about!
        // Some day the logging should go away too.
        console.log(`Key we dont use: '${e.key}'`);
    }
  };
  // Handle double-click: open parameter editor for PDK/primitive instances,
  // or navigate to schematic for custom symbol instances
  override handleDoubleClick = () => {
    const { editor } = this;
    const whatd_we_hit = editor.whatdWeHit(editor.uiState.mousePos);

    if (!whatd_we_hit) {
      return;
    }

    const { entityKind } = whatd_we_hit;
    if (entityKind === EntityKind.Instance) {
      const instance = whatd_we_hit as any;
      const element = instance.data.element;

      // Check if this is a custom symbol instance
      if (element?.customSymbolPath) {
        // Navigate to the underlying implementation (schematic or generator)
        const componentName = element.name || instance.data.name || "Component";

        editor.platform.sendMessage({
          kind: MessageKind.OpenSchematic,
          body: {
            symbolPath: element.customSymbolPath,
            componentName,
          },
        });
        return;
      }

      // For PDK devices and primitives, show parameter editor
      this.showParamEditor(instance);
    }
  };

  // Parse the "of" string to extract device name and parameters
  // e.g., "NMOS_3p3V(w=1u, l=180n)" -> { deviceName: "NMOS_3p3V", params: { w: "1u", l: "180n" } }
  parseOfString = (ofStr: string): { deviceName: string; params: Record<string, string> } => {
    const params: Record<string, string> = {};
    const match = ofStr.match(/^([^(]+)\(([^)]*)\)$/);
    if (!match) {
      return { deviceName: ofStr, params };
    }
    const deviceName = match[1].trim();
    const paramStr = match[2].trim();
    if (paramStr) {
      // Parse comma-separated key=value pairs, handling nested parens
      let depth = 0;
      let current = "";
      for (let i = 0; i < paramStr.length; i++) {
        const ch = paramStr[i];
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        else if (ch === "," && depth === 0) {
          const kv = current.trim();
          const eqIdx = kv.indexOf("=");
          if (eqIdx > 0) {
            params[kv.slice(0, eqIdx).trim()] = kv.slice(eqIdx + 1).trim();
          }
          current = "";
          continue;
        }
        current += ch;
      }
      if (current.trim()) {
        const kv = current.trim();
        const eqIdx = kv.indexOf("=");
        if (eqIdx > 0) {
          params[kv.slice(0, eqIdx).trim()] = kv.slice(eqIdx + 1).trim();
        }
      }
    }
    return { deviceName, params };
  };

  // Build the "of" string for storage - includes ALL non-empty parameters
  buildOfStringForStorage = (deviceName: string, params: Record<string, string>): string => {
    const paramParts = Object.entries(params)
      .filter(([_, v]) => v !== "")
      .map(([k, v]) => `${k}=${v}`);
    if (paramParts.length === 0) {
      return `${deviceName}()`;
    }
    return `${deviceName}(${paramParts.join(", ")})`;
  };

  // Build the "of" string for display - only includes visible parameters
  buildOfStringForDisplay = (deviceName: string, params: Record<string, string>, visibleParams: Set<string>): string => {
    const paramParts = Object.entries(params)
      .filter(([k, v]) => v !== "" && visibleParams.has(k))
      .map(([k, v]) => `${k}=${v}`);
    if (paramParts.length === 0) {
      return `${deviceName}()`;
    }
    // Use newlines instead of commas for better readability
    return `${deviceName}(\n${paramParts.join(",\n")})`;
  };

  // Show a floating parameter editor popup for an instance
  showParamEditor = (instance: any) => {
    const { editor } = this;
    const mousePos = editor.uiState.mousePos;

    // Remove any existing popup
    const existing = document.getElementById("param-editor-popup");
    if (existing) {
      existing.remove();
    }

    // Parse current "of" string
    const { deviceName, params: currentParams } = this.parseOfString(instance.data.of || "");

    // Get PDK params from element if available
    const element = instance.data.element;
    const pdkParams: PdkParamInfo[] = element?.pdkParams || [];
    const pdkDeviceName = element?.pdkDeviceName || deviceName;

    // Merge: PDK params provide the template, currentParams provide current values
    const paramInputs: { name: string; value: string; dtype: string; description: string }[] = [];

    if (pdkParams.length > 0) {
      // Use PDK params as the template
      for (const p of pdkParams) {
        paramInputs.push({
          name: p.name,
          value: currentParams[p.name] ?? (p.default != null ? String(p.default) : ""),
          dtype: p.dtype,
          description: p.description,
        });
      }
    } else {
      // No PDK params, use parsed params from the "of" string
      for (const [name, value] of Object.entries(currentParams)) {
        paramInputs.push({ name, value, dtype: "Any", description: "" });
      }
    }

    // Create the popup container
    const popup = document.createElement("div");
    popup.id = "param-editor-popup";
    popup.style.cssText = `
      position: fixed;
      left: ${mousePos.page.x}px;
      top: ${mousePos.page.y}px;
      background: var(--vscode-editor-background, #1e1e1e);
      border: 1px solid var(--vscode-panel-border, #454545);
      border-radius: 4px;
      padding: 12px;
      min-width: 280px;
      max-width: 450px;
      max-height: 400px;
      overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: var(--vscode-font-family, system-ui);
      font-size: 13px;
      color: var(--vscode-editor-foreground, #cccccc);
    `;

    // Prevent scroll wheel from triggering canvas zoom
    popup.addEventListener("wheel", (e: WheelEvent) => {
      e.stopPropagation();
    });

    // Create title row with editable name
    const titleRow = document.createElement("div");
    titleRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--vscode-panel-border, #454545);
    `;

    // Editable name input
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = instance.data.name;
    nameInput.style.cssText = `
      flex: 1;
      padding: 4px 8px;
      background: var(--vscode-input-background, #3c3c3c);
      border: 1px solid var(--vscode-input-border, #3c3c3c);
      color: var(--vscode-input-foreground, #cccccc);
      border-radius: 2px;
      font-family: monospace;
      font-size: 14px;
      font-weight: bold;
    `;

    // Device type label (not editable)
    const deviceLabel = document.createElement("span");
    deviceLabel.style.cssText = `
      color: var(--vscode-descriptionForeground, #888);
      font-size: 13px;
    `;
    deviceLabel.textContent = `: ${pdkDeviceName}`;

    titleRow.appendChild(nameInput);
    titleRow.appendChild(deviceLabel);
    popup.appendChild(titleRow);

    // Track input elements and visibility checkboxes for reading values
    const inputElements: Map<string, HTMLInputElement> = new Map();
    const visibilityCheckboxes: Map<string, HTMLInputElement> = new Map();

    // Create parameter inputs with visibility checkboxes
    if (paramInputs.length > 0) {
      const paramsContainer = document.createElement("div");
      paramsContainer.style.cssText = `margin-bottom: 12px;`;

      // Header row
      const headerRow = document.createElement("div");
      headerRow.style.cssText = `display: flex; align-items: center; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid var(--vscode-panel-border, #454545);`;

      const showHeader = document.createElement("span");
      showHeader.style.cssText = `width: 40px; font-size: 11px; color: var(--vscode-descriptionForeground, #888);`;
      showHeader.textContent = "Show";

      const paramHeader = document.createElement("span");
      paramHeader.style.cssText = `flex: 1; font-size: 11px; color: var(--vscode-descriptionForeground, #888);`;
      paramHeader.textContent = "Parameter";

      headerRow.appendChild(showHeader);
      headerRow.appendChild(paramHeader);
      paramsContainer.appendChild(headerRow);

      for (const param of paramInputs) {
        const row = document.createElement("div");
        row.style.cssText = `display: flex; align-items: center; margin-bottom: 6px;`;

        // Visibility checkbox - checked if param is currently visible in the "of" string
        const visCheckbox = document.createElement("input");
        visCheckbox.type = "checkbox";
        // Persist visibility: check if this param was already in the label (currentParams)
        visCheckbox.checked = param.name in currentParams && currentParams[param.name] !== "";
        visCheckbox.style.cssText = `width: 40px; flex-shrink: 0; margin: 0;`;
        visCheckbox.title = `Show ${param.name} in label`;
        visibilityCheckboxes.set(param.name, visCheckbox);

        const label = document.createElement("label");
        label.style.cssText = `width: 50px; flex-shrink: 0; font-family: monospace; font-size: 12px;`;
        label.textContent = param.name;
        if (param.description) {
          label.title = param.description;
        }

        const input = document.createElement("input");
        input.type = "text";
        input.value = param.value;
        input.placeholder = param.dtype !== "Any" ? param.dtype : "";
        input.style.cssText = `
          flex: 1;
          padding: 4px 8px;
          background: var(--vscode-input-background, #3c3c3c);
          border: 1px solid var(--vscode-input-border, #3c3c3c);
          color: var(--vscode-input-foreground, #cccccc);
          border-radius: 2px;
          font-family: monospace;
          font-size: 12px;
        `;
        inputElements.set(param.name, input);

        row.appendChild(visCheckbox);
        row.appendChild(label);
        row.appendChild(input);
        paramsContainer.appendChild(row);
      }

      popup.appendChild(paramsContainer);
    }

    // Create button row
    const buttonRow = document.createElement("div");
    buttonRow.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    `;

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = `
      padding: 4px 12px;
      background: transparent;
      border: 1px solid var(--vscode-button-border, #454545);
      color: var(--vscode-foreground, #cccccc);
      border-radius: 2px;
      cursor: pointer;
    `;
    cancelBtn.onclick = () => popup.remove();

    const applyBtn = document.createElement("button");
    applyBtn.textContent = "Apply";
    applyBtn.style.cssText = `
      padding: 4px 12px;
      background: var(--vscode-button-background, #0e639c);
      border: none;
      color: var(--vscode-button-foreground, #ffffff);
      border-radius: 2px;
      cursor: pointer;
    `;
    applyBtn.onclick = () => {
      // Update instance name if changed
      const newName = nameInput.value.trim();
      if (newName && newName !== instance.data.name) {
        instance.data.name = newName;
        instance.nameLabel!.update(newName);
        instance.nameLabel!.draw();
      }

      // Collect all parameter values
      const newParams: Record<string, string> = {};
      inputElements.forEach((input, name) => {
        newParams[name] = input.value;
      });

      // Collect which params should be visible in the label
      const visibleParams = new Set<string>();
      visibilityCheckboxes.forEach((checkbox, name) => {
        if (checkbox.checked) {
          visibleParams.add(name);
        }
      });

      // Build "of" string for storage (includes ALL params)
      const ofForStorage = this.buildOfStringForStorage(pdkDeviceName, newParams);
      instance.data.of = ofForStorage;

      // Build "of" string for display (only visible params)
      const ofForDisplay = this.buildOfStringForDisplay(pdkDeviceName, newParams, visibleParams);
      instance.ofLabel!.update(ofForDisplay);
      instance.ofLabel!.draw();
      editor.sendChangeMessage();
      popup.remove();
    };

    buttonRow.appendChild(cancelBtn);
    buttonRow.appendChild(applyBtn);
    popup.appendChild(buttonRow);

    // Add to document
    document.body.appendChild(popup);

    // Focus first input
    const firstInput = inputElements.values().next().value;
    if (firstInput) {
      firstInput.focus();
      firstInput.select();
    }

    // Handle keyboard events
    popup.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        applyBtn.click();
      } else if (e.key === "Escape") {
        popup.remove();
      }
      e.stopPropagation();
    });

    // Close on click outside (after a short delay to avoid immediate close)
    setTimeout(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (!popup.contains(e.target as Node)) {
          popup.remove();
          document.removeEventListener("mousedown", handleClickOutside);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
  };

  // We're already in idle mode.
  // On `abort`, just de-select anything highlighted.
  abort = () => this.editor.deselect();
}
