/**
 * PdkExplorerProvider - TreeView provider for component browser
 *
 * Displays:
 * - Primitives (built-in HDL21 elements)
 * - Project Symbols (workspace .sym.svg files)
 * - Installed PDKs and their devices
 *
 * Hierarchy: Section → Category/PDK → Device
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { PythonBridge, PdkInfo, DeviceInfo } from "./PythonBridge";

// Store extension context for icon paths
let extensionContext: vscode.ExtensionContext;

// Interface for project symbol info
interface ProjectSymbol {
  name: string;
  path: string;
  ports: string[];
}

// Built-in HDL21 primitives - these don't need a PDK
const PRIMITIVES_LIBRARY: DeviceInfo[] = [
  // Transistors
  {
    name: "Nmos",
    module_path: "hdl21.primitives",
    category: "transistors",
    ports: [
      { name: "d", direction: "inout" },
      { name: "g", direction: "inout" },
      { name: "s", direction: "inout" },
      { name: "b", direction: "inout" },
    ],
    params: [],
    symbol_type: "Nmos",
  },
  {
    name: "Pmos",
    module_path: "hdl21.primitives",
    category: "transistors",
    ports: [
      { name: "d", direction: "inout" },
      { name: "g", direction: "inout" },
      { name: "s", direction: "inout" },
      { name: "b", direction: "inout" },
    ],
    params: [],
    symbol_type: "Pmos",
  },
  {
    name: "Npn",
    module_path: "hdl21.primitives",
    category: "transistors",
    ports: [
      { name: "c", direction: "inout" },
      { name: "b", direction: "inout" },
      { name: "e", direction: "inout" },
    ],
    params: [],
    symbol_type: "Npn",
  },
  {
    name: "Pnp",
    module_path: "hdl21.primitives",
    category: "transistors",
    ports: [
      { name: "c", direction: "inout" },
      { name: "b", direction: "inout" },
      { name: "e", direction: "inout" },
    ],
    params: [],
    symbol_type: "Pnp",
  },
  // Passives
  {
    name: "Res",
    module_path: "hdl21.primitives",
    category: "passives",
    ports: [
      { name: "p", direction: "inout" },
      { name: "n", direction: "inout" },
    ],
    params: [],
    symbol_type: "Res",
  },
  {
    name: "Res3",
    module_path: "hdl21.primitives",
    category: "passives",
    ports: [
      { name: "p", direction: "inout" },
      { name: "n", direction: "inout" },
      { name: "b", direction: "inout" },
    ],
    params: [],
    symbol_type: "Res3",
  },
  {
    name: "Cap",
    module_path: "hdl21.primitives",
    category: "passives",
    ports: [
      { name: "p", direction: "inout" },
      { name: "n", direction: "inout" },
    ],
    params: [],
    symbol_type: "Cap",
  },
  {
    name: "Cap3",
    module_path: "hdl21.primitives",
    category: "passives",
    ports: [
      { name: "p", direction: "inout" },
      { name: "n", direction: "inout" },
      { name: "b", direction: "inout" },
    ],
    params: [],
    symbol_type: "Cap3",
  },
  {
    name: "Ind",
    module_path: "hdl21.primitives",
    category: "passives",
    ports: [
      { name: "p", direction: "inout" },
      { name: "n", direction: "inout" },
    ],
    params: [],
    symbol_type: "Ind",
  },
  {
    name: "Ind3",
    module_path: "hdl21.primitives",
    category: "passives",
    ports: [
      { name: "p", direction: "inout" },
      { name: "n", direction: "inout" },
      { name: "b", direction: "inout" },
    ],
    params: [],
    symbol_type: "Ind3",
  },
  // Diodes
  {
    name: "Diode",
    module_path: "hdl21.primitives",
    category: "diodes",
    ports: [
      { name: "p", direction: "inout" },
      { name: "n", direction: "inout" },
    ],
    params: [],
    symbol_type: "Diode",
  },
  // Sources
  {
    name: "Vsource",
    module_path: "hdl21.primitives",
    category: "sources",
    ports: [
      { name: "p", direction: "inout" },
      { name: "n", direction: "inout" },
    ],
    params: [],
    symbol_type: "Vsource",
  },
  {
    name: "Vsource4",
    module_path: "hdl21.primitives",
    category: "sources",
    ports: [
      { name: "p", direction: "inout" },
      { name: "n", direction: "inout" },
      { name: "cp", direction: "inout" },
      { name: "cn", direction: "inout" },
    ],
    params: [],
    symbol_type: "Vsource4",
  },
  {
    name: "Isource",
    module_path: "hdl21.primitives",
    category: "sources",
    ports: [
      { name: "p", direction: "inout" },
      { name: "n", direction: "inout" },
    ],
    params: [],
    symbol_type: "Isource",
  },
  {
    name: "Isource4",
    module_path: "hdl21.primitives",
    category: "sources",
    ports: [
      { name: "p", direction: "inout" },
      { name: "n", direction: "inout" },
      { name: "cp", direction: "inout" },
      { name: "cn", direction: "inout" },
    ],
    params: [],
    symbol_type: "Isource4",
  },
];

// Create a fake "Primitives" PDK for the built-in elements
const PRIMITIVES_PDK: PdkInfo = {
  name: "Primitives",
  version: "hdl21",
  description: "Built-in HDL21 primitive elements",
  devices: PRIMITIVES_LIBRARY,
};

// Tree item types
type PdkTreeItem = PdkNode | CategoryNode | DeviceNode | ProjectSymbolsNode | ProjectSymbolNode;

/**
 * Root-level PDK node
 */
class PdkNode extends vscode.TreeItem {
  constructor(public readonly pdk: PdkInfo) {
    super(pdk.name, vscode.TreeItemCollapsibleState.Collapsed);

    this.description = `v${pdk.version}`;
    this.tooltip = new vscode.MarkdownString(
      `**${pdk.name}**\n\n${pdk.description || "HDL21 PDK"}\n\n` +
        `Version: ${pdk.version}\n` +
        `Devices: ${pdk.devices.length}`
    );
    this.contextValue = "pdk";
    this.iconPath = new vscode.ThemeIcon("package");
  }
}

/**
 * Category grouping node (transistors, passives, etc.)
 */
class CategoryNode extends vscode.TreeItem {
  constructor(
    public readonly category: string,
    public readonly pdkName: string,
    public readonly devices: DeviceInfo[]
  ) {
    super(
      CategoryNode.formatCategoryName(category),
      vscode.TreeItemCollapsibleState.Collapsed
    );

    this.description = `(${devices.length})`;
    this.contextValue = "category";
    this.iconPath = new vscode.ThemeIcon(CategoryNode.getCategoryIcon(category));
  }

  private static formatCategoryName(category: string): string {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  private static getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      transistors: "symbol-event",
      passives: "symbol-constant",
      diodes: "triangle-right",
      sources: "zap",
      other: "symbol-misc",
    };
    return icons[category] || "folder";
  }
}

/**
 * Device leaf node
 */
class DeviceNode extends vscode.TreeItem {
  constructor(
    public readonly device: DeviceInfo,
    public readonly pdkName: string
  ) {
    super(device.name, vscode.TreeItemCollapsibleState.None);

    this.description = `${device.ports.length} ports`;
    this.tooltip = this.createTooltip();
    this.contextValue = "device";

    // Use custom schematic symbol icons
    const iconFile = DeviceNode.getSymbolIconFile(device.symbol_type);
    this.iconPath = {
      light: vscode.Uri.file(
        path.join(extensionContext.extensionPath, "icons", "light", iconFile)
      ),
      dark: vscode.Uri.file(
        path.join(extensionContext.extensionPath, "icons", "dark", iconFile)
      ),
    };

    // Set command to add device when clicked
    this.command = {
      command: "hdl21.pdk.addDevice",
      title: "Add to Schematic",
      arguments: [this.device, this.pdkName],
    };
  }

  private createTooltip(): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`### ${this.device.name}\n\n`);
    md.appendMarkdown(`\`${this.device.module_path}\`\n\n`);

    // Show ports inline
    if (this.device.ports.length > 0) {
      const portNames = this.device.ports.map((p) => p.name).join(", ");
      md.appendMarkdown(`**Ports:** ${portNames}\n\n`);
    }

    // Show parameter count only
    if (this.device.params.length > 0) {
      md.appendMarkdown(
        `**Parameters:** ${this.device.params.length} configurable\n\n`
      );
    }

    md.appendMarkdown("*Click to configure and add*");

    return md;
  }

  private static getSymbolIconFile(symbolType: string): string {
    const iconFiles: Record<string, string> = {
      Nmos: "nmos.svg",
      Pmos: "pmos.svg",
      Res: "res.svg",
      Res3: "res3.svg",
      Cap: "cap.svg",
      Cap3: "cap.svg",
      Ind: "ind.svg",
      Ind3: "ind.svg",
      Diode: "diode.svg",
      Npn: "npn.svg",
      Pnp: "pnp.svg",
      Vsource: "vsource.svg",
      Vsource4: "vsource.svg",
      Isource: "isource.svg",
      Isource4: "isource.svg",
    };
    return iconFiles[symbolType] || "device.svg";
  }
}

/**
 * Project Symbols section node
 */
class ProjectSymbolsNode extends vscode.TreeItem {
  constructor(public readonly symbols: ProjectSymbol[]) {
    super("Project Symbols", vscode.TreeItemCollapsibleState.Expanded);
    this.description = `(${symbols.length})`;
    this.contextValue = "projectSymbols";
    this.iconPath = new vscode.ThemeIcon("symbol-class");
    this.tooltip = "Custom symbols defined in this workspace (.sym.svg files)";
  }
}

/**
 * Individual project symbol node
 */
class ProjectSymbolNode extends vscode.TreeItem {
  constructor(public readonly symbol: ProjectSymbol) {
    super(symbol.name, vscode.TreeItemCollapsibleState.None);
    this.description = `${symbol.ports.length} ports`;
    this.contextValue = "projectSymbol";
    this.iconPath = new vscode.ThemeIcon("file-code");
    this.tooltip = new vscode.MarkdownString(
      `### ${symbol.name}\n\n` +
        `**Ports:** ${symbol.ports.join(", ") || "none"}\n\n` +
        `*Click to add to schematic*`
    );

    // Set command to add symbol when clicked
    this.command = {
      command: "hdl21.symbols.addToSchematic",
      title: "Add to Schematic",
      arguments: [this.symbol],
    };
  }
}

/**
 * TreeDataProvider implementation for Component Explorer
 */
export class PdkExplorerProvider
  implements vscode.TreeDataProvider<PdkTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    PdkTreeItem | undefined | null
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private pdks: PdkInfo[] = [];
  private projectSymbols: ProjectSymbol[] = [];
  private isLoading = false;
  private hasLoaded = false;

  constructor(private pythonBridge: PythonBridge) {
    // Watch for symbol file changes
    const watcher = vscode.workspace.createFileSystemWatcher("**/*.sym.svg");
    watcher.onDidCreate(() => this.refreshProjectSymbols());
    watcher.onDidDelete(() => this.refreshProjectSymbols());
    watcher.onDidChange(() => this.refreshProjectSymbols());
  }

  /**
   * Refresh the PDK list and project symbols
   */
  async refresh(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.isLoading = true;

    try {
      this.pdks = await this.pythonBridge.discoverPdks();
      this.projectSymbols = await this.scanProjectSymbols();
      this.hasLoaded = true;
    } catch (e) {
      console.error("Failed to discover PDKs:", e);
      vscode.window.showErrorMessage(`Failed to discover PDKs: ${e}`);
    } finally {
      this.isLoading = false;
      this._onDidChangeTreeData.fire(undefined);
    }
  }

  /**
   * Refresh only project symbols (for file watcher)
   */
  private async refreshProjectSymbols(): Promise<void> {
    this.projectSymbols = await this.scanProjectSymbols();
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Scan workspace for .sym.svg files
   */
  private async scanProjectSymbols(): Promise<ProjectSymbol[]> {
    const symbols: ProjectSymbol[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return symbols;

    for (const folder of workspaceFolders) {
      await this.scanDirectoryForSymbols(folder.uri.fsPath, symbols);
    }

    return symbols.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Recursively scan a directory for .sym.svg files
   */
  private async scanDirectoryForSymbols(
    dir: string,
    symbols: ProjectSymbol[]
  ): Promise<void> {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and hidden directories
          if (entry.name.startsWith(".") || entry.name === "node_modules") {
            continue;
          }
          await this.scanDirectoryForSymbols(fullPath, symbols);
        } else if (entry.isFile() && entry.name.endsWith(".sym.svg")) {
          const symbolName = entry.name.replace(".sym.svg", "");
          const ports = await this.extractPortsFromSymbol(fullPath);
          symbols.push({
            name: symbolName,
            path: fullPath,
            ports,
          });
        }
      }
    } catch (e) {
      // Ignore permission errors
    }
  }

  /**
   * Extract port names from a symbol SVG file
   */
  private async extractPortsFromSymbol(filePath: string): Promise<string[]> {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const portNames: string[] = [];

      // Match port groups: <g class="hdl21-port" ...>...<text class="hdl21-port-name">NAME</text>...</g>
      // The port group has class="hdl21-port" (no suffix), and contains a text element with the port name
      const portGroupRegex =
        /<g[^>]*class="hdl21-port"[^>]*>[\s\S]*?<text[^>]*class="hdl21-port-name"[^>]*>([^<]+)<\/text>/gi;
      let match;
      while ((match = portGroupRegex.exec(content)) !== null) {
        if (match[1]) {
          portNames.push(match[1].trim());
        }
      }
      return portNames;
    } catch (e) {
      return [];
    }
  }

  /**
   * Get tree item representation
   */
  getTreeItem(element: PdkTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for a tree item
   */
  async getChildren(element?: PdkTreeItem): Promise<PdkTreeItem[]> {
    // Initial load
    if (!this.hasLoaded && !this.isLoading) {
      await this.refresh();
    }

    if (!element) {
      // Root level: show Primitives, Project Symbols, then PDKs
      const items: PdkTreeItem[] = [];

      // Always show Primitives at the top
      items.push(new PdkNode(PRIMITIVES_PDK));

      // Show Project Symbols if any exist
      if (this.projectSymbols.length > 0) {
        items.push(new ProjectSymbolsNode(this.projectSymbols));
      }

      // Then show discovered PDKs
      for (const pdk of this.pdks) {
        items.push(new PdkNode(pdk));
      }

      return items;
    }

    if (element instanceof PdkNode) {
      // PDK level: show categories
      const categories = this.groupByCategory(element.pdk.devices);
      return Array.from(categories.entries()).map(
        ([category, devices]) =>
          new CategoryNode(category, element.pdk.name, devices)
      );
    }

    if (element instanceof CategoryNode) {
      // Category level: show devices
      return element.devices.map(
        (device) => new DeviceNode(device, element.pdkName)
      );
    }

    if (element instanceof ProjectSymbolsNode) {
      // Project Symbols level: show individual symbols
      return element.symbols.map((symbol) => new ProjectSymbolNode(symbol));
    }

    return [];
  }

  /**
   * Get parent of a tree item (for reveal support)
   */
  getParent(element: PdkTreeItem): PdkTreeItem | undefined {
    // Not implementing parent lookup for now
    return undefined;
  }

  /**
   * Group devices by category
   */
  private groupByCategory(devices: DeviceInfo[]): Map<string, DeviceInfo[]> {
    const categories = new Map<string, DeviceInfo[]>();

    // Define category order
    const categoryOrder = [
      "transistors",
      "passives",
      "diodes",
      "sources",
      "other",
    ];

    // Initialize categories in order
    for (const cat of categoryOrder) {
      categories.set(cat, []);
    }

    // Group devices
    for (const device of devices) {
      const category = device.category || "other";
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(device);
    }

    // Remove empty categories
    for (const [cat, devs] of categories) {
      if (devs.length === 0) {
        categories.delete(cat);
      }
    }

    return categories;
  }
}

/**
 * Create and register the Components Explorer view
 */
export function registerComponentsExplorer(
  context: vscode.ExtensionContext,
  pythonBridge: PythonBridge,
  editorProvider: any
): PdkExplorerProvider {
  // Store context for icon path resolution
  extensionContext = context;

  const provider = new PdkExplorerProvider(pythonBridge);

  // Register the tree data provider
  const treeView = vscode.window.createTreeView("hdl21.components", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  context.subscriptions.push(treeView);

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("hdl21.components.refresh", () => {
      provider.refresh();
    })
  );

  // Register add project symbol to schematic command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "hdl21.symbols.addToSchematic",
      async (arg: ProjectSymbol | ProjectSymbolNode) => {
        // Handle both cases:
        // 1. Clicking the item passes ProjectSymbol via command arguments
        // 2. Context menu passes ProjectSymbolNode (the TreeItem)
        const symbol: ProjectSymbol =
          arg instanceof ProjectSymbolNode ? arg.symbol : arg;

        if (!symbol || !symbol.path) {
          vscode.window.showErrorMessage(
            "Invalid symbol. Please refresh the components view and try again."
          );
          return;
        }

        const activeDocument = editorProvider.getActiveDocument();
        if (!activeDocument) {
          vscode.window.showWarningMessage(
            "No schematic editor is active. Open a .sch.svg file first."
          );
          return;
        }

        // Prevent adding symbols to symbol files
        if (activeDocument.uri.fsPath.endsWith(".sym.svg")) {
          vscode.window.showWarningMessage(
            "Cannot add components to a symbol file. Open a .sch.svg schematic file instead."
          );
          return;
        }

        // Prevent circular reference: symbol cannot be added to its own schematic
        const currentSchematicPath = activeDocument.uri.fsPath;
        const symbolSchematicPath = symbol.path.replace(".sym.svg", ".sch.svg");
        if (currentSchematicPath === symbolSchematicPath) {
          vscode.window.showWarningMessage(
            `Cannot add "${symbol.name}" to its own schematic. This would create a circular reference.`
          );
          return;
        }

        await activeDocument.sendCustomSymbol(symbol.path);

        // Reveal and focus the webview so keyboard shortcuts (R/H/V) work
        if (activeDocument.webviewPanel) {
          activeDocument.webviewPanel.reveal(undefined, true);
        }
      }
    )
  );

  // Known PDK packages available for installation
  const availablePdks = [
    {
      label: "gf180-hdl21",
      description: "GlobalFoundries 180nm PDK",
      detail: "Open-source 180nm process",
    },
    {
      label: "sky130-hdl21",
      description: "SkyWater 130nm PDK",
      detail: "Open-source 130nm process",
    },
    {
      label: "asap7-hdl21",
      description: "ASAP7 7nm PDK",
      detail: "Predictive 7nm FinFET process",
    },
    {
      label: "$(edit) Enter custom package name...",
      description: "",
      detail: "Install any pip package",
      alwaysShow: true,
    },
  ];

  // Register install command
  context.subscriptions.push(
    vscode.commands.registerCommand("hdl21.pdk.install", async () => {
      const selection = await vscode.window.showQuickPick(availablePdks, {
        placeHolder: "Select a PDK to install",
        title: "Install HDL21 PDK",
      });

      if (!selection) {
        return;
      }

      let packageName: string | undefined;

      if (selection.label.includes("custom")) {
        // User wants to enter a custom package name
        packageName = await vscode.window.showInputBox({
          prompt: "Enter PDK package name to install",
          placeHolder: "package-name",
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return "Package name is required";
            }
            return null;
          },
        });
      } else {
        packageName = selection.label;
      }

      if (packageName) {
        const pkgToInstall = packageName; // Capture in local variable for closure
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Installing ${pkgToInstall}...`,
            cancellable: false,
          },
          async () => {
            const result = await pythonBridge.installPdk(pkgToInstall);

            if (result.status === "ok") {
              vscode.window.showInformationMessage(
                `Successfully installed ${pkgToInstall}`
              );
              provider.refresh();
            } else {
              vscode.window.showErrorMessage(
                `Failed to install ${pkgToInstall}: ${result.output}`
              );
            }
          }
        );
      }
    })
  );

  return provider;
}
