/*
 * # Add Instance/ Port Mode Handler
 */

// Local Imports
import { Element, elementLib, PortElement, portLib, Direction } from "SchematicsCore";
import { Instance, SchPort } from "../drawing";
import { Label, LabelKind } from "../drawing/label";
import { nearestOnGrid } from "../drawing/grid";
import { ChangeKind } from "../changes";
import { SchEditor } from "../editor";
import { ControlPanelItem, ToolbarItem, ToolIcons } from "../panels";
import { UiModes, UiModeHandlerBase } from "./base";

// # Instance Ready Mode
//
// A "waiting" mode that activates when the Add Instance button is clicked.
// Shows a preview of the instance following the mouse.
// Allows R/H/V to rotate/flip before placing.
// Commits on mouse click.
//
export class InstanceReady extends UiModeHandlerBase {
  mode: UiModes.InstanceReady = UiModes.InstanceReady;
  instance: Instance;

  constructor(editor: SchEditor, instance: Instance) {
    super(editor);
    this.instance = instance;
  }

  static start(editor: SchEditor): InstanceReady {
    const { lastInstanceData } = editor.uiState;
    const { element, kind } = lastInstanceData;

    const newInstanceData = {
      name: `${element.defaultNamePrefix}${editor.schematic.num_instances}`,
      of: `${element.defaultOf}`,
      kind,
      element,
      loc: nearestOnGrid(editor.uiState.mousePos.canvas),
      orientation: structuredClone(lastInstanceData.orientation),
    };
    editor.uiState.lastInstanceData = newInstanceData;

    // Create the provisional `Instance`. Note it is *not* added to the schematic yet.
    const instance = Instance.create(newInstanceData);

    // Update our UI state.
    editor.select(instance);

    const me = new InstanceReady(editor, instance);
    me.updatePanels();
    return me;
  }

  updatePanels = () => {
    const { panelProps } = this.editor.uiState;
    this.editor.updatePanels({
      ...panelProps,
      contextTools: this.getContextTools(),
      toolbarItems: this.toolbarItems(),
      controlPanel: {
        items: this.controlPanelItems(),
      },
    });
  };

  // Derive our control panel items from the element list.
  controlPanelItems = (): Array<ControlPanelItem> => {
    const itemFromElement = (element: Element): ControlPanelItem => ({
      text: element.kind,
      icon: null,
      shortcutKey: element.keyboardShortcut,
      onClick: () => this.changeInstanceKind(element),
    });
    return elementLib.list.map(itemFromElement);
  };

  // Derive toolbar items
  toolbarItems = (): Array<ToolbarItem> => {
    return [
      {
        id: "add-instance",
        text: "Add Instance",
        icon: ToolIcons["add-instance"],
        shortcutKey: "i",
        onClick: () => {}, // Already in add mode
        dropdownItems: elementLib.list.map((element) => ({
          text: element.kind,
          shortcutKey: element.keyboardShortcut,
          onClick: () => this.changeInstanceKind(element),
        })),
      },
    ];
  };

  // Get context tools (rotate/flip)
  getContextTools = (): Array<ToolbarItem> => {
    return [
      {
        id: "rotate",
        text: "Rotate",
        icon: ToolIcons["rotate"],
        shortcutKey: "r",
        onClick: () => this.rotate(),
      },
      {
        id: "flip-h",
        text: "Flip Horizontal",
        icon: ToolIcons["flip-h"],
        shortcutKey: "h",
        onClick: () => this.flip(Direction.Horiz),
      },
      {
        id: "flip-v",
        text: "Flip Vertical",
        icon: ToolIcons["flip-v"],
        shortcutKey: "v",
        onClick: () => this.flip(Direction.Vert),
      },
    ];
  };

  // Update the location of our in-progress instance.
  updateLoc = () => {
    this.instance.data.loc = nearestOnGrid(this.editor.uiState.mousePos.canvas);
    this.instance.draw();
  };

  // Update the location on mouse-move.
  override handleMouseMove = () => this.updateLoc();

  // Rotate the pending instance
  rotate = () => {
    this.instance.rotate();
  };

  // Flip the pending instance
  flip = (dir: Direction) => {
    this.instance.flip(dir);
  };

  // Change the kind of the instance.
  changeInstanceKind = (element: Element) => {
    const { instance } = this;

    // Update the instance data
    instance.data.kind = element.kind;
    instance.data.element = element;
    instance.data.name = element.defaultNamePrefix;
    instance.data.of = element.defaultOf;

    // Update its label data
    instance.nameLabel!.data.text = element.defaultNamePrefix;
    instance.nameLabel!.data.loc = element.nameloc;
    instance.ofLabel!.data.text = element.defaultOf;
    instance.ofLabel!.data.loc = element.ofloc;

    // Store this as the last instance data for next time
    this.editor.uiState.lastInstanceData = instance.data;

    // And redraw it
    instance.draw();
  };

  // Handle keystrokes for rotation/flip, element shortcuts, Enter to place, Delete to cancel.
  override handleKey = (e: KeyboardEvent) => {
    switch (e.key) {
      case "r":
        return this.rotate();
      case "h":
        return this.flip(Direction.Horiz);
      case "v":
        return this.flip(Direction.Vert);
      case "Escape":
      case "Delete":
      case "Backspace":
        return this.abort();
      case "Enter":
        return this.commit();
    }
    // Check for element shortcuts
    const element = elementLib.keyboardShortcuts.get(e.key);
    if (element) {
      return this.changeInstanceKind(element);
    }
  };

  // On mouse down, commit the instance.
  override handleMouseDown = () => {
    this.commit();
  };

  // Commit the instance to the schematic and prepare for next instance.
  commit = () => {
    const { editor, instance } = this;
    // Update dots
    editor.schematic.updateDots();
    // Add it to the schematic
    editor.schematic.addEntity(instance);
    // Notify the changeLog and platform of the change
    editor.logChange({ kind: ChangeKind.Add, entity: instance });
    editor.deselect();

    // Store the orientation for the next instance
    const nextOrientation = structuredClone(instance.data.orientation);

    // Increment the instance counter so next instance gets a unique name
    // The num_instances is updated when addEntity is called, so next InstanceReady.start
    // will get the correct incremented name

    // Store the element for next time
    editor.uiState.lastInstanceData = {
      ...instance.data,
      orientation: nextOrientation,
    };

    editor.goUiIdle();
  };

  // On abort, remove the instance and return to Idle.
  abort = () => {
    this.editor.deselect();
    this.instance.abort();
    this.editor.goUiIdle();
  };
}

// # Port Ready Mode
//
// A "waiting" mode that activates when the Add Port button is clicked.
// Shows a preview of the port following the mouse.
// Allows R/H/V to rotate/flip before placing.
// Commits on mouse click.
//
export class PortReady extends UiModeHandlerBase {
  mode: UiModes.PortReady = UiModes.PortReady;
  port: SchPort;

  constructor(editor: SchEditor, port: SchPort) {
    super(editor);
    this.port = port;
  }

  static start(editor: SchEditor): PortReady {
    const { lastPortData } = editor.uiState;
    const { kind, portElement } = lastPortData;

    const newPortData = {
      name: `${portElement.defaultName}`,
      kind,
      portElement,
      loc: nearestOnGrid(editor.uiState.mousePos.canvas),
      orientation: structuredClone(lastPortData.orientation),
    };
    editor.uiState.lastPortData = newPortData;

    // Create the provisional `Port`. Note it is *not* added to the schematic yet.
    const port = SchPort.create(newPortData);

    // Update our UI state.
    editor.select(port);

    const me = new PortReady(editor, port);
    me.updatePanels();
    return me;
  }

  updatePanels = () => {
    const { panelProps } = this.editor.uiState;
    this.editor.updatePanels({
      ...panelProps,
      contextTools: this.getContextTools(),
      toolbarItems: this.toolbarItems(),
      controlPanel: {
        items: this.controlPanelItems(),
      },
    });
  };

  // Derive our control panel items from the port symbols list.
  controlPanelItems = (): Array<ControlPanelItem> => {
    const itemFromElement = (portElement: PortElement): ControlPanelItem => ({
      text: portElement.kind,
      icon: null,
      shortcutKey: portElement.keyboardShortcut,
      onClick: () => this.changePortKind(portElement),
    });
    return portLib.list.map(itemFromElement);
  };

  // Derive toolbar items
  toolbarItems = (): Array<ToolbarItem> => {
    return [
      {
        id: "add-port",
        text: "Add Port",
        icon: ToolIcons["add-port"],
        shortcutKey: "p",
        onClick: () => {}, // Already in add mode
        dropdownItems: portLib.list.map((portElement) => ({
          text: portElement.kind,
          shortcutKey: portElement.keyboardShortcut,
          onClick: () => this.changePortKind(portElement),
        })),
      },
    ];
  };

  // Get context tools (rotate/flip)
  getContextTools = (): Array<ToolbarItem> => {
    return [
      {
        id: "rotate",
        text: "Rotate",
        icon: ToolIcons["rotate"],
        shortcutKey: "r",
        onClick: () => this.rotate(),
      },
      {
        id: "flip-h",
        text: "Flip Horizontal",
        icon: ToolIcons["flip-h"],
        shortcutKey: "h",
        onClick: () => this.flip(Direction.Horiz),
      },
      {
        id: "flip-v",
        text: "Flip Vertical",
        icon: ToolIcons["flip-v"],
        shortcutKey: "v",
        onClick: () => this.flip(Direction.Vert),
      },
    ];
  };

  // Update the location of our in-progress port.
  updateLoc = () => {
    this.port.data.loc = nearestOnGrid(this.editor.uiState.mousePos.canvas);
    this.port.draw();
  };

  // Update the location on mouse-move.
  override handleMouseMove = () => this.updateLoc();

  // Rotate the pending port
  rotate = () => {
    this.port.rotate();
  };

  // Flip the pending port
  flip = (dir: Direction) => {
    this.port.flip(dir);
  };

  // Change the kind of the port.
  changePortKind = (portElement: PortElement) => {
    const { port } = this;

    // Check if user has customized the name (differs from current default)
    const oldDefaultName = port.data.portElement.defaultName;
    const currentName = port.data.name;
    const isUserCustomized = currentName !== oldDefaultName;

    // Update the port data
    port.data.kind = portElement.kind;
    port.data.portElement = portElement;
    // Only reset name if user hasn't customized it
    if (!isUserCustomized) {
      port.data.name = portElement.defaultName;
    }

    // Handle label visibility based on hideLabel flag
    if (portElement.hideLabel) {
      // Remove existing label if switching to a hideLabel port (e.g., GND)
      if (port.nameLabel) {
        port.nameLabel.drawing.remove();
        port.nameLabel = null;
      }
    } else {
      // Port needs a visible label
      if (port.nameLabel) {
        // Update existing label - only reset text if not user-customized
        if (!isUserCustomized) {
          port.nameLabel.data.text = portElement.defaultName;
        }
        port.nameLabel.data.loc = portElement.nameloc;
      } else {
        // Create label if it doesn't exist (switching from hideLabel port)
        port.nameLabel = Label.create({
          text: port.data.name,
          kind: LabelKind.Name,
          loc: portElement.nameloc,
          parent: port,
        });
        port.drawing.labelGroup.add(port.nameLabel.drawing);
      }
    }

    // Store this as the last port data for next time
    this.editor.uiState.lastPortData = port.data;

    // And redraw it
    port.draw();
  };

  // Handle keystrokes for rotation/flip, port element shortcuts, Enter to place, Delete to cancel.
  override handleKey = (e: KeyboardEvent) => {
    switch (e.key) {
      case "r":
        return this.rotate();
      case "h":
        return this.flip(Direction.Horiz);
      case "v":
        return this.flip(Direction.Vert);
      case "Escape":
      case "Delete":
      case "Backspace":
        return this.abort();
      case "Enter":
        return this.commit();
    }
    // Check for port element shortcuts
    const portElement = portLib.keyboardShortcuts.get(e.key);
    if (portElement) {
      return this.changePortKind(portElement);
    }
  };

  // On mouse down, commit the port.
  override handleMouseDown = () => {
    this.commit();
  };

  // Commit the port to the schematic and prepare for next port.
  commit = () => {
    const { editor, port } = this;
    // Update dots
    editor.schematic.updateDots();
    // Add it to the schematic
    editor.schematic.addEntity(port);
    // Notify the changeLog and platform of the change
    editor.logChange({ kind: ChangeKind.Add, entity: port });
    editor.deselect();

    // Store the orientation for the next port
    const nextOrientation = structuredClone(port.data.orientation);

    // Store the port element for next time
    editor.uiState.lastPortData = {
      ...port.data,
      orientation: nextOrientation,
    };

    editor.goUiIdle();
  };

  // On abort, remove the port and return to Idle.
  abort = () => {
    this.editor.deselect();
    this.port.abort();
    this.editor.goUiIdle();
  };
}

// Base Class for shared logic between `AddInstance` and `AddPort`.
abstract class AddBase extends UiModeHandlerBase {
  // Get the Entity being added.
  abstract entity(): Instance | SchPort;

  // On abort, remove the entity and return to `Idle`.
  override abort = () => {
    this.editor.deselect();
    this.entity().abort();
    this.editor.goUiIdle();
  };

  // Get the list of control panel items for this mode.
  abstract controlPanelItems(): Array<ControlPanelItem>;

  // Get toolbar items for this mode.
  abstract toolbarItems(): Array<ToolbarItem>;

  // Set the state of the Panels to use ours.
  updatePanels = () => {
    const { panelProps } = this.editor.uiState;
    this.editor.updatePanels({
      ...panelProps,
      toolbarItems: this.toolbarItems(),
      contextTools: this.getContextTools(), // Include rotate/flip tools
      controlPanel: {
        items: this.controlPanelItems(),
      },
    });
  };

  // Update the location of our in-progress entity.
  updateLoc = () => {
    const entity = this.entity();
    entity.data.loc = nearestOnGrid(this.editor.uiState.mousePos.canvas);
    entity.draw();
  };

  // Update the location on mouse-move.
  override handleMouseMove = () => this.updateLoc();

  // Rotate the pending entity
  rotate = () => {
    const entity = this.entity();
    entity.rotate();
  };

  // Flip the pending entity
  flip = (dir: Direction) => {
    const entity = this.entity();
    entity.flip(dir);
  };

  // Get context tools (rotate/flip) for the pending entity
  getContextTools = (): Array<ToolbarItem> => {
    return [
      {
        id: "rotate",
        text: "Rotate",
        icon: ToolIcons["rotate"],
        shortcutKey: "r",
        onClick: () => this.rotate(),
      },
      {
        id: "flip-h",
        text: "Flip Horizontal",
        icon: ToolIcons["flip-h"],
        shortcutKey: "h",
        onClick: () => this.flip(Direction.Horiz),
      },
      {
        id: "flip-v",
        text: "Flip Vertical",
        icon: ToolIcons["flip-v"],
        shortcutKey: "v",
        onClick: () => this.flip(Direction.Vert),
      },
    ];
  };

  // Add the currently-pending entity to the schematic.
  commit = () => {
    const { editor } = this;
    // FIXME: update dots incrementally, instead of re-inferring them all!
    editor.schematic.updateDots();
    const entity = this.entity();

    // Add it to to the schematic.
    editor.schematic.addEntity(entity);

    // Notify the changeLog and platform of the change.
    editor.logChange({ kind: ChangeKind.Add, entity });

    editor.deselect();
    editor.goUiIdle();
  };

  // Commit the instance on mouse-up, i.e. the end of a click to place it.
  override handleMouseUp = () => this.commit();
}

// # Add Instance Mode
// Tracks the pending Instance, which until `commit` time is not added to the schematic.
export class AddInstance extends AddBase {
  mode: UiModes.AddInstance = UiModes.AddInstance;
  constructor(editor: SchEditor, public instance: Instance) {
    super(editor);
  }

  // Create the provisional `Instance`, using the last one added as a template.
  static start(editor: SchEditor): AddInstance {
    const { lastInstanceData } = editor.uiState;
    const { element, kind } = lastInstanceData;

    const newInstanceData = {
      name: `${element.defaultNamePrefix}${editor.schematic.num_instances}`,
      of: `${element.defaultOf}`,
      kind,
      element,
      loc: nearestOnGrid(editor.uiState.mousePos.canvas),
      orientation: structuredClone(lastInstanceData.orientation),
    };
    editor.uiState.lastInstanceData = newInstanceData;

    // Create the provisional `Instance`. Note it is *not* added to the schematic yet.
    const instance = Instance.create(newInstanceData);

    // Update our UI state.
    editor.select(instance);

    // And draw the instance.
    instance.draw();
    const me = new AddInstance(editor, instance);
    me.updatePanels();
    return me;
  }

  // Derive our control panel items from the element list.
  override controlPanelItems = () => {
    const itemFromElement = (element: Element): ControlPanelItem => ({
      text: element.kind,
      icon: null, // FIXME! get some icons
      shortcutKey: element.keyboardShortcut,
      onClick: () => this.changeInstanceKind(element),
    });
    return elementLib.list.map(itemFromElement);
  };

  // Derive toolbar items - show all elements as a dropdown from Add Instance button
  override toolbarItems = (): Array<ToolbarItem> => {
    return [
      {
        id: "add-instance",
        text: "Add Instance",
        icon: ToolIcons["add-instance"],
        shortcutKey: "i",
        onClick: () => {}, // Already in add mode
        dropdownItems: elementLib.list.map((element) => ({
          text: element.kind,
          shortcutKey: element.keyboardShortcut,
          onClick: () => this.changeInstanceKind(element),
        })),
      },
    ];
  };

  // Handle a keystroke, potentially producing a change of kind or transform.
  override handleKey = (e: KeyboardEvent) => {
    // Check for rotate/flip keys first
    switch (e.key) {
      case "r":
        return this.rotate();
      case "h":
        return this.flip(Direction.Horiz);
      case "v":
        return this.flip(Direction.Vert);
    }
    // Then check for element shortcuts
    const element = elementLib.keyboardShortcuts.get(e.key);
    if (element) {
      return this.changeInstanceKind(element);
    }
  };

  // Change the kind of the instance.
  changeInstanceKind = (element: Element) => {
    const { instance } = this;

    // Update the instance data
    instance.data.kind = element.kind;
    instance.data.element = element;
    instance.data.name = element.defaultNamePrefix;
    instance.data.of = element.defaultOf;

    // Update its label data
    instance.nameLabel!.data.text = element.defaultNamePrefix;
    instance.nameLabel!.data.loc = element.nameloc;
    instance.ofLabel!.data.text = element.defaultOf;
    instance.ofLabel!.data.loc = element.ofloc;

    // Store this as the last instance data for next time
    this.editor.uiState.lastInstanceData = instance.data;

    // And redraw it
    instance.draw();
  };

  // Our entity is our Instance
  entity = () => this.instance;
}

// # Add Port Mode
export class AddPort extends AddBase {
  mode: UiModes.AddPort = UiModes.AddPort;
  constructor(editor: SchEditor, public port: SchPort) {
    super(editor);
  }

  // Create a new Port and start moving it around.
  static start(editor: SchEditor) {
    // Create the provisional `Port`, using the last one added as a template.
    const { lastPortData } = editor.uiState;
    const { kind, portElement } = lastPortData;
    const newPortData = {
      name: `${portElement.defaultName}`,
      kind,
      portElement,
      loc: nearestOnGrid(editor.uiState.mousePos.canvas),
      orientation: structuredClone(lastPortData.orientation),
    };
    editor.uiState.lastPortData = newPortData;

    // Create the provisional `Port`. Note it is *not* added to the schematic yet.
    const port = SchPort.create(newPortData);

    // Update our UI state.
    editor.select(port);

    // And draw the port.
    port.draw();
    const me = new AddPort(editor, port);
    me.updatePanels();
    return me;
  }

  // Derive our control panel items from the port symbols list.
  override controlPanelItems = () => {
    const itemFromElement = (portElement: PortElement): ControlPanelItem => ({
      text: portElement.kind,
      icon: null, // FIXME! get some icons
      shortcutKey: portElement.keyboardShortcut,
      onClick: () => this.changePortKind(portElement),
    });
    return portLib.list.map(itemFromElement);
  };

  // Derive toolbar items - show all port types as a dropdown from Add Port button
  override toolbarItems = (): Array<ToolbarItem> => {
    return [
      {
        id: "add-port",
        text: "Add Port",
        icon: ToolIcons["add-port"],
        shortcutKey: "p",
        onClick: () => {}, // Already in add mode
        dropdownItems: portLib.list.map((portElement) => ({
          text: portElement.kind,
          shortcutKey: portElement.keyboardShortcut,
          onClick: () => this.changePortKind(portElement),
        })),
      },
    ];
  };

  // Handle a keystroke, potentially producing a change of kind or transform.
  override handleKey = (e: KeyboardEvent) => {
    // Check for rotate/flip keys first
    switch (e.key) {
      case "r":
        return this.rotate();
      case "h":
        return this.flip(Direction.Horiz);
      case "v":
        return this.flip(Direction.Vert);
    }
    // Then check for port element shortcuts
    const portElement = portLib.keyboardShortcuts.get(e.key);
    if (portElement) {
      // We hit a shortcut key and have a valid new type
      return this.changePortKind(portElement);
    }
  };

  // Change the `PortKind` of the in-progress `Port`.
  changePortKind = (portElement: PortElement) => {
    const { editor, port } = this;

    // Check if user has customized the name (differs from current default)
    const oldDefaultName = port.data.portElement.defaultName;
    const currentName = port.data.name;
    const isUserCustomized = currentName !== oldDefaultName;

    // Update the port data
    port.data.kind = portElement.kind;
    port.data.portElement = portElement;
    // Only reset name if user hasn't customized it
    if (!isUserCustomized) {
      port.data.name = portElement.defaultName;
    }

    // Handle label visibility based on hideLabel flag
    if (portElement.hideLabel) {
      // Remove existing label if switching to a hideLabel port (e.g., GND)
      if (port.nameLabel) {
        port.nameLabel.drawing.remove();
        port.nameLabel = null;
      }
    } else {
      // Port needs a visible label
      if (port.nameLabel) {
        // Update existing label - only reset text if not user-customized
        if (!isUserCustomized) {
          port.nameLabel.data.text = portElement.defaultName;
        }
        port.nameLabel.data.loc = portElement.nameloc;
      } else {
        // Create label if it doesn't exist (switching from hideLabel port)
        port.nameLabel = Label.create({
          text: port.data.name,
          kind: LabelKind.Name,
          loc: portElement.nameloc,
          parent: port,
        });
        port.drawing.labelGroup.add(port.nameLabel.drawing);
      }
    }

    // Store this as the last port data for next time
    editor.uiState.lastPortData = port.data;

    // And redraw it
    port.draw();
  };

  // Our entity is our Port
  entity = () => this.port;
}
