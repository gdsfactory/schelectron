// 
// # Wire Drawings
// 

// NPM Imports
import { Path } from "two.js/src/path";

// Local Imports
import {
  Point,
  ManhattanSegment,
  hitTestSegment,
  calcSegments,
} from "SchematicsCore";
import { EntityInterface, EntityKind } from "./entity";
import { wireStyle, getCurrentTheme, getThemeColors } from "./style";
import { Canvas } from "./canvas";
import { MousePos } from "../mousepos";
import { Dot, DotParent } from "./dot";
import { theEditor } from "../editor";

// Wrapper for hit-testing the pointer against drawn wire segements,
// with tolerance equal to their drawn width.
const hitTestDrawnSegment = (seg: ManhattanSegment, pt: Point): boolean => {
  const HIT_TEST_WIDTH = 5; // Equal to half the drawn width.
  return hitTestSegment(seg, pt, HIT_TEST_WIDTH);
};

export class Wire implements EntityInterface, DotParent {
  constructor(public points: Array<Point>) {}

  entityKind: EntityKind.Wire = EntityKind.Wire;
  drawing: Path | null = null; // FIXME: get rid of the null case
  highlighted: boolean = false;
  segments: Array<ManhattanSegment> | null = null;
  canvas: Canvas = theEditor.canvas; // Reference to the drawing canvas. FIXME: the "the" part.
  dots: Set<Dot> = new Set();

  static create(points: Array<Point>): Wire {
    return new Wire(points);
  }
  // Create from a list of `Point`s. Primarily creates the drawn `Path`.
  draw() {
    if (this.drawing) {
      // Remove any existing drawing
      this.drawing.remove();
      this.drawing = null;
    }
    // Flatten coordinates into the form [x1, y1, x2, y2, ...]
    let coords = [];
    for (let point of this.points) {
      coords.push(point.x, point.y);
    }
    // Create the drawing
    this.drawing = this.canvas.two.makePath(...coords);
    this.canvas.wireLayer.add(this.drawing);
    // Set the wire style
    wireStyle(this.drawing);

    if (this.highlighted) {
      this.highlight();
    }
  }
  // Abort drawing an in-progress wire.
  abort() {
    this.drawing?.remove();
  }
  // Update styling to indicate highlighted-ness
  highlight() {
    if (!this.drawing) {
      return; // FIXME!
    }
    const colors = getThemeColors(getCurrentTheme());
    this.drawing.stroke = colors.symbolHighlight;
    this.highlighted = true;
  }
  // Update styling to indicate the lack of highlighted-ness
  unhighlight() {
    if (!this.drawing) {
      return; // FIXME!
    }
    const colors = getThemeColors(getCurrentTheme());
    this.drawing.stroke = colors.wire;
    this.highlighted = false;
  }
  // Boolean indication of whether `point` lands on the wire. i.e. on any of its segments.
  hitTest(mousePos: MousePos): boolean {
    this.updateSegments();
    if (!this.segments) {
      return false;
    }
    return this.segments.some((segment) =>
      hitTestDrawnSegment(segment, mousePos.canvas)
    );
  }
  updateSegments() {
    if (!this.segments) {
      this.segments = calcSegments(this.points);
    }
  }
  removeDot(dot: Dot): void {
    this.dots.delete(dot);
  }

  // Move all wire points by the given delta
  moveBy(deltaX: number, deltaY: number): void {
    for (const point of this.points) {
      point.x += deltaX;
      point.y += deltaY;
    }
    // Invalidate cached segments so they're recalculated
    this.segments = null;
    this.draw();
  }

  // Get the centroid of the wire (average of all points)
  getCentroid(): Point {
    let sumX = 0;
    let sumY = 0;
    for (const point of this.points) {
      sumX += point.x;
      sumY += point.y;
    }
    return Point.new(sumX / this.points.length, sumY / this.points.length);
  }

  // Rotate all wire points 90° clockwise around a center point
  rotateAround(center: Point): void {
    for (const point of this.points) {
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      // Clockwise 90° rotation: (x, y) -> (y, -x) relative to center
      point.x = center.x + dy;
      point.y = center.y - dx;
    }
    this.segments = null;
    this.draw();
  }

  // Flip all wire points around a center point
  flipAround(center: Point, horizontal: boolean): void {
    for (const point of this.points) {
      if (horizontal) {
        // Horizontal flip: reflect x coordinate around center
        const dx = point.x - center.x;
        point.x = center.x - dx;
      } else {
        // Vertical flip: reflect y coordinate around center
        const dy = point.y - center.y;
        point.y = center.y - dy;
      }
    }
    this.segments = null;
    this.draw();
  }
}
