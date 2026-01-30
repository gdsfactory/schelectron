// # The Platform Interface
//
// The interface between the `SchematicEditor` and the underlying platforms it runs on.
//
export interface Platform {
  // Send a message from the editor to its platform.
  sendMessage: MessageHandler;
  // Register a function to handle messages from the platform to the editor.
  registerMessageHandler(handler: MessageHandler): void;
}

// Type alias for a function that takes a `Message` and returns nothing.
export type MessageHandler = (msg: Message) => void;

/*
 * # Message Types
 */

export enum MessageKind {
  RendererUp = "renderer-up",
  SaveFile = "save-file",
  LoadFile = "load-file",
  LogInMain = "log-in-main",
  Change = "change",
  NewSchematic = "new-schematic",
  AddPdkDevice = "add-pdk-device",
  AddCustomSymbol = "add-custom-symbol",
  SymbolValidation = "symbol-validation",
  OpenSchematic = "open-schematic", // Request to open a schematic file
  RequestContent = "request-content", // Request current schematic content for saving
  RequestFocus = "request-focus", // Request webview to focus for keyboard input
}

// File type enum for distinguishing schematics from symbols
export enum SchematicFileType {
  Schematic = "schematic", // .sch.svg
  Symbol = "symbol", // .sym.svg
}

export type Change = {
  kind: MessageKind.Change;
};
export type RendererUp = {
  kind: MessageKind.RendererUp;
};
export type SaveFile = {
  kind: MessageKind.SaveFile;
  body: string;
};
export type NewSchematic = {
  kind: MessageKind.NewSchematic;
};
export type LogInMain = {
  kind: MessageKind.LogInMain;
};
export type LoadFile = {
  kind: MessageKind.LoadFile;
  body: string;
};

// PDK Device types for component browser integration
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

export type AddPdkDevice = {
  kind: MessageKind.AddPdkDevice;
  body: {
    device: PdkDeviceInfo;
    pdkName: string;
  };
};

// Custom symbol info for hierarchical designs
export interface CustomSymbolInfo {
  name: string;
  path: string;
  ports: string[];
  svgContent?: string; // Optional SVG content of the symbol file
}

export type AddCustomSymbol = {
  kind: MessageKind.AddCustomSymbol;
  body: CustomSymbolInfo;
};

// Symbol validation result - sent to editor when editing .sym.svg files
export interface SymbolPortStatus {
  name: string;
  status: "matched" | "unimplemented" | "unconnected";
  // "matched" - port exists in both symbol and schematic
  // "unimplemented" - port in symbol but not in schematic (symbol defines it, schematic doesn't implement it)
  // "unconnected" - port in schematic but not in symbol (schematic has port not exposed in symbol)
}

export type SymbolValidation = {
  kind: MessageKind.SymbolValidation;
  body: {
    fileType: SchematicFileType;
    isSymbol: boolean;
    hasImplementation: boolean; // Whether the corresponding .sch.svg exists
    implementationPath: string | null; // Path to the .sch.svg file
    symbolPorts: SymbolPortStatus[]; // Ports defined in symbol
    unconnectedPorts: string[]; // Ports in schematic that aren't in symbol ("yet to be connected")
  };
};

// Request to open a component's implementation (sent from editor to extension)
// Extension will check for both .sch.svg and .py files and open appropriately
export type OpenSchematic = {
  kind: MessageKind.OpenSchematic;
  body: {
    symbolPath: string; // Path to the .sym.svg file (used to derive implementation paths)
    componentName: string; // Name of the component (for display purposes)
  };
};

// Request current schematic content (sent from extension to editor, editor responds with SaveFile)
export type RequestContent = {
  kind: MessageKind.RequestContent;
};

// Request webview to focus for keyboard input (sent from extension to editor)
export type RequestFocus = {
  kind: MessageKind.RequestFocus;
};

// The primary `Message` union type.
export type Message =
  | Change
  | RendererUp
  | SaveFile
  | LoadFile
  | NewSchematic
  | LogInMain
  | AddPdkDevice
  | AddCustomSymbol
  | SymbolValidation
  | OpenSchematic
  | RequestContent
  | RequestFocus;
