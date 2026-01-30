/*
 * # Move Mode Handler
 */

// Local Imports
import { Direction, Place, Point } from "SchematicsCore";
import { Instance, SchPort, Wire, EntityKind, Entity } from "../drawing";
import { nearestOnGrid } from "../drawing/grid";
import { Keys } from "../keys";
import { ChangeKind, Change } from "../changes";
import { SchEditor } from "../editor";
import { UiModes, UiModeHandlerBase } from "./base";

// Info about a single instance/port being moved
interface MovingPlaceable {
  kind: "placeable";
  entity: Instance | SchPort;
  from: Place;
  to: Place;
  offsetX: number;
  offsetY: number;
}

// Info about a wire being moved
interface MovingWire {
  kind: "wire";
  wire: Wire;
  originalPoints: Array<Point>;
  offsetX: number;
  offsetY: number;
}

type MovingEntity = MovingPlaceable | MovingWire;

export class MoveInstance extends UiModeHandlerBase {
  mode: UiModes.MoveInstance = UiModes.MoveInstance;

  // All placeable entities being moved (supports both single and multi-selection)
  movingEntities: MovingPlaceable[];

  // Wires being moved
  movingWires: MovingWire[];

  // The anchor point where the drag started (used for group moves)
  anchorPoint: Point;

  // Track total delta for wire moves
  totalDeltaX: number = 0;
  totalDeltaY: number = 0;

  constructor(
    editor: SchEditor,
    movingEntities: MovingPlaceable[],
    movingWires: MovingWire[],
    anchorPoint: Point
  ) {
    super(editor);
    this.movingEntities = movingEntities;
    this.movingWires = movingWires;
    this.anchorPoint = anchorPoint;
  }

  // Start moving a single placeable entity (Instance or SchPort)
  static start(editor: SchEditor, entity: Instance | SchPort) {
    const place = {
      loc: entity.data.loc,
      orientation: entity.data.orientation,
    };
    const from = structuredClone(place);
    const to = structuredClone(place);
    const anchorPoint = structuredClone(entity.data.loc);

    const movingEntity: MovingPlaceable = {
      kind: "placeable",
      entity,
      from,
      to,
      offsetX: 0,
      offsetY: 0,
    };

    return new MoveInstance(editor, [movingEntity], [], anchorPoint);
  }

  // Start moving a single wire
  static startWire(editor: SchEditor, wire: Wire, clickPoint: Point) {
    const anchorPoint = nearestOnGrid(clickPoint);
    const centroid = wire.getCentroid();

    const movingWire: MovingWire = {
      kind: "wire",
      wire,
      originalPoints: wire.points.map((p) => Point.new(p.x, p.y)),
      offsetX: centroid.x - anchorPoint.x,
      offsetY: centroid.y - anchorPoint.y,
    };

    return new MoveInstance(editor, [], [movingWire], anchorPoint);
  }

  // Start moving a group of entities (instances, ports, and wires)
  static startGroup(
    editor: SchEditor,
    placeables: Array<Instance | SchPort>,
    wires: Array<Wire>,
    clickedPoint: Point
  ) {
    const anchorPoint = nearestOnGrid(clickedPoint);

    const movingEntities: MovingPlaceable[] = placeables.map((entity) => {
      const place = {
        loc: entity.data.loc,
        orientation: entity.data.orientation,
      };
      return {
        kind: "placeable" as const,
        entity,
        from: structuredClone(place),
        to: structuredClone(place),
        offsetX: entity.data.loc.x - anchorPoint.x,
        offsetY: entity.data.loc.y - anchorPoint.y,
      };
    });

    const movingWires: MovingWire[] = wires.map((wire) => {
      const centroid = wire.getCentroid();
      return {
        kind: "wire" as const,
        wire,
        originalPoints: wire.points.map((p) => Point.new(p.x, p.y)),
        offsetX: centroid.x - anchorPoint.x,
        offsetY: centroid.y - anchorPoint.y,
      };
    });

    return new MoveInstance(editor, movingEntities, movingWires, anchorPoint);
  }

  // Update the rendering of an in-progress move.
  updateMove = () => {
    const { editor, movingEntities, movingWires, anchorPoint } = this;
    // Get the new anchor position (snapped to grid)
    const newAnchor = nearestOnGrid(editor.uiState.mousePos.canvas);

    // Calculate delta from original anchor
    const deltaX = newAnchor.x - anchorPoint.x;
    const deltaY = newAnchor.y - anchorPoint.y;

    // Move all placeable entities relative to the new anchor
    for (const moving of movingEntities) {
      const newLoc = Point.new(
        anchorPoint.x + moving.offsetX + deltaX,
        anchorPoint.y + moving.offsetY + deltaY
      );
      const snappedLoc = nearestOnGrid(newLoc);
      moving.to.loc = structuredClone(snappedLoc);
      moving.entity.data.loc = structuredClone(snappedLoc);
      moving.entity.draw();
    }

    // Move all wires - restore original points then apply delta
    for (const moving of movingWires) {
      for (let i = 0; i < moving.wire.points.length; i++) {
        moving.wire.points[i].x = moving.originalPoints[i].x + deltaX;
        moving.wire.points[i].y = moving.originalPoints[i].y + deltaY;
      }
      moving.wire.segments = null;
      moving.wire.draw();
    }

    // Track total delta for change logging
    this.totalDeltaX = deltaX;
    this.totalDeltaY = deltaY;
  };

  // "Commit" a move by placing it in the change log.
  commitMove = () => {
    const { editor, movingEntities, movingWires, totalDeltaX, totalDeltaY } = this;

    // Update dots
    editor.schematic.updateDots();

    // Collect all changes
    const changes: Array<Change> = [];

    // Log changes for placeable entities
    for (const moving of movingEntities) {
      changes.push({
        kind: ChangeKind.Move,
        entity: moving.entity,
        from: moving.from,
        to: moving.to,
      });
    }

    // Log changes for wires
    for (const moving of movingWires) {
      changes.push({
        kind: ChangeKind.MoveWire,
        wire: moving.wire,
        from: moving.originalPoints,
        to: moving.wire.points.map((p) => structuredClone(p)),
      });
    }

    // Log as a batch if multiple changes, otherwise log individually
    if (changes.length > 1) {
      editor.logChange({
        kind: ChangeKind.Batch,
        changes,
      });
    } else if (changes.length === 1) {
      editor.logChange(changes[0]);
    }

    editor.goUiIdle();
  };

  // Handle keystrokes.
  override handleKey = (e: KeyboardEvent) => {
    const { movingEntities, movingWires } = this;
    const totalCount = movingEntities.length + movingWires.length;

    // For single placeable entity (no wires), allow R/H/V transformations
    if (totalCount === 1 && movingEntities.length === 1) {
      const entity = movingEntities[0].entity;
      switch (e.key) {
        case Keys.r:
          return entity.rotate();
        case Keys.v:
          return entity.flip(Direction.Vert);
        case Keys.h:
          return entity.flip(Direction.Horiz);
        default:
          console.log(`Key we dont use: '${e.key}'`);
      }
    } else if (totalCount > 1) {
      // For multiple entities (including wires), use group rotation/flip
      switch (e.key) {
        case Keys.r:
          return this.rotateGroup();
        case Keys.v:
          return this.flipGroup(Direction.Vert);
        case Keys.h:
          return this.flipGroup(Direction.Horiz);
        default:
          console.log(`Key we dont use: '${e.key}'`);
      }
    }
  };

  // Calculate the center of all entities being moved
  private getGroupCenter(): Point {
    const { movingEntities, movingWires } = this;
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (const moving of movingEntities) {
      sumX += moving.entity.data.loc.x;
      sumY += moving.entity.data.loc.y;
      count++;
    }

    for (const moving of movingWires) {
      const centroid = moving.wire.getCentroid();
      sumX += centroid.x;
      sumY += centroid.y;
      count++;
    }

    return nearestOnGrid({
      x: sumX / count,
      y: sumY / count,
    });
  }

  // Rotate all entities in the group around their center
  rotateGroup = () => {
    const { editor, movingEntities, movingWires, anchorPoint } = this;
    const center = this.getGroupCenter();

    // Rotate placeable entities
    for (const moving of movingEntities) {
      const loc = moving.entity.data.loc;
      const dx = loc.x - center.x;
      const dy = loc.y - center.y;
      loc.x = center.x + dy;
      loc.y = center.y - dx;
      moving.entity.data.loc = nearestOnGrid(loc);
      moving.entity.rotate();
      moving.entity.draw();

      // Update offset
      moving.offsetX = moving.entity.data.loc.x - anchorPoint.x;
      moving.offsetY = moving.entity.data.loc.y - anchorPoint.y;
    }

    // Rotate wires
    for (const moving of movingWires) {
      moving.wire.rotateAround(center);
      // Update original points to reflect rotation
      for (let i = 0; i < moving.wire.points.length; i++) {
        moving.originalPoints[i] = Point.new(
          moving.wire.points[i].x,
          moving.wire.points[i].y
        );
      }
    }
  };

  // Flip all entities in the group around their center
  flipGroup = (dir: Direction) => {
    const { editor, movingEntities, movingWires, anchorPoint } = this;
    const center = this.getGroupCenter();
    const horizontal = dir === Direction.Horiz;

    // Flip placeable entities
    for (const moving of movingEntities) {
      const loc = moving.entity.data.loc;

      if (horizontal) {
        const dx = loc.x - center.x;
        loc.x = center.x - dx;
      } else {
        const dy = loc.y - center.y;
        loc.y = center.y - dy;
      }

      moving.entity.data.loc = nearestOnGrid(loc);
      moving.entity.flip(dir);
      moving.entity.draw();

      // Update offset
      moving.offsetX = moving.entity.data.loc.x - anchorPoint.x;
      moving.offsetY = moving.entity.data.loc.y - anchorPoint.y;
    }

    // Flip wires
    for (const moving of movingWires) {
      moving.wire.flipAround(center, horizontal);
      // Update original points to reflect flip
      for (let i = 0; i < moving.wire.points.length; i++) {
        moving.originalPoints[i] = Point.new(
          moving.wire.points[i].x,
          moving.wire.points[i].y
        );
      }
    }
  };

  // Commit the move on mouse-up
  override handleMouseUp = () => this.commitMove();
  // Update the rendering on mouse-move
  override handleMouseMove = () => this.updateMove();

  // On abort, restore all entities to their original locations.
  abort = () => {
    const { editor, movingEntities, movingWires } = this;

    // Restore placeable entities
    for (const moving of movingEntities) {
      moving.entity.data.loc = moving.from.loc;
      moving.entity.data.orientation = moving.from.orientation;
      moving.entity.draw();
    }

    // Restore wires
    for (const moving of movingWires) {
      for (let i = 0; i < moving.wire.points.length; i++) {
        moving.wire.points[i].x = moving.originalPoints[i].x;
        moving.wire.points[i].y = moving.originalPoints[i].y;
      }
      moving.wire.segments = null;
      moving.wire.draw();
    }

    editor.deselect();
    editor.goUiIdle();
  };
}
