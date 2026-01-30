// 
// # Schematic Editor Canvas
// 

// NPM Imports
import Two from "two.js";
import { Group } from "two.js/src/group";

// Local Imports
import { Point } from "SchematicsCore";
import { MousePos } from "../mousepos";
import { bbox } from "./bbox";
import { THE_SECRET_CANVAS_ID } from "../secret";
import { SchEditor } from "../editor";

export class Canvas {
  constructor(
    public editor: SchEditor // Reference to the parent Editor
  ) {}

  // Our parent DOM element, set during `attach`.
  parentDomElement: HTMLElement | null = null;
  // Our parent's location, in *page* coordinates.
  parentOriginInPage: Point | null = null;

  // The Two.js "draw-er", canvas, whatever they call it.
  // Attached to `parentDomElement` during `attach`.
  two: Two = new Two({
    // Lotta futzing with these options has found these two to be indispensible.
    fullscreen: false,
    autostart: true,
    // Perhaps some day we can better understand what goes on with the others.
    // Particularly when implementing resizing.
    //
    fitted: true,
    width: window.innerWidth,
    height: window.innerHeight
    // width: 1610,
    // height: 810,
  });

  // The central `Stage`, which contains all content in layered `Group`s.
  stage: Stage = new Stage();

  // Clear everything from the canvas, and recreate our groups and layers.
  clear() {
    this.stage.root.remove();
    this.two.clear();
    this.stage = new Stage();
    this.two.add(this.stage.root);
  }
  // Attach the canvas to our DOM element.
  // This will fail if called before the DOM element is created.
  attach = () => {
    this.two.add(this.stage.root);
    // The "!" here in particular is what will fail if the DOM element is not yet created.
    const e = document.getElementById(THE_SECRET_CANVAS_ID)!;
    this.two.appendTo(e);
    this.parentDomElement = e;

    // Make the element focusable so it can receive keyboard events
    e.setAttribute("tabindex", "0");
    // Remove outline when focused (the canvas doesn't need a focus ring)
    e.style.outline = "none";

    // Make Two.js background transparent so the grid is visible
    // and CSS/JS can control the background color
    const svgElement = this.two.renderer.domElement as SVGElement;
    svgElement.style.background = "transparent";
    const parentBbox = bbox.get(e);
    // Note this also assumes that out `parent` is not *within* any internally-scrollable elements
    // within the page, i.e. that `window.{scrollX, scrollY}` indicates the total scroll offset.
    // Embedding it within sub-scrolling things would require crawling up them, and accumulating their positions.
    this.parentOriginInPage = Point.new(
      parentBbox.left + window.scrollX,
      parentBbox.top + window.scrollY
    );
  };

  // Create a new mouse-position from a `MouseEvent`, or anything else with {pageX, pageY} properties.
  // Fails if the canvas is not attached to a DOM element.
  // Returns coordinates in multiple spaces:
  // - page: browser page coordinates
  // - screen: canvas-relative coordinates (before zoom/pan) - used for hit testing with getBoundingClientRect
  // - canvas: scene coordinates (after zoom/pan transform) - used for placing/moving entities
  newMousePos(e: { pageX: number; pageY: number }): MousePos {
    // Calculate parent origin dynamically to handle layout changes (toolbar, resize, etc.)
    const parentLoc = this.getParentOrigin();
    const page = Point.new(e.pageX, e.pageY);
    // Calculate screen coordinates (relative to the canvas DOM element, before zoom/pan)
    const screenX = page.x - parentLoc.x;
    const screenY = page.y - parentLoc.y;
    const screen = Point.new(screenX, screenY);
    // Convert to scene coordinates by accounting for zoom/pan transform
    const canvas = this.canvasToScene(screenX, screenY);
    return { page, screen, canvas };
  }

  // Get the parent element's origin in page coordinates.
  // Calculated dynamically to handle layout changes.
  getParentOrigin(): Point {
    if (!this.parentDomElement) {
      // Fallback to cached value if element not available
      return this.parentOriginInPage || Point.new(0, 0);
    }
    const parentBbox = bbox.get(this.parentDomElement);
    return Point.new(
      parentBbox.left + window.scrollX,
      parentBbox.top + window.scrollY
    );
  }

  // Convert canvas (screen) coordinates to scene (schematic) coordinates
  // Accounts for the current zoom scale and pan offset
  canvasToScene(canvasX: number, canvasY: number): Point {
    const { zoomScale, panOffset } = this.editor.getTransform();
    const sceneX = (canvasX - panOffset.x) / zoomScale;
    const sceneY = (canvasY - panOffset.y) / zoomScale;
    return Point.new(sceneX, sceneY);
  }

  // Convert scene (schematic) coordinates to canvas (screen) coordinates
  sceneToCanvas(sceneX: number, sceneY: number): Point {
    const { zoomScale, panOffset } = this.editor.getTransform();
    const canvasX = sceneX * zoomScale + panOffset.x;
    const canvasY = sceneY * zoomScale + panOffset.y;
    return Point.new(canvasX, canvasY);
  }

  // Forwarded properties from `stage`.
  get gridLayer() {
    return this.stage.gridLayer;
  }
  get instanceLayer() {
    return this.stage.instanceLayer;
  }
  get wireLayer() {
    return this.stage.wireLayer;
  }
  get dotLayer() {
    return this.stage.dotLayer;
  }

  // Set the background color of the canvas
  setBackgroundColor(color: string) {
    if (this.parentDomElement) {
      this.parentDomElement.style.backgroundColor = color;
    }
  }
}

// # Stage
// A shorthand for our tiered list of drawing groups, including the `root` group which includes all drawn content.
// The point of keeping this separate from `Canvas` is largely that it can be replaced.
// `Canvas` is includes several one-time items, such as the `Two` instance and DOM element.
// When we start or load a new schematic, the `Canvas` stays, but the `Stage` is replaced with a new one.
class Stage {
  // The root group, which contains all drawn content
  root: Group = new Group();

  // The drawing layer groups. These are the basis for our "z-axis" drawing order & priority.
  gridLayer: Group = new Group();
  instanceLayer: Group = new Group();
  wireLayer: Group = new Group();
  dotLayer: Group = new Group();

  // In the custom part of our constructor, set the hierarchical relationship between all these groups:
  // `root` contains all the others.
  constructor() {
    // The order of these call arguments right here sets the background to foreground ordering.
    this.root.add(
      this.gridLayer,
      this.wireLayer,
      this.instanceLayer,
      this.dotLayer
    );
  }
}
