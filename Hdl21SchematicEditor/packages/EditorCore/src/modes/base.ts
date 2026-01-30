/*
 * # UI Mode Handler
 * Enumerated Values & Base Class
 */

import { SchEditor } from "../editor";

// # Enumerated UI Modes
export enum UiModes {
  BeforeStartup = "BeforeStartup",
  Idle = "Idle",
  AddInstance = "AddInstance",
  AddPort = "AddPort",
  InstanceReady = "InstanceReady", // Waiting for click to place instance (allows R/H/V)
  PortReady = "PortReady", // Waiting for click to place port (allows R/H/V)
  MoveInstance = "MoveInstance",
  EditLabel = "EditLabel",
  EditPrelude = "EditPrelude",
  DrawWire = "DrawWire",
  WireReady = "WireReady", // Waiting for first click to start wire
  Pan = "Pan",
  RectSelect = "RectSelect", // Rectangle selection mode
  // Symbol drawing modes
  DrawLine = "DrawLine",
  DrawRect = "DrawRect",
  DrawCircle = "DrawCircle",
  DrawText = "DrawText",
  // Symbol drawing "ready" modes (waiting for first click)
  LineReady = "LineReady",
  RectReady = "RectReady",
  CircleReady = "CircleReady",
  TextReady = "TextReady",
}

// # Handler Base Class
export abstract class UiModeHandlerBase {
  // Value from the `UiModes` enum. Must be distinct for each subclass.
  abstract mode: UiModes;

  // Sub-class constructors often take additional data, e.g. an active/ pending entity.
  // All include the parent `SchEditor`.
  constructor(public editor: SchEditor) {}

  // Abort the in-progress operation and return to the `Idle` mode.
  // The result of calling `abort` should be that the UI looks identical
  // to its state as of the moment before the mode was entered.
  abort = () => {};

  // Event handlers, forwarded from the `SchEditor`.
  // Note:
  // (a) These are default-implemented to do nothing. Sub-classes override as needed.
  // (b) The mouse events are not passed the `MouseEvent` object,
  //     but are to use the editor's current mouse position.
  //
  handleKey = (e: KeyboardEvent) => {};
  handleMouseDown = () => {};
  handleMouseUp = () => {};
  handleDoubleClick = () => {};
  handleContextMenu = () => {}; // Right-click handler
  handleMouseMove = () => {};
}
