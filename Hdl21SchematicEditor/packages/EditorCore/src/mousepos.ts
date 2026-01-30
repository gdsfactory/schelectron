//
// # Mouse Position
//

// Local Imports
import { Point } from "SchematicsCore";

// # Mouse Position
//
// Including page, screen (canvas-relative), and scene coordinates.
//
export interface MousePos {
  page: Point; // The page position, as reported by the browser.
  screen: Point; // Canvas-relative coordinates (before zoom/pan transform). Used for hit testing with getBoundingClientRect.
  canvas: Point; // Scene coordinates (after zoom/pan transform). Used for placing/moving entities.
}
export const mousepos = {
  // Get a mouse-position at the origin of all coordinate systems.
  // Note this is not necessarily a *valid* mouse-position; the origins generally differ.
  origin: (): MousePos => ({
    page: Point.new(0, 0),
    screen: Point.new(0, 0),
    canvas: Point.new(0, 0),
  }),
};
