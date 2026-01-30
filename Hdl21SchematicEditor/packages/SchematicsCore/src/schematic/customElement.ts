//
// # Custom Symbol Elements
//
// Factory functions for creating Element definitions from custom .sym.svg files.
// Custom symbols represent hierarchical modules designed by the user.
//

import { Element, ElementKind, ElementMap } from "./element";
import { Point } from "./point";

// Custom symbol information (matches PlatformInterface definitions)
export interface CustomSymbolInfo {
  name: string;
  path: string;
  ports: string[];
  svgContent?: string; // Optional SVG content of the symbol file
}

// Registry for dynamically created custom symbol elements
const customElementRegistry: Map<string, Element> = new Map();

/**
 * Parse a transform matrix string to extract translation values.
 * Handles "matrix(a b c d e f)" format where e,f are translation.
 * Also handles "translate(x, y)" format.
 */
function parseTransform(transform: string): { x: number; y: number } {
  // Try matrix format: matrix(a b c d e f)
  const matrixMatch = /matrix\s*\(\s*([^\s,]+)[\s,]+([^\s,]+)[\s,]+([^\s,]+)[\s,]+([^\s,]+)[\s,]+([^\s,]+)[\s,]+([^\s,)]+)\s*\)/.exec(transform);
  if (matrixMatch) {
    return {
      x: parseFloat(matrixMatch[5]) || 0,
      y: parseFloat(matrixMatch[6]) || 0,
    };
  }

  // Try translate format: translate(x, y) or translate(x y)
  const translateMatch = /translate\s*\(\s*([^\s,]+)[\s,]+([^\s,)]+)\s*\)/.exec(transform);
  if (translateMatch) {
    return {
      x: parseFloat(translateMatch[1]) || 0,
      y: parseFloat(translateMatch[2]) || 0,
    };
  }

  return { x: 0, y: 0 };
}

/**
 * Extract graphics elements (path, rect, circle, etc.) from SVG content.
 * Returns an array of SVG element strings with hdl21-symbols class added.
 */
function extractGraphicsFromContent(content: string): string[] {
  const graphics: string[] = [];
  const graphicsRegex = /<(path|rect|circle|ellipse|line|polyline|polygon)\s*([^>]*?)\s*(\/?>|>([^<]*)<\/\1>)/gi;

  let match;
  while ((match = graphicsRegex.exec(content)) !== null) {
    const tagName = match[1].toLowerCase();
    let attrs = match[2] || "";
    const closing = match[3];

    // Skip instance port circles (small connection points)
    if (attrs.includes("hdl21-instance-port")) {
      continue;
    }

    // Add hdl21-symbols class if not present
    if (!attrs.includes('class="hdl21-symbols"') && !attrs.includes("class='hdl21-symbols'")) {
      if (attrs.includes('class="')) {
        attrs = attrs.replace('class="', 'class="hdl21-symbols ');
      } else if (attrs.includes("class='")) {
        attrs = attrs.replace("class='", "class='hdl21-symbols ");
      } else {
        attrs = attrs.trim() + ' class="hdl21-symbols"';
      }
    }

    const svgElement = `<${tagName} ${attrs.trim()}${closing.startsWith("/>") ? " />" : closing}`;
    graphics.push(svgElement);
  }

  return graphics;
}

/**
 * Parse SVG content to extract graphics elements and port positions from a .sym.svg file.
 *
 * For symbol files, we need to:
 * 1. Extract port positions (from transform)
 * 2. Extract port symbol graphics (the arrow/diamond shapes) - these ARE the symbol graphics!
 * 3. Extract any other standalone graphics
 */
function parseSymbolSvg(svgContent: string): {
  svgLines: string[];
  portLocations: { name: string; loc: Point }[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
} {
  const svgLines: string[] = [];
  const portLocations: { name: string; loc: Point }[] = [];
  let bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const foundPortNames = new Set<string>();

  // Extract port groups - look for class="hdl21-port" (the actual class used)
  // Port structure: <g class="hdl21-port" transform="matrix(...)"><g class="hdl21-ports-*">...</g><text class="hdl21-port-name">name</text></g>
  //
  // IMPORTANT: For symbol files, the port symbol graphics (arrows, diamonds) ARE the symbol graphics!
  // We extract:
  // 1. Port position from transform
  // 2. Port symbol paths - transformed by the port's position

  // Find all port groups by scanning for <g class="hdl21-port"
  const portStartRegex = /<g[^>]*class="hdl21-port"[^>]*/gi;
  let startMatch;
  while ((startMatch = portStartRegex.exec(svgContent)) !== null) {
    const startIdx = startMatch.index;
    // Extract transform from this tag
    const tagEnd = svgContent.indexOf(">", startIdx);
    const tag = svgContent.substring(startIdx, tagEnd + 1);
    const transformMatch = /transform="([^"]*)"/.exec(tag);
    const transform = transformMatch ? transformMatch[1] : "";

    // Find the matching closing </g> - handle nested groups
    let depth = 1;
    let searchIdx = tagEnd + 1;
    let endIdx = searchIdx;
    while (depth > 0 && searchIdx < svgContent.length) {
      const nextOpen = svgContent.indexOf("<g", searchIdx);
      const nextClose = svgContent.indexOf("</g>", searchIdx);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        searchIdx = nextOpen + 2;
      } else {
        depth--;
        if (depth === 0) {
          endIdx = nextClose;
          const content = svgContent.substring(tagEnd + 1, nextClose);

          // Extract port name from text element
          const nameMatch = /<text[^>]*class="hdl21-port-name"[^>]*>([^<]+)<\/text>/i.exec(content) ||
                           /<text[^>]*>([^<]+)<\/text>/i.exec(content);
          const portName = nameMatch ? nameMatch[1].trim() : "";

          if (portName && !foundPortNames.has(portName)) {
            const pos = parseTransform(transform);
            portLocations.push({ name: portName, loc: Point.new(pos.x, pos.y) });
            foundPortNames.add(portName);

            // Update bounds with port position
            bounds.minX = Math.min(bounds.minX, pos.x);
            bounds.minY = Math.min(bounds.minY, pos.y);
            bounds.maxX = Math.max(bounds.maxX, pos.x);
            bounds.maxY = Math.max(bounds.maxY, pos.y);

            // Add port name label near the port circle
            // Position the label slightly offset from the port position
            // Use a small offset to keep label close but not overlapping the circle
            const labelX = pos.x + 8;
            const labelY = pos.y + 4;
            svgLines.push(
              `<text x="${labelX}" y="${labelY}" class="hdl21-labels" fill="black" font-family="Menlo, Monaco, 'Courier New', monospace" font-weight="bold" font-size="16px">${portName}</text>`
            );
          }
        }
        searchIdx = nextClose + 4;
      }
    }
  }

  // Now extract symbol graphics (not ports, not schematic data, not style)
  let cleanedSvg = svgContent;

  // Remove all port groups - handle both nested and simple structures
  // Nested: <g class="hdl21-port">...<g>...</g>...</g>
  // Simple: <g class="hdl21-port">...</g>
  cleanedSvg = cleanedSvg.replace(/<g[^>]*class="hdl21-port"[^>]*>[\s\S]*?<\/g>(\s*<\/g>)?/gi, "");

  // Remove hdl21:schematic element
  cleanedSvg = cleanedSvg.replace(/<hdl21:schematic[^>]*>[\s\S]*?<\/hdl21:schematic>/gi, "");

  // Remove style and defs sections
  cleanedSvg = cleanedSvg.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  cleanedSvg = cleanedSvg.replace(/<defs[^>]*>[\s\S]*?<\/defs>/gi, "");

  // Remove svg wrapper, rect background, etc.
  cleanedSvg = cleanedSvg.replace(/<\?xml[^>]*\?>/gi, "");
  cleanedSvg = cleanedSvg.replace(/<svg[^>]*>/gi, "");
  cleanedSvg = cleanedSvg.replace(/<\/svg>/gi, "");
  cleanedSvg = cleanedSvg.replace(/<rect[^>]*id="hdl21-schematic-background"[^>]*\/?>(?:<\/rect>)?/gi, "");

  // Remove instance groups (hdl21-instance) - handle both nested and simple
  cleanedSvg = cleanedSvg.replace(/<g[^>]*class="hdl21-instance"[^>]*>[\s\S]*?<\/g>(\s*<\/g>)?/gi, "");

  // Remove wire groups (hdl21-wire)
  cleanedSvg = cleanedSvg.replace(/<g[^>]*class="hdl21-wire"[^>]*>[\s\S]*?<\/g>/gi, "");

  // Remove dots (hdl21-dot)
  cleanedSvg = cleanedSvg.replace(/<circle[^>]*class="hdl21-dot"[^>]*\/?>(?:<\/circle>)?/gi, "");

  // Remove instance port circles
  cleanedSvg = cleanedSvg.replace(/<circle[^>]*class="hdl21-instance-port"[^>]*\/?>(?:<\/circle>)?/gi, "");

  // Remove port name text elements
  cleanedSvg = cleanedSvg.replace(/<text[^>]*class="hdl21-port-name"[^>]*>[\s\S]*?<\/text>/gi, "");

  // Remove empty groups left over after removal
  cleanedSvg = cleanedSvg.replace(/<g[^>]*>\s*<\/g>/gi, "");

  // Remove any remaining group tags (open and close) to flatten the structure
  // This ensures we can find graphics elements that were nested in groups
  cleanedSvg = cleanedSvg.replace(/<g[^>]*>/gi, "");
  cleanedSvg = cleanedSvg.replace(/<\/g>/gi, "");

  // Extract remaining graphics elements (rect, path, circle, ellipse, line, polyline, polygon)
  // But NOT text elements (which are labels)
  const graphicsRegex = /<(rect|path|circle|ellipse|line|polyline|polygon)\s*([^>]*?)\s*(\/?>|>([^<]*)<\/\1>)/gi;

  let graphicsMatch;
  while ((graphicsMatch = graphicsRegex.exec(cleanedSvg)) !== null) {
    const tagName = graphicsMatch[1].toLowerCase();
    let attrs = graphicsMatch[2] || "";
    const closing = graphicsMatch[3];

    // Skip elements that are clearly instance ports or dots
    if (attrs.includes("hdl21-instance-port") || attrs.includes("hdl21-dot")) {
      continue;
    }

    // Skip background rects
    if (attrs.includes("hdl21-schematic-background")) {
      continue;
    }

    // Skip elements with no visual appearance (no stroke AND no fill, or fill:none and stroke:none)
    // But keep elements with explicit stroke or fill colors
    const hasNoStroke = attrs.includes('stroke="none"') || attrs.includes("stroke='none'");
    const hasNoFill = attrs.includes('fill="none"') || attrs.includes("fill='none'");
    // Only skip if BOTH are explicitly set to none AND there's no other styling
    // Actually, don't skip - let the styling be applied by CSS

    // Add hdl21-symbols class if not present
    if (!attrs.includes('class="hdl21-symbols"') && !attrs.includes("class='hdl21-symbols'")) {
      if (attrs.includes('class="')) {
        attrs = attrs.replace('class="', 'class="hdl21-symbols ');
      } else if (attrs.includes("class='")) {
        attrs = attrs.replace("class='", "class='hdl21-symbols ");
      } else {
        attrs = attrs.trim() + ' class="hdl21-symbols"';
      }
    }

    const svgElement = `<${tagName} ${attrs.trim()}${closing.startsWith("/>") ? " />" : closing}`;
    svgLines.push(svgElement);

    // Update bounds based on element positions
    updateBoundsFromElement(tagName, attrs, bounds);
  }

  // If no graphics were found, create a default box
  if (svgLines.length === 0) {
    const defaultWidth = 80;
    const defaultHeight = Math.max(100, portLocations.length * 25 + 20);
    svgLines.push(
      `<rect x="0" y="0" width="${defaultWidth}" height="${defaultHeight}" fill="none" class="hdl21-symbols" />`
    );
    bounds = { minX: 0, minY: 0, maxX: defaultWidth, maxY: defaultHeight };
  }

  // If bounds are still infinite (no valid graphics), use defaults
  if (!isFinite(bounds.minX)) {
    bounds = { minX: 0, minY: 0, maxX: 80, maxY: 100 };
  }

  return { svgLines, portLocations, bounds };
}

/**
 * Update bounds based on SVG element attributes
 */
function updateBoundsFromElement(
  tagName: string,
  attrs: string,
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
): void {
  const getAttr = (name: string): number => {
    const match = new RegExp(`${name}="([^"]*)"`, "i").exec(attrs);
    return match ? parseFloat(match[1]) || 0 : 0;
  };

  switch (tagName) {
    case "rect": {
      const x = getAttr("x");
      const y = getAttr("y");
      const width = getAttr("width");
      const height = getAttr("height");
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x + width);
      bounds.maxY = Math.max(bounds.maxY, y + height);
      break;
    }
    case "circle": {
      const cx = getAttr("cx");
      const cy = getAttr("cy");
      const r = getAttr("r");
      bounds.minX = Math.min(bounds.minX, cx - r);
      bounds.minY = Math.min(bounds.minY, cy - r);
      bounds.maxX = Math.max(bounds.maxX, cx + r);
      bounds.maxY = Math.max(bounds.maxY, cy + r);
      break;
    }
    case "line": {
      const x1 = getAttr("x1");
      const y1 = getAttr("y1");
      const x2 = getAttr("x2");
      const y2 = getAttr("y2");
      bounds.minX = Math.min(bounds.minX, x1, x2);
      bounds.minY = Math.min(bounds.minY, y1, y2);
      bounds.maxX = Math.max(bounds.maxX, x1, x2);
      bounds.maxY = Math.max(bounds.maxY, y1, y2);
      break;
    }
    case "path": {
      // Try to extract some bounds from path d attribute
      const dAttr = attrs.match(/d="([^"]*)"/i);
      if (dAttr) {
        const d = dAttr[1];
        // Extract all numbers that look like coordinates
        const coords = d.match(/-?\d+\.?\d*/g);
        if (coords) {
          for (let i = 0; i < coords.length; i += 2) {
            if (i + 1 < coords.length) {
              const x = parseFloat(coords[i]);
              const y = parseFloat(coords[i + 1]);
              if (!isNaN(x) && !isNaN(y)) {
                bounds.minX = Math.min(bounds.minX, x);
                bounds.minY = Math.min(bounds.minY, y);
                bounds.maxX = Math.max(bounds.maxX, x);
                bounds.maxY = Math.max(bounds.maxY, y);
              }
            }
          }
        }
      }
      break;
    }
  }
}

/**
 * Create an Element from custom symbol information.
 * If SVG content is provided, extracts actual graphics from the symbol.
 * Otherwise creates a generic box symbol.
 *
 * IMPORTANT: When svgContent is provided, always recreates the element
 * to ensure changes are reflected (no caching with new content).
 */
export function createCustomElement(symbolInfo: CustomSymbolInfo): Element {
  const registryKey = symbolInfo.path;

  // Only use cache if NO svgContent is provided
  // When svgContent is provided, always recreate to pick up changes
  if (!symbolInfo.svgContent) {
    const existing = customElementRegistry.get(registryKey);
    if (existing) {
      return existing;
    }
  }

  let svgLines: string[];
  let portLocations: { name: string; loc: Point }[];
  let bounds: { minX: number; minY: number; maxX: number; maxY: number };

  if (symbolInfo.svgContent) {
    // Parse the actual SVG content
    const parsed = parseSymbolSvg(symbolInfo.svgContent);
    svgLines = parsed.svgLines;
    portLocations = parsed.portLocations;
    bounds = parsed.bounds;

    // If no port locations were found in SVG, create default positions from port names
    if (portLocations.length === 0 && symbolInfo.ports.length > 0) {
      portLocations = createDefaultPortLocations(symbolInfo.ports, bounds);
    }
  } else {
    // Create a generic box-style symbol (fallback)
    const result = createGenericBoxSymbol(symbolInfo.ports);
    svgLines = result.svgLines;
    portLocations = result.portLocations;
    bounds = result.bounds;
  }

  // Use Nmos as the base kind (for SVG tag compatibility)
  const baseElement = ElementMap.get(ElementKind.Nmos)!;

  const customElement: Element = {
    kind: baseElement.kind, // Using Nmos as fallback kind
    svgTag: `custom-${symbolInfo.name.toLowerCase()}`,
    symbol: {
      graphics: [],
      svgLines: svgLines,
      ports: portLocations,
    },
    nameloc: Point.new(bounds.maxX + 5, bounds.minY + 10),
    ofloc: Point.new(bounds.maxX + 5, bounds.maxY - 10),
    defaultNamePrefix: symbolInfo.name.toLowerCase().charAt(0),
    defaultOf: `${symbolInfo.name}()`,
    keyboardShortcut: "", // No keyboard shortcut for custom symbols
    customSymbolPath: symbolInfo.path, // Store the path to the symbol file
  };

  // Register it (always update when svgContent was provided)
  customElementRegistry.set(registryKey, customElement);

  return customElement;
}

/**
 * Create default port locations when SVG doesn't contain port position info
 */
function createDefaultPortLocations(
  ports: string[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
): { name: string; loc: Point }[] {
  const portLocations: { name: string; loc: Point }[] = [];
  const height = bounds.maxY - bounds.minY;

  // Split ports between left and right sides
  const leftPorts: string[] = [];
  const rightPorts: string[] = [];
  for (let i = 0; i < ports.length; i++) {
    if (i % 2 === 0) {
      leftPorts.push(ports[i]);
    } else {
      rightPorts.push(ports[i]);
    }
  }

  // Add left side ports
  const leftSpacing = height / (leftPorts.length + 1);
  for (let i = 0; i < leftPorts.length; i++) {
    const y = bounds.minY + leftSpacing * (i + 1);
    portLocations.push({ name: leftPorts[i], loc: Point.new(bounds.minX - 10, y) });
  }

  // Add right side ports
  const rightSpacing = height / (rightPorts.length + 1);
  for (let i = 0; i < rightPorts.length; i++) {
    const y = bounds.minY + rightSpacing * (i + 1);
    portLocations.push({ name: rightPorts[i], loc: Point.new(bounds.maxX + 10, y) });
  }

  return portLocations;
}

/**
 * Create a generic box symbol (fallback when no SVG content is provided)
 */
function createGenericBoxSymbol(ports: string[]): {
  svgLines: string[];
  portLocations: { name: string; loc: Point }[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
} {
  const numPorts = ports.length;
  const boxHeight = Math.max(100, numPorts * 20 + 20);
  const boxWidth = 80;

  const svgLines = [
    `<rect x="0" y="0" width="${boxWidth}" height="${boxHeight}" fill="none" class="hdl21-symbols" />`,
  ];

  const portLocations: { name: string; loc: Point }[] = [];
  const leftPorts: string[] = [];
  const rightPorts: string[] = [];

  for (let i = 0; i < ports.length; i++) {
    if (i % 2 === 0) {
      leftPorts.push(ports[i]);
    } else {
      rightPorts.push(ports[i]);
    }
  }

  // Add left side ports
  const leftSpacing = boxHeight / (leftPorts.length + 1);
  for (let i = 0; i < leftPorts.length; i++) {
    const y = leftSpacing * (i + 1);
    portLocations.push({ name: leftPorts[i], loc: Point.new(-10, y) });
    svgLines.push(
      `<path d="M 0 ${y} L -10 ${y}" class="hdl21-symbols" />`
    );
  }

  // Add right side ports
  const rightSpacing = boxHeight / (rightPorts.length + 1);
  for (let i = 0; i < rightPorts.length; i++) {
    const y = rightSpacing * (i + 1);
    portLocations.push({ name: rightPorts[i], loc: Point.new(boxWidth + 10, y) });
    svgLines.push(
      `<path d="M ${boxWidth} ${y} L ${boxWidth + 10} ${y}" class="hdl21-symbols" />`
    );
  }

  return {
    svgLines,
    portLocations,
    bounds: { minX: -10, minY: 0, maxX: boxWidth + 10, maxY: boxHeight },
  };
}

/**
 * Get all registered custom elements
 */
export function getCustomElements(): Element[] {
  return Array.from(customElementRegistry.values());
}

/**
 * Clear the custom element registry (useful for testing or refreshing)
 */
export function clearCustomElements(): void {
  customElementRegistry.clear();
}

/**
 * Remove a specific custom element from the registry
 */
export function removeCustomElement(path: string): void {
  customElementRegistry.delete(path);
}
