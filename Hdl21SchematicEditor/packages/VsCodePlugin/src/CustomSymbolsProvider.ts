/**
 * CustomSymbolsProvider - TreeView provider for workspace custom symbols
 *
 * Displays .sym.svg files found in the workspace, organized by folder.
 * Allows users to add custom symbols to schematics for hierarchical connectivity.
 */

import * as vscode from "vscode";
import * as path from "path";

// Store extension context for icon paths
let extensionContext: vscode.ExtensionContext;

// Tree item types
type SymbolTreeItem = FolderNode | SymbolNode;

/**
 * Folder node for organizing symbols
 */
class FolderNode extends vscode.TreeItem {
  constructor(
    public readonly folderPath: string,
    public readonly symbols: vscode.Uri[]
  ) {
    const folderName = path.basename(folderPath);
    super(folderName, vscode.TreeItemCollapsibleState.Expanded);

    this.description = `(${symbols.length})`;
    this.tooltip = folderPath;
    this.contextValue = "folder";
    this.iconPath = new vscode.ThemeIcon("folder");
  }
}

/**
 * Symbol leaf node representing a .sym.svg file
 */
class SymbolNode extends vscode.TreeItem {
  constructor(public readonly symbolUri: vscode.Uri) {
    const fileName = path.basename(symbolUri.fsPath);
    // Remove .sym.svg extension for display
    const displayName = fileName.replace(".sym.svg", "");
    super(displayName, vscode.TreeItemCollapsibleState.None);

    this.description = ".sym.svg";
    this.tooltip = new vscode.MarkdownString(
      `**${displayName}**\n\n` +
        `\`${symbolUri.fsPath}\`\n\n` +
        "*Click to add to schematic*"
    );
    this.contextValue = "symbol";
    this.iconPath = new vscode.ThemeIcon("symbol-class");
    this.resourceUri = symbolUri;

    // Set command to add symbol when clicked
    this.command = {
      command: "hdl21.symbols.addToSchematic",
      title: "Add to Schematic",
      arguments: [this.symbolUri],
    };
  }
}

/**
 * TreeDataProvider implementation for Custom Symbols
 */
export class CustomSymbolsProvider
  implements vscode.TreeDataProvider<SymbolTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    SymbolTreeItem | undefined | null
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private symbolFiles: vscode.Uri[] = [];
  private isLoading = false;
  private hasLoaded = false;
  private fileWatcher: vscode.FileSystemWatcher | undefined;

  constructor() {
    // Set up file watcher for .sym.svg files
    this.setupFileWatcher();
  }

  private setupFileWatcher() {
    // Watch for .sym.svg file changes
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      "**/*.sym.svg",
      false, // create
      true, // change (don't refresh on content changes)
      false // delete
    );

    this.fileWatcher.onDidCreate(() => this.refresh());
    this.fileWatcher.onDidDelete(() => this.refresh());
  }

  dispose() {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }
  }

  /**
   * Refresh the symbol list
   */
  async refresh(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.isLoading = true;

    try {
      // Find all .sym.svg files in the workspace
      this.symbolFiles = await vscode.workspace.findFiles(
        "**/*.sym.svg",
        "**/node_modules/**"
      );
      this.hasLoaded = true;
    } catch (e) {
      console.error("Failed to find symbol files:", e);
    } finally {
      this.isLoading = false;
      this._onDidChangeTreeData.fire(undefined);
    }
  }

  /**
   * Get tree item representation
   */
  getTreeItem(element: SymbolTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for a tree item
   */
  async getChildren(element?: SymbolTreeItem): Promise<SymbolTreeItem[]> {
    // Initial load
    if (!this.hasLoaded && !this.isLoading) {
      await this.refresh();
    }

    if (!element) {
      // Root level: group symbols by folder
      return this.getGroupedSymbols();
    }

    if (element instanceof FolderNode) {
      // Folder level: show symbols in this folder
      return element.symbols.map((uri) => new SymbolNode(uri));
    }

    return [];
  }

  /**
   * Group symbols by their containing folder
   */
  private getGroupedSymbols(): SymbolTreeItem[] {
    if (this.symbolFiles.length === 0) {
      return [];
    }

    // Group by folder
    const folders = new Map<string, vscode.Uri[]>();

    for (const uri of this.symbolFiles) {
      const folderPath = path.dirname(uri.fsPath);
      if (!folders.has(folderPath)) {
        folders.set(folderPath, []);
      }
      folders.get(folderPath)!.push(uri);
    }

    // If all symbols are in one folder, just show them flat
    if (folders.size === 1) {
      const [, symbols] = [...folders.entries()][0];
      return symbols
        .sort((a, b) =>
          path.basename(a.fsPath).localeCompare(path.basename(b.fsPath))
        )
        .map((uri) => new SymbolNode(uri));
    }

    // Multiple folders: create folder nodes
    const items: SymbolTreeItem[] = [];
    const sortedFolders = [...folders.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    );

    for (const [folderPath, symbols] of sortedFolders) {
      symbols.sort((a, b) =>
        path.basename(a.fsPath).localeCompare(path.basename(b.fsPath))
      );
      items.push(new FolderNode(folderPath, symbols));
    }

    return items;
  }

  /**
   * Get parent of a tree item (for reveal support)
   */
  getParent(element: SymbolTreeItem): SymbolTreeItem | undefined {
    return undefined;
  }
}

/**
 * Create and register the Custom Symbols view
 */
export function registerCustomSymbols(
  context: vscode.ExtensionContext,
  editorProvider: { getActiveDocument(): { sendCustomSymbol(symbolPath: string): void } | null }
): CustomSymbolsProvider {
  // Store context for icon path resolution
  extensionContext = context;

  const provider = new CustomSymbolsProvider();

  // Register the tree data provider
  const treeView = vscode.window.createTreeView("hdl21.customSymbols", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  context.subscriptions.push(treeView);
  context.subscriptions.push(provider);

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("hdl21.symbols.refresh", () => {
      provider.refresh();
    })
  );

  // Register add to schematic command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "hdl21.symbols.addToSchematic",
      async (symbolUri: vscode.Uri) => {
        const activeDocument = editorProvider.getActiveDocument();
        if (!activeDocument) {
          vscode.window.showWarningMessage(
            "No schematic editor is active. Open a .sch.svg file first."
          );
          return;
        }

        activeDocument.sendCustomSymbol(symbolUri.fsPath);
      }
    )
  );

  // Register create new symbol command
  context.subscriptions.push(
    vscode.commands.registerCommand("hdl21.symbols.new", async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage("Requires opening a workspace");
        return;
      }

      // Ask for symbol name
      const symbolName = await vscode.window.showInputBox({
        prompt: "Enter symbol name",
        placeHolder: "my_symbol",
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "Symbol name is required";
          }
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
            return "Symbol name must be a valid identifier (letters, numbers, underscores)";
          }
          return null;
        },
      });

      if (!symbolName) {
        return;
      }

      // Ask where to save
      const targetFolder = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        defaultUri: workspaceFolders[0].uri,
        openLabel: "Select Folder",
        title: "Select folder for new symbol",
      });

      const folder = targetFolder?.[0] || workspaceFolders[0].uri;
      const symbolPath = vscode.Uri.joinPath(folder, `${symbolName}.sym.svg`);

      // Check if file already exists
      try {
        await vscode.workspace.fs.stat(symbolPath);
        vscode.window.showErrorMessage(
          `Symbol file already exists: ${symbolName}.sym.svg`
        );
        return;
      } catch {
        // File doesn't exist, good to create
      }

      // Create empty symbol SVG
      const emptySymbolSvg = createEmptySymbolSvg(symbolName);
      const bytes = new TextEncoder().encode(emptySymbolSvg);
      await vscode.workspace.fs.writeFile(symbolPath, bytes);

      // Open the new symbol for editing
      await vscode.commands.executeCommand(
        "vscode.openWith",
        symbolPath,
        "hdl21.schematics"
      );

      // Refresh the tree
      provider.refresh();

      vscode.window.showInformationMessage(
        `Created new symbol: ${symbolName}.sym.svg`
      );
    })
  );

  // Register open symbol command (for double-click or context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "hdl21.symbols.open",
      async (symbolUri: vscode.Uri) => {
        await vscode.commands.executeCommand(
          "vscode.openWith",
          symbolUri,
          "hdl21.schematics"
        );
      }
    )
  );

  return provider;
}

/**
 * Create an empty symbol SVG with the basic structure
 */
function createEmptySymbolSvg(symbolName: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:hdl21="http://www.vlsir.dev/hdl21/schematic"
     width="800" height="600" viewBox="0 0 800 600">

  <!-- HDL21 Schematic Metadata -->
  <hdl21:schematic>
    <hdl21:name>${symbolName}</hdl21:name>
    <hdl21:prelude></hdl21:prelude>
  </hdl21:schematic>

  <!-- Grid background -->
  <defs>
    <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
      <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#333" stroke-width="0.5"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#grid)"/>

  <!-- Symbol content goes here -->
  <!-- Add ports using the schematic editor (right-click or press 'p') -->

</svg>`;
}
