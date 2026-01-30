//
// # Schematics Styling
//
// In the two.js API's terms.
//

import { Path } from "two.js/src/path";
import { Group } from "two.js/src/group";
import { Text } from "two.js/src/text";
import { Line } from "two.js/src/shapes/line";
import { Circle } from "two.js/src/shapes/circle";

export enum ColorTheme {
  Light = "light",
  Dark = "dark",
}

// Theme-aware color palette
const colors = {
  [ColorTheme.Light]: {
    wire: "blue",
    symbol: "black",
    symbolHighlight: "red",
    label: "black",
    labelHighlight: "red",
    portFill: "white",
    portStroke: "black",
    dot: "blue",
    grid: "gray",
    background: "white",
  },
  [ColorTheme.Dark]: {
    wire: "#6699ff",
    symbol: "#e0e0e0",
    symbolHighlight: "#ff6666",
    label: "#e0e0e0",
    labelHighlight: "#ff6666",
    portFill: "#2d2d2d",
    portStroke: "#e0e0e0",
    dot: "#6699ff",
    grid: "#3a3a3a",
    background: "#1e1e1e",
  },
};

// Get color palette for a theme
export function getThemeColors(theme: ColorTheme) {
  return colors[theme];
}

// Current global theme - can be updated by the editor
let currentTheme: ColorTheme = ColorTheme.Light;

export function setCurrentTheme(theme: ColorTheme) {
  currentTheme = theme;
}

export function getCurrentTheme(): ColorTheme {
  return currentTheme;
}

// Apply the `hdl21-wire` styling in two.js terms
export function wireStyle(
  wire: Path,
  highlighted: boolean = false,
  theme: ColorTheme = currentTheme
): Path {
  const palette = colors[theme];
  wire.visible = true;
  wire.closed = false;
  wire.noFill();
  wire.stroke = highlighted ? palette.symbolHighlight : palette.wire;
  wire.linewidth = 2;
  wire.cap = "round";
  wire.join = "round";
  return wire;
}

// Apply the `hdl21-symbols` styling in two.js terms
export function symbolStyle(
  symbol: Group,
  highlighted: boolean = false,
  theme: ColorTheme = currentTheme
): Group {
  const palette = colors[theme];
  symbol.noFill();
  symbol.stroke = highlighted ? palette.symbolHighlight : palette.symbol;
  symbol.linewidth = 2;
  symbol.cap = "round";
  symbol.join = "round";
  return symbol;
}

// Apply the `hdl21-instance-port` styling in two.js terms
export function instacePortStyle(
  port: Circle,
  highlighted: boolean = false,
  theme: ColorTheme = currentTheme
): Circle {
  const palette = colors[theme];
  port.radius = 4;
  port.fill = palette.portFill;
  port.stroke = highlighted ? palette.symbolHighlight : palette.portStroke;
  port.linewidth = 2;
  port.cap = "round";
  port.join = "round";
  return port;
}

// Apply the `hdl21-dot` styling in two.js terms
export function dotStyle(
  circle: Circle,
  highlighted: boolean = false,
  theme: ColorTheme = currentTheme
): Path {
  const palette = colors[theme];
  circle.radius = 4;
  circle.linewidth = 2;
  circle.visible = true;
  circle.stroke = palette.dot;
  circle.fill = palette.dot;
  circle.cap = "round";
  circle.join = "round";
  return circle;
}

// Apply the `hdl21-labels` styling in two.js terms
export function labelStyle(
  textElem: Text,
  highlighted: boolean = false,
  theme: ColorTheme = currentTheme
): Text {
  const palette = colors[theme];
  textElem.family = "Menlo, Monaco, 'Courier New', monospace";
  textElem.style = "normal";
  textElem.weight = 700; // Typical value for "bold"
  textElem.size = 16;
  textElem.noStroke();
  textElem.fill = highlighted ? palette.labelHighlight : palette.label;
  return textElem;
}

// Apply the grid-line styling
export function gridLineStyle(
  line: Line,
  isMajor: boolean,
  theme: ColorTheme = currentTheme
): Line {
  const palette = colors[theme];
  line.stroke = palette.grid;
  line.visible = true;
  line.closed = false;
  line.noFill();
  // Set visible line widths
  if (isMajor) {
    line.linewidth = 2;
  } else {
    line.linewidth = 0.5;
  }
  return line;
}
