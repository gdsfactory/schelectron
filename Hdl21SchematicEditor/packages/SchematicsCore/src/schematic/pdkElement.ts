//
// # PDK Elements
//
// Factory functions for creating Element definitions from PDK device information.
// PDK elements reuse the standard symbol graphics but have PDK-specific default values.
//

import { Element, ElementKind, ElementMap } from "./element";

// PDK device information types (matches PlatformInterface definitions)
export interface PdkPortInfo {
  name: string;
  direction: string;
}

export interface PdkParamInfo {
  name: string;
  dtype: string;
  default: any;
  description: string;
}

export interface PdkDeviceInfo {
  name: string;
  module_path: string;
  category: string;
  ports: PdkPortInfo[];
  params: PdkParamInfo[];
  symbol_type: string;
}

// Registry for dynamically created PDK elements
const pdkElementRegistry: Map<string, Element> = new Map();

/**
 * Create an Element from PDK device information.
 * Uses the base symbol from the symbol_type, but with PDK-specific defaults.
 */
export function createPdkElement(
  device: PdkDeviceInfo,
  pdkName: string
): Element {
  const registryKey = `${pdkName}:${device.name}`;

  // Check if already registered
  const existing = pdkElementRegistry.get(registryKey);
  if (existing) {
    return existing;
  }

  // Get the base element by symbol type
  const symbolType = device.symbol_type as ElementKind;
  const baseElement = ElementMap.get(symbolType);

  if (!baseElement) {
    // Fallback to Nmos if unknown symbol type
    const fallback = ElementMap.get(ElementKind.Nmos)!;
    console.warn(
      `Unknown symbol type: ${device.symbol_type}, falling back to Nmos`
    );
    return createPdkElementFromBase(fallback, device, pdkName, registryKey);
  }

  return createPdkElementFromBase(baseElement, device, pdkName, registryKey);
}

/**
 * Create a PDK element based on a base element
 */
function createPdkElementFromBase(
  baseElement: Element,
  device: PdkDeviceInfo,
  pdkName: string,
  registryKey: string
): Element {
  // Create the default "of" string with parameters
  const defaultOf = generateDefaultOf(device);

  // Create PDK element based on the base element
  // Note: We use the base element's kind since the editor uses it for symbol lookup
  const pdkElement: Element = {
    kind: baseElement.kind, // Use base element kind for symbol lookup
    svgTag: baseElement.svgTag, // Use base SVG tag
    symbol: baseElement.symbol, // Reuse the base symbol
    nameloc: baseElement.nameloc,
    ofloc: baseElement.ofloc,
    defaultNamePrefix: device.name.toLowerCase().charAt(0),
    defaultOf: defaultOf,
    keyboardShortcut: "", // No keyboard shortcut for PDK devices
    // PDK-specific fields for form generation
    pdkParams: device.params.map((p) => ({
      name: p.name,
      dtype: p.dtype,
      default: p.default,
      description: p.description,
    })),
    pdkDeviceName: device.name,
  };

  // Register it
  pdkElementRegistry.set(registryKey, pdkElement);

  return pdkElement;
}

/**
 * Generate the default "of" string for a PDK device.
 * By default, show no parameters - user can add them via the param editor (double-click).
 */
function generateDefaultOf(device: PdkDeviceInfo): string {
  return `${device.name}()`;
}

/**
 * Format a parameter value for Python code
 */
function formatParamValue(value: any): string {
  if (value === null || value === undefined) {
    return "None";
  }
  if (typeof value === "string") {
    return `"${value}"`;
  }
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }
  if (typeof value === "number") {
    // Format numbers in a readable way
    if (Number.isInteger(value)) {
      return String(value);
    }
    // For very small or large numbers, use scientific notation
    if (Math.abs(value) < 1e-6 || Math.abs(value) > 1e6) {
      return value.toExponential();
    }
    return String(value);
  }
  return String(value);
}

/**
 * Generate the import statement for a PDK device
 */
export function generatePdkImport(
  device: PdkDeviceInfo,
  _pdkName: string
): string {
  // Extract module name from module_path (e.g., "gf180.nmos" -> "gf180")
  const parts = device.module_path.split(".");
  if (parts.length >= 2) {
    const moduleName = parts.slice(0, -1).join(".");
    return `from ${moduleName} import ${device.name}`;
  }
  // Fallback: just import the device directly
  return `from ${device.module_path} import ${device.name}`;
}

/**
 * Get all registered PDK elements
 */
export function getPdkElements(): Element[] {
  return Array.from(pdkElementRegistry.values());
}

/**
 * Clear the PDK element registry (useful for testing)
 */
export function clearPdkElements(): void {
  pdkElementRegistry.clear();
}
