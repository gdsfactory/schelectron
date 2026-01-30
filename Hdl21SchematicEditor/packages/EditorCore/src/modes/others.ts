/*
 * # UI Mode Handlers
 * All the "others" that haven't been filed into modules.
 */

import { Path } from "two.js/src/path";
import { Point } from "SchematicsCore";
import { SchEditor } from "../editor";
import { UiModes, UiModeHandlerBase } from "./base";

// # Before Startup
//
// A dummy handler which does nothing, but allows us to defer our construction-time
// dependencies between the mode handler, editor, and UI state until start-time,
// when all three are fully formed.
//
export class BeforeStartup extends UiModeHandlerBase {
  mode: UiModes.BeforeStartup = UiModes.BeforeStartup;
}

// # Edit Prelude
//
// Actual editing of the text is handled by its input element.
// This mode largely removes the shortcut keys, while retaining the mode-changing control panel list.
//
export class EditPrelude extends UiModeHandlerBase {
  mode: UiModes.EditPrelude = UiModes.EditPrelude;

  // Internal data
  constructor(
    editor: SchEditor,
    public orig: string // Original text, as of mode entry
  ) {
    super(editor);
  }

  // Set the state of the Panels to use ours. Which is to say, none.
  // FIXME: should we keep the `Idle` mode panels instead? 
  // Probably, but it'll require piping some more stuff around. 
  updatePanels = () => {
    const { panelProps } = this.editor.uiState;
    this.editor.updatePanels({
      ...panelProps,
      controlPanel: {
        items: [],
      },
    });
  };

  static start(editor: SchEditor, orig: string) {
    const me = new EditPrelude(editor, orig);
    me.updatePanels();
    return me;
  }
  // Revert to the initial text on abort
  abort = () => {
    this.editor.updateCodePrelude(this.orig);
    this.editor.deselect();
    this.editor.goUiIdle();
  };
}

// # Panning, in the sense of scrolling, Mode
// FIXME: Experimental and not safe for work.
export class Pan extends UiModeHandlerBase {
  mode: UiModes.Pan = UiModes.Pan;
}

// # Rectangle Selection Mode
//
// Allows selecting multiple entities by drawing a selection rectangle.
// Started with shift+click, entities within the rectangle are selected on mouse up.
//
export class RectSelect extends UiModeHandlerBase {
  mode: UiModes.RectSelect = UiModes.RectSelect;

  // Starting point of the selection rectangle (in scene coordinates)
  startPoint: Point;
  // Current end point
  endPoint: Point;
  // The visual selection rectangle (drawn as a Path)
  selectionRect: Path | null = null;

  constructor(editor: SchEditor, startPoint: Point) {
    super(editor);
    this.startPoint = startPoint;
    this.endPoint = Point.new(startPoint.x, startPoint.y);
  }

  static start(editor: SchEditor): RectSelect {
    const startPoint = editor.uiState.mousePos.canvas;
    const me = new RectSelect(editor, Point.new(startPoint.x, startPoint.y));
    me.createSelectionRect();
    return me;
  }

  // Create the visual selection rectangle
  createSelectionRect = () => {
    const { editor, startPoint: s, endPoint: e } = this;
    const { two, dotLayer } = editor.canvas;

    // Create rectangle as a closed path
    this.selectionRect = two.makePath(
      s.x, s.y,  // top-left
      e.x, s.y,  // top-right
      e.x, e.y,  // bottom-right
      s.x, e.y   // bottom-left
    );
    this.selectionRect.closed = true;
    this.selectionRect.stroke = "#007fd4";
    this.selectionRect.linewidth = 1;
    this.selectionRect.fill = "rgba(0, 127, 212, 0.15)";
    (this.selectionRect as any).dashes = [4, 4];
    dotLayer.add(this.selectionRect);
  };

  // Update the selection rectangle as the mouse moves
  updateSelectionRect = () => {
    if (this.selectionRect) {
      this.selectionRect.remove();
    }
    this.createSelectionRect();
  };

  // Update the selection rectangle as the mouse moves
  override handleMouseMove = () => {
    const { editor } = this;
    this.endPoint = editor.uiState.mousePos.canvas;
    this.updateSelectionRect();
  };

  // Complete the selection on mouse up
  override handleMouseUp = () => {
    const { editor, startPoint, endPoint } = this;

    // Calculate selection bounds
    const minX = Math.min(startPoint.x, endPoint.x);
    const maxX = Math.max(startPoint.x, endPoint.x);
    const minY = Math.min(startPoint.y, endPoint.y);
    const maxY = Math.max(startPoint.y, endPoint.y);

    // Find all entities within the selection rectangle
    this.selectEntitiesInRect(minX, minY, maxX, maxY);

    // Remove the selection rectangle
    if (this.selectionRect) {
      this.selectionRect.remove();
      this.selectionRect = null;
    }

    // Return to idle mode
    editor.goUiIdle();
  };

  // Select all entities within the given rectangle
  selectEntitiesInRect = (minX: number, minY: number, maxX: number, maxY: number) => {
    const { editor } = this;
    const { schematic } = editor;

    // First deselect everything
    editor.deselectAll();

    // Check instances
    for (const instance of schematic.instances) {
      const loc = instance.data.loc;
      if (loc.x >= minX && loc.x <= maxX && loc.y >= minY && loc.y <= maxY) {
        editor.addToSelection(instance);
      }
    }

    // Check ports
    for (const port of schematic.ports) {
      const loc = port.data.loc;
      if (loc.x >= minX && loc.x <= maxX && loc.y >= minY && loc.y <= maxY) {
        editor.addToSelection(port);
      }
    }

    // Check wires - select if any point is within the selection
    for (const wire of schematic.wires) {
      const points = wire.points;
      if (points.length >= 1) {
        // Check if any point of the wire is within the selection
        for (const point of points) {
          if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
            editor.addToSelection(wire);
            break;
          }
        }
      }
    }

    // Update the toolbar to show context tools if something is selected
    editor.goUiIdle();
  };

  // Abort: remove the selection rectangle and return to idle
  abort = () => {
    if (this.selectionRect) {
      this.selectionRect.remove();
      this.selectionRect = null;
    }
    this.editor.goUiIdle();
  };
}
