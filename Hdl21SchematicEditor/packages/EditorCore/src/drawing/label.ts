//
// # Label Drawings
//

// NPM Imports
import { Text } from "two.js/src/text";
import { Vector } from "two.js/src/vector";

// Local Imports
import {
  Orientation,
  Point,
  TextOrientation,
  labelOrientation,
} from "SchematicsCore";
import { theEditor } from "../editor";
import { MousePos } from "../mousepos";
import { Bbox, bbox } from "./bbox";
import { labelStyle } from "./style";
import { EntityInterface, EntityKind } from "./entity";

export enum LabelKind {
  Name = "Name",
  Of = "Of",
}

// Interface to "Label Parents",
// consisting of the notification methods the Label will call on changes.
export interface LabelParent {
  updateLabelText(label: Label): void;
  addLabelDrawing(textElem: Text): void;
  orientation: Orientation;
}

// Two.js-format orientation
// These are fields of the `two.Text` class, declared as an interface type here.
export interface TwoOrientation {
  alignment: "left" | "right";
  rotation: number;
  scale: Vector;
}

// Convert a `TextOrientation` to the two.js equivalent
function toTwoOrientation(orientation: TextOrientation): TwoOrientation {
  const { alignment, reflect } = orientation;
  const scale = new Vector(reflect.horiz ? -1 : 1, reflect.vert ? -1 : 1);
  return { alignment, scale, rotation: 0 };
}

// Calculate and apply an appropriate orientation to a `two.Text`
function orientText(textElem: Text, parent: Orientation, _kind: LabelKind) {
  // Calculate the orientation
  const twoOrient = toTwoOrientation(labelOrientation(parent));
  // And apply it to the `Text`
  textElem.alignment = twoOrient.alignment;
  textElem.rotation = twoOrient.rotation;
  textElem.scale = twoOrient.scale;
}

// # Text Label Data
export interface LabelData {
  text: string;
  loc: Point;
  kind: LabelKind;
  parent: LabelParent;
}

// # Text Label
export class Label implements EntityInterface {
  constructor(public data: LabelData, public drawing: Text) {}
  entityKind: EntityKind.Label = EntityKind.Label;
  bbox: Bbox = bbox.empty();
  highlighted: boolean = false;

  // Create and return a new `Label`
  static create(data: LabelData): Label {
    const drawing = Label.createDrawing(data);
    const label = new Label(data, drawing);
    return label;
  }
  // Create the drawn element from label data
  static createDrawing(data: LabelData): Text {
    const textElem = new Text(data.text);
    orientText(textElem, data.parent.orientation, data.kind);
    textElem.translation.set(data.loc.x, data.loc.y);
    return labelStyle(textElem);
  }
  draw() {
    // Remove any existing drawing and replace it with a new one
    // Note notification to our parent occurs in `create`.
    this.drawing.remove();
    this.drawing = Label.createDrawing(this.data);
    // Add it to our parent
    // Note this must be done *before* we compute the bounding box.
    this.data.parent.addLabelDrawing(this.drawing);
    this.updateBbox();
  }
  // Track whether we're in edit mode (showing cursor)
  private isEditing: boolean = false;

  // Update our text value
  update(text: string) {
    this.data.text = text;
    // Show cursor if in edit mode
    this.drawing.value = this.isEditing ? text + "|" : text;
    this.updateBbox();
    this.data.parent.updateLabelText(this);
  }

  // Show or hide the editing cursor
  showCursor(show: boolean) {
    this.isEditing = show;
    // Update display to show/hide cursor
    this.drawing.value = show ? this.data.text + "|" : this.data.text;
    this.updateBbox();
  }
  updateBbox() {
    const screenBbox = bbox.get(this.drawing);
    // Convert screen bbox to canvas/scene coordinates
    const { zoomScale, panOffset } = theEditor.getTransform();
    this.bbox = {
      left: (screenBbox.left - panOffset.x) / zoomScale,
      right: (screenBbox.right - panOffset.x) / zoomScale,
      top: (screenBbox.top - panOffset.y) / zoomScale,
      bottom: (screenBbox.bottom - panOffset.y) / zoomScale,
    };
  }
  // Boolean indication of whether `mousePos` is inside the label.
  // Uses canvas/scene coordinates to match wire hit testing behavior.
  hitTest = (mousePos: MousePos) => bbox.hitTest(this.bbox, mousePos.canvas);
  // Update styling to indicate highlighted-ness
  highlight() {
    labelStyle(this.drawing, true);
    this.highlighted = true;
  }
  // Update styling to indicate the lack of highlighted-ness
  unhighlight() {
    labelStyle(this.drawing, false);
    this.highlighted = false;
  }
  // Highlight with error styling (red) for unimplemented ports
  highlightError() {
    this.drawing.fill = "#f14c4c"; // Red color for errors
    this.highlighted = true;
  }
  // Abort an in-progress instance.
  abort() {}
  get kind(): LabelKind {
    return this.data.kind;
  }
  get text(): string {
    return this.data.text;
  }
}
