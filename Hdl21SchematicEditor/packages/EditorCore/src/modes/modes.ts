/*
 * # UI Mode Handlers
 */

// Import all the mode handler implementations.
import { Idle } from "./idle";
import { AddPort, AddInstance, InstanceReady, PortReady } from "./add";
import { MoveInstance } from "./move";
import { DrawWire, WireReady } from "./draw_wire";
import { EditLabel } from "./edit_label";
import { BeforeStartup, EditPrelude, Pan, RectSelect } from "./others";
import {
  DrawLine, DrawRect, DrawCircle, DrawText,
  LineReady, RectReady, CircleReady, TextReady
} from "./draw_symbol";

// The union-type of all the UiModeHandlers.
export type UiModeHandler =
  | BeforeStartup
  | Idle
  | AddInstance
  | AddPort
  | InstanceReady
  | PortReady
  | MoveInstance
  | EditLabel
  | EditPrelude
  | DrawWire
  | WireReady
  | Pan
  | RectSelect
  | DrawLine
  | DrawRect
  | DrawCircle
  | DrawText
  | LineReady
  | RectReady
  | CircleReady
  | TextReady;

// And an object "namespace" for access to them.
export const ModeHandlers = {
  BeforeStartup,
  Idle,
  AddInstance,
  AddPort,
  InstanceReady,
  PortReady,
  MoveInstance,
  EditLabel,
  EditPrelude,
  DrawWire,
  WireReady,
  Pan,
  RectSelect,
  DrawLine,
  DrawRect,
  DrawCircle,
  DrawText,
  LineReady,
  RectReady,
  CircleReady,
  TextReady,
};
