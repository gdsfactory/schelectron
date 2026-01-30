/*
 * # Symbol Drawing Mode Handlers
 *
 * Drawing modes for creating symbol graphics:
 * - DrawLine: Draw a line (open path with 2 points)
 * - DrawRect: Draw a rectangle (closed path with 4 points)
 * - DrawCircle: Draw a circle
 */

// NPM Imports
import { Path } from "two.js/src/path";
import { Circle as TwoCircle } from "two.js/src/shapes/circle";
import { Text as TwoText } from "two.js/src/text";

// Local Imports
import { Point } from "SchematicsCore";
import { nearestOnGrid } from "../drawing/grid";
import { SchEditor } from "../editor";
import { UiModes, UiModeHandlerBase } from "./base";
import { getCurrentTheme, getThemeColors } from "../drawing/style";

// Helper to style symbol drawing elements
function styleSymbolPath(path: Path) {
  const colors = getThemeColors(getCurrentTheme());
  path.stroke = colors.symbol;
  path.linewidth = 2;
  path.fill = "transparent";
  path.cap = "round";
  path.join = "round";
}

function styleSymbolCircle(circle: TwoCircle) {
  const colors = getThemeColors(getCurrentTheme());
  circle.stroke = colors.symbol;
  circle.linewidth = 2;
  circle.fill = "transparent";
}

function styleSymbolText(text: TwoText) {
  const colors = getThemeColors(getCurrentTheme());
  text.fill = colors.symbol;
  text.family = "Menlo, Monaco, 'Courier New', monospace";
  text.size = 14;
  text.weight = 400;
  text.alignment = "left";
  text.baseline = "top";
  text.noStroke();
}

// # Draw Line Mode
// Creates an open path with two points
export class DrawLine extends UiModeHandlerBase {
  mode: UiModes.DrawLine = UiModes.DrawLine;
  drawing: Path | null = null;
  startPoint: Point;
  endPoint: Point;

  constructor(editor: SchEditor, startPoint: Point) {
    super(editor);
    this.startPoint = startPoint;
    this.endPoint = structuredClone(startPoint);
  }

  static start(editor: SchEditor): DrawLine {
    const start = nearestOnGrid(editor.uiState.mousePos.canvas);
    const me = new DrawLine(editor, start);
    me.createDrawing();
    me.updatePanels();
    return me;
  }

  createDrawing() {
    const { two, instanceLayer } = this.editor.canvas;
    this.drawing = two.makePath(
      this.startPoint.x, this.startPoint.y,
      this.endPoint.x, this.endPoint.y
    );
    styleSymbolPath(this.drawing);
    instanceLayer.add(this.drawing);
  }

  updateDrawing() {
    if (this.drawing) {
      this.drawing.remove();
    }
    this.createDrawing();
  }

  updatePanels = () => {
    const { panelProps } = this.editor.uiState;
    this.editor.updatePanels({
      ...panelProps,
      controlPanel: { items: [] },
    });
  };

  override handleMouseMove = () => {
    this.endPoint = nearestOnGrid(this.editor.uiState.mousePos.canvas);
    this.updateDrawing();
  };

  override handleMouseUp = () => {
    // Commit the line
    this.endPoint = nearestOnGrid(this.editor.uiState.mousePos.canvas);
    this.updateDrawing();

    // Generate SVG string and save to schematic
    const svgString = `<path d="M ${this.startPoint.x} ${this.startPoint.y} L ${this.endPoint.x} ${this.endPoint.y}" class="hdl21-symbols" />`;
    this.editor.schematic.otherSvgElements.push(svgString);

    // Keep the drawing on the canvas
    this.drawing = null;
    this.editor.sendChangeMessage();
    this.editor.goUiIdle();
  };

  abort = () => {
    if (this.drawing) {
      this.drawing.remove();
    }
    this.editor.goUiIdle();
  };
}

// # Draw Rectangle Mode
// Creates a closed path with four points forming a rectangle
export class DrawRect extends UiModeHandlerBase {
  mode: UiModes.DrawRect = UiModes.DrawRect;
  drawing: Path | null = null;
  startPoint: Point;
  endPoint: Point;

  constructor(editor: SchEditor, startPoint: Point) {
    super(editor);
    this.startPoint = startPoint;
    this.endPoint = structuredClone(startPoint);
  }

  static start(editor: SchEditor): DrawRect {
    const start = nearestOnGrid(editor.uiState.mousePos.canvas);
    const me = new DrawRect(editor, start);
    me.createDrawing();
    me.updatePanels();
    return me;
  }

  createDrawing() {
    const { two, instanceLayer } = this.editor.canvas;
    const { startPoint: s, endPoint: e } = this;
    // Create rectangle as a closed path with 4 corners
    this.drawing = two.makePath(
      s.x, s.y,  // top-left
      e.x, s.y,  // top-right
      e.x, e.y,  // bottom-right
      s.x, e.y   // bottom-left
    );
    this.drawing.closed = true;
    styleSymbolPath(this.drawing);
    instanceLayer.add(this.drawing);
  }

  updateDrawing() {
    if (this.drawing) {
      this.drawing.remove();
    }
    this.createDrawing();
  }

  updatePanels = () => {
    const { panelProps } = this.editor.uiState;
    this.editor.updatePanels({
      ...panelProps,
      controlPanel: { items: [] },
    });
  };

  override handleMouseMove = () => {
    this.endPoint = nearestOnGrid(this.editor.uiState.mousePos.canvas);
    this.updateDrawing();
  };

  override handleMouseUp = () => {
    // Commit the rectangle
    this.endPoint = nearestOnGrid(this.editor.uiState.mousePos.canvas);
    this.updateDrawing();

    // Generate SVG string (closed path with 4 corners) and save to schematic
    const { startPoint: s, endPoint: e } = this;
    const svgString = `<path d="M ${s.x} ${s.y} L ${e.x} ${s.y} L ${e.x} ${e.y} L ${s.x} ${e.y} Z" class="hdl21-symbols" />`;
    this.editor.schematic.otherSvgElements.push(svgString);

    // Keep the drawing on the canvas
    this.drawing = null;
    this.editor.sendChangeMessage();
    this.editor.goUiIdle();
  };

  abort = () => {
    if (this.drawing) {
      this.drawing.remove();
    }
    this.editor.goUiIdle();
  };
}

// # Draw Circle Mode
// Creates a circle from center to edge point
export class DrawCircle extends UiModeHandlerBase {
  mode: UiModes.DrawCircle = UiModes.DrawCircle;
  drawing: TwoCircle | null = null;
  center: Point;
  radius: number = 0;

  constructor(editor: SchEditor, center: Point) {
    super(editor);
    this.center = center;
  }

  static start(editor: SchEditor): DrawCircle {
    const center = nearestOnGrid(editor.uiState.mousePos.canvas);
    const me = new DrawCircle(editor, center);
    me.createDrawing();
    me.updatePanels();
    return me;
  }

  createDrawing() {
    const { two, instanceLayer } = this.editor.canvas;
    this.drawing = two.makeCircle(this.center.x, this.center.y, this.radius);
    styleSymbolCircle(this.drawing);
    instanceLayer.add(this.drawing);
  }

  updateDrawing() {
    if (this.drawing) {
      this.drawing.remove();
    }
    this.createDrawing();
  }

  calculateRadius(): number {
    const mousePos = this.editor.uiState.mousePos.canvas;
    const dx = mousePos.x - this.center.x;
    const dy = mousePos.y - this.center.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  updatePanels = () => {
    const { panelProps } = this.editor.uiState;
    this.editor.updatePanels({
      ...panelProps,
      controlPanel: { items: [] },
    });
  };

  override handleMouseMove = () => {
    this.radius = this.calculateRadius();
    this.updateDrawing();
  };

  override handleMouseUp = () => {
    // Commit the circle
    this.radius = this.calculateRadius();
    this.updateDrawing();

    // Generate SVG string and save to schematic
    const svgString = `<circle cx="${this.center.x}" cy="${this.center.y}" r="${this.radius}" class="hdl21-symbols" fill="none" />`;
    this.editor.schematic.otherSvgElements.push(svgString);

    // Keep the drawing on the canvas
    this.drawing = null;
    this.editor.sendChangeMessage();
    this.editor.goUiIdle();
  };

  abort = () => {
    if (this.drawing) {
      this.drawing.remove();
    }
    this.editor.goUiIdle();
  };
}

// # Line Ready Mode
// Waits for first click to start drawing a line
export class LineReady extends UiModeHandlerBase {
  mode: UiModes.LineReady = UiModes.LineReady;

  static start(editor: SchEditor): LineReady {
    const me = new LineReady(editor);
    me.updatePanels();
    editor.canvas.two.renderer.domElement.style.cursor = "crosshair";
    return me;
  }

  updatePanels = () => {
    const { panelProps } = this.editor.uiState;
    this.editor.updatePanels({
      ...panelProps,
      controlPanel: { items: [] },
    });
  };

  override handleMouseDown = () => {
    this.editor.canvas.two.renderer.domElement.style.cursor = "default";
    this.editor.uiState.modeHandler = DrawLine.start(this.editor);
  };

  override handleKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.abort();
  };

  abort = () => {
    this.editor.canvas.two.renderer.domElement.style.cursor = "default";
    this.editor.goUiIdle();
  };
}

// # Rect Ready Mode
// Waits for first click to start drawing a rectangle
export class RectReady extends UiModeHandlerBase {
  mode: UiModes.RectReady = UiModes.RectReady;

  static start(editor: SchEditor): RectReady {
    const me = new RectReady(editor);
    me.updatePanels();
    editor.canvas.two.renderer.domElement.style.cursor = "crosshair";
    return me;
  }

  updatePanels = () => {
    const { panelProps } = this.editor.uiState;
    this.editor.updatePanels({
      ...panelProps,
      controlPanel: { items: [] },
    });
  };

  override handleMouseDown = () => {
    this.editor.canvas.two.renderer.domElement.style.cursor = "default";
    this.editor.uiState.modeHandler = DrawRect.start(this.editor);
  };

  override handleKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.abort();
  };

  abort = () => {
    this.editor.canvas.two.renderer.domElement.style.cursor = "default";
    this.editor.goUiIdle();
  };
}

// # Circle Ready Mode
// Waits for first click to start drawing a circle
export class CircleReady extends UiModeHandlerBase {
  mode: UiModes.CircleReady = UiModes.CircleReady;

  static start(editor: SchEditor): CircleReady {
    const me = new CircleReady(editor);
    me.updatePanels();
    editor.canvas.two.renderer.domElement.style.cursor = "crosshair";
    return me;
  }

  updatePanels = () => {
    const { panelProps } = this.editor.uiState;
    this.editor.updatePanels({
      ...panelProps,
      controlPanel: { items: [] },
    });
  };

  override handleMouseDown = () => {
    this.editor.canvas.two.renderer.domElement.style.cursor = "default";
    this.editor.uiState.modeHandler = DrawCircle.start(this.editor);
  };

  override handleKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.abort();
  };

  abort = () => {
    this.editor.canvas.two.renderer.domElement.style.cursor = "default";
    this.editor.goUiIdle();
  };
}

// # Text Ready Mode
// Waits for click to place text
export class TextReady extends UiModeHandlerBase {
  mode: UiModes.TextReady = UiModes.TextReady;

  static start(editor: SchEditor): TextReady {
    const me = new TextReady(editor);
    me.updatePanels();
    editor.canvas.two.renderer.domElement.style.cursor = "crosshair";
    return me;
  }

  updatePanels = () => {
    const { panelProps } = this.editor.uiState;
    this.editor.updatePanels({
      ...panelProps,
      controlPanel: { items: [] },
    });
  };

  override handleMouseDown = () => {
    this.editor.canvas.two.renderer.domElement.style.cursor = "text";
    this.editor.uiState.modeHandler = DrawText.start(this.editor);
  };

  override handleKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.abort();
  };

  abort = () => {
    this.editor.canvas.two.renderer.domElement.style.cursor = "default";
    this.editor.goUiIdle();
  };
}

// # Draw Text Mode
// Captures text input at the clicked position
export class DrawText extends UiModeHandlerBase {
  mode: UiModes.DrawText = UiModes.DrawText;
  drawing: TwoText | null = null;
  position: Point;
  textContent: string = "";

  constructor(editor: SchEditor, position: Point) {
    super(editor);
    this.position = position;
  }

  static start(editor: SchEditor): DrawText {
    const pos = nearestOnGrid(editor.uiState.mousePos.canvas);
    const me = new DrawText(editor, pos);
    me.createDrawing();
    me.updatePanels();
    return me;
  }

  createDrawing() {
    const { two, instanceLayer } = this.editor.canvas;
    // Show cursor indicator while typing
    this.drawing = new TwoText(this.textContent + "|", this.position.x, this.position.y);
    styleSymbolText(this.drawing);
    instanceLayer.add(this.drawing);
  }

  updateDrawing() {
    if (this.drawing) {
      this.drawing.remove();
    }
    this.createDrawing();
  }

  updatePanels = () => {
    const { panelProps } = this.editor.uiState;
    this.editor.updatePanels({
      ...panelProps,
      controlPanel: { items: [] },
    });
  };

  override handleKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      return this.commit();
    }
    if (e.key === "Escape") {
      return this.abort();
    }
    if (e.key === "Backspace") {
      this.textContent = this.textContent.slice(0, -1);
      return this.updateDrawing();
    }
    // Add printable characters (single character keys)
    if (e.key.length === 1) {
      this.textContent += e.key;
      return this.updateDrawing();
    }
  };

  commit = () => {
    if (this.textContent.trim().length === 0) {
      return this.abort(); // Don't save empty text
    }

    // Update display to remove cursor
    if (this.drawing) {
      this.drawing.value = this.textContent;
    }

    // Generate SVG string and save to schematic
    const escapedText = this.textContent
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const svgString = `<text x="${this.position.x}" y="${this.position.y}" class="hdl21-symbols">${escapedText}</text>`;
    this.editor.schematic.otherSvgElements.push(svgString);

    this.drawing = null;
    this.editor.canvas.two.renderer.domElement.style.cursor = "default";
    this.editor.sendChangeMessage();
    this.editor.goUiIdle();
  };

  abort = () => {
    if (this.drawing) {
      this.drawing.remove();
    }
    this.editor.canvas.two.renderer.domElement.style.cursor = "default";
    this.editor.goUiIdle();
  };
}
