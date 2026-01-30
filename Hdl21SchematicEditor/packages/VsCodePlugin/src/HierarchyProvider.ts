import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

// Represents a component (paired .sch.svg and .sym.svg files)
interface ComponentInfo {
  name: string;
  schematicPath: string | null; // .sch.svg path
  symbolPath: string | null; // .sym.svg path
  folder: string; // Parent folder path
  children: string[]; // Names of child components (symbols instantiated in this schematic)
  parents: string[]; // Names of parent components (schematics that instantiate this symbol)
}

// Represents a Python script (.py file)
interface ScriptInfo {
  name: string;
  scriptPath: string; // .py path
  symbolPath: string | null; // Associated .sym.svg (by naming convention)
  folder: string; // Parent folder path
  hasMatchingGenerator: boolean; // Whether script has a generator matching its filename
}

// Tree item types
type HierarchyItem = FolderItem | ComponentItem | ScriptItem | ChildInstanceItem;

class FolderItem extends vscode.TreeItem {
  constructor(
    public readonly folderPath: string,
    public readonly folderName: string,
    public readonly components: ComponentInfo[],
    public readonly scripts: ScriptInfo[] = []
  ) {
    super(folderName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "folder";
    this.iconPath = new vscode.ThemeIcon("folder");
  }
}

class ComponentItem extends vscode.TreeItem {
  constructor(
    public readonly component: ComponentInfo,
    private readonly allComponents: Map<string, ComponentInfo>
  ) {
    super(
      component.name,
      component.children.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = "component";

    // Show status in description
    const hasSchematic = component.schematicPath !== null;
    const hasSymbol = component.symbolPath !== null;
    const hasChildren = component.children.length > 0;
    const hasParents = component.parents.length > 0;

    let statusParts: string[] = [];
    if (hasSchematic && hasSymbol) {
      statusParts.push("sch+sym");
    } else if (hasSchematic) {
      statusParts.push("sch");
    } else if (hasSymbol) {
      statusParts.push("sym");
    }

    if (hasChildren) {
      statusParts.push(`${component.children.length} sub`);
    }
    if (hasParents) {
      statusParts.push(`used by ${component.parents.length}`);
    }

    this.description = statusParts.join(" | ");

    // Icon based on hierarchy status
    if (hasChildren && hasParents) {
      this.iconPath = new vscode.ThemeIcon("type-hierarchy-sub");
    } else if (hasChildren) {
      this.iconPath = new vscode.ThemeIcon("type-hierarchy");
    } else if (hasSchematic && hasSymbol) {
      this.iconPath = new vscode.ThemeIcon("circuit-board");
    } else if (hasSymbol) {
      this.iconPath = new vscode.ThemeIcon("files");
    }

    // Tooltip with details
    const tooltipParts: string[] = [`**${component.name}**`];
    if (hasSchematic) {
      tooltipParts.push(`Schematic: ${component.schematicPath}`);
    }
    if (hasSymbol) {
      tooltipParts.push(`Symbol: ${component.symbolPath}`);
    }
    if (hasChildren) {
      tooltipParts.push(`\nSubcircuits: ${component.children.join(", ")}`);
    }
    if (hasParents) {
      tooltipParts.push(`\nUsed in: ${component.parents.join(", ")}`);
    }
    this.tooltip = new vscode.MarkdownString(tooltipParts.join("\n\n"));
  }

  getChildInstances(): ChildInstanceItem[] {
    return this.component.children.map(
      (childName) =>
        new ChildInstanceItem(childName, this.component.name, this.allComponents, 0)
    );
  }
}

/**
 * Represents a Python script in the hierarchy
 */
class ScriptItem extends vscode.TreeItem {
  constructor(public readonly script: ScriptInfo) {
    super(script.name, vscode.TreeItemCollapsibleState.None);

    const hasSymbol = script.symbolPath !== null;
    const hasGenerator = script.hasMatchingGenerator;

    // Context value determines which actions are available
    // Scripts without matching generator can't have symbols created for them
    if (!hasGenerator) {
      this.contextValue = "scriptNoGenerator";
    } else if (hasSymbol) {
      this.contextValue = "scriptWithSymbol";
    } else {
      this.contextValue = "script";
    }

    // Build status description
    let statusParts: string[] = ["script"];
    if (hasSymbol) {
      statusParts.push("sym");
    }
    this.description = statusParts.join(" | ");

    // Icon based on status
    // - Script without symbol: simple file icon (valid state)
    // - Script with symbol: file-code icon (indicates full component)
    // - Script without matching generator: error icon
    if (!hasGenerator) {
      this.iconPath = new vscode.ThemeIcon("error");
    } else if (hasSymbol) {
      this.iconPath = new vscode.ThemeIcon("files"); // Shows file + module
    } else {
      this.iconPath = new vscode.ThemeIcon("file"); // Simple page icon
    }

    // Tooltip with details
    const tooltipParts: string[] = [`**${script.name}** (Python script)`];
    tooltipParts.push(`Script: ${script.scriptPath}`);
    if (hasSymbol) {
      tooltipParts.push(`Symbol: ${script.symbolPath}`);
    }

    if (!hasGenerator) {
      tooltipParts.push(`\n⛔ **Error:** No generator named \`${script.name}\` found in script`);
      tooltipParts.push(`Cannot create symbol until script has a matching generator.`);
    }

    this.tooltip = new vscode.MarkdownString(tooltipParts.join("\n\n"));
  }
}

// Maximum depth for hierarchy tree to prevent infinite recursion
const MAX_HIERARCHY_DEPTH = 10;

/**
 * Represents a child instance (a symbol used within a parent schematic)
 */
class ChildInstanceItem extends vscode.TreeItem {
  constructor(
    public readonly childName: string,
    public readonly parentName: string,
    private readonly allComponents: Map<string, ComponentInfo>,
    private readonly depth: number = 0
  ) {
    const childComponent = allComponents.get(childName);
    const canExpand = childComponent &&
      childComponent.children.length > 0 &&
      depth < MAX_HIERARCHY_DEPTH;
    super(
      childName,
      canExpand
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = "childInstance";
    this.iconPath = new vscode.ThemeIcon("circuit-board");

    // Show depth limit warning if applicable
    if (depth >= MAX_HIERARCHY_DEPTH) {
      this.description = "subcircuit (max depth)";
    } else {
      this.description = "subcircuit";
    }

    if (childComponent) {
      let tooltipText = `**${childName}** (subcircuit of ${parentName})\n\n`;
      if (childComponent.symbolPath) {
        tooltipText += `Symbol: ${childComponent.symbolPath}`;
      }
      if (depth >= MAX_HIERARCHY_DEPTH) {
        tooltipText += `\n\n⚠️ Maximum hierarchy depth reached`;
      }
      this.tooltip = new vscode.MarkdownString(tooltipText);
    }
  }

  getComponent(): ComponentInfo | undefined {
    return this.allComponents.get(this.childName);
  }

  getChildInstances(): ChildInstanceItem[] {
    // Stop recursion at max depth
    if (this.depth >= MAX_HIERARCHY_DEPTH) {
      return [];
    }

    const childComponent = this.allComponents.get(this.childName);
    if (!childComponent) return [];
    return childComponent.children.map(
      (grandchildName) =>
        new ChildInstanceItem(
          grandchildName,
          this.childName,
          this.allComponents,
          this.depth + 1
        )
    );
  }
}

export class HierarchyProvider
  implements vscode.TreeDataProvider<HierarchyItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    HierarchyItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private components: Map<string, ComponentInfo[]> = new Map(); // folder -> components
  private allComponentsByName: Map<string, ComponentInfo> = new Map(); // name -> component
  private componentsInCycles: Set<string> = new Set(); // components involved in circular references
  private scripts: Map<string, ScriptInfo[]> = new Map(); // folder -> scripts
  private allScriptsByName: Map<string, ScriptInfo> = new Map(); // name -> script

  constructor() {
    this.refresh();
  }

  refresh(): void {
    this.scanWorkspace();
    this._onDidChangeTreeData.fire();
  }

  private scanWorkspace(): void {
    this.components.clear();
    this.allComponentsByName.clear();
    this.scripts.clear();
    this.allScriptsByName.clear();

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    // Find all .sch.svg, .sym.svg, and .py files
    const schematicFiles = new Map<string, string>(); // name -> path
    const symbolFiles = new Map<string, string>(); // name -> path
    const scriptFiles = new Map<string, string>(); // name -> path

    for (const folder of workspaceFolders) {
      this.scanDirectory(folder.uri.fsPath, schematicFiles, symbolFiles, scriptFiles);
    }

    // Group by component name and folder
    // Components are entries with a schematic (.sch.svg)
    // Symbol-only entries are only created if there's no matching script
    const allNames = new Set([...schematicFiles.keys(), ...symbolFiles.keys()]);

    for (const name of allNames) {
      const schPath = schematicFiles.get(name) || null;
      const symPath = symbolFiles.get(name) || null;

      // Skip symbol-only entries if a script with the same name exists
      // (the script processing will handle these as script+symbol pairs)
      if (!schPath && scriptFiles.has(name)) {
        continue;
      }

      // Determine the folder (prefer schematic path, fall back to symbol)
      const filePath = schPath || symPath;
      if (!filePath) continue;

      const folder = path.dirname(filePath);
      const relativeFolderPath = this.getRelativeFolderPath(folder);

      const component: ComponentInfo = {
        name,
        schematicPath: schPath,
        symbolPath: symPath,
        folder: relativeFolderPath,
        children: [],
        parents: [],
      };

      if (!this.components.has(relativeFolderPath)) {
        this.components.set(relativeFolderPath, []);
      }
      this.components.get(relativeFolderPath)!.push(component);
      this.allComponentsByName.set(name, component);
    }

    // Now scan schematic files to find hierarchical relationships
    this.scanForHierarchy(schematicFiles, symbolFiles);

    // Detect circular references
    this.detectCycles();

    // Process script files (only those not already paired as components)
    for (const [name, scriptPath] of scriptFiles) {
      // Skip if this name already exists as a component (has schematic)
      if (schematicFiles.has(name)) {
        continue;
      }

      const folder = path.dirname(scriptPath);
      const relativeFolderPath = this.getRelativeFolderPath(folder);

      // Check if matching symbol exists
      const symPath = symbolFiles.get(name) || null;

      // Check if script has a generator matching its filename
      const hasMatchingGenerator = this.checkForMatchingGenerator(scriptPath, name);

      const script: ScriptInfo = {
        name,
        scriptPath,
        symbolPath: symPath,
        folder: relativeFolderPath,
        hasMatchingGenerator,
      };

      if (!this.scripts.has(relativeFolderPath)) {
        this.scripts.set(relativeFolderPath, []);
      }
      this.scripts.get(relativeFolderPath)!.push(script);
      this.allScriptsByName.set(name, script);
    }

    // Sort components within each folder
    for (const [, components] of this.components) {
      components.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Sort scripts within each folder
    for (const [, scripts] of this.scripts) {
      scripts.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  /**
   * Scan schematic files to find which symbols are instantiated in each schematic
   */
  private scanForHierarchy(
    schematicFiles: Map<string, string>,
    symbolFiles: Map<string, string>
  ): void {
    // Get list of all symbol names for matching
    const symbolNames = new Set(symbolFiles.keys());

    for (const [schematicName, schematicPath] of schematicFiles) {
      try {
        const content = fs.readFileSync(schematicPath, "utf-8");

        // Look for instances that reference custom symbols
        // Custom symbols are referenced with "of" attribute like "SymbolName()"
        // or via custom-symbolname tags
        for (const symbolName of symbolNames) {
          // Skip self-references
          if (symbolName === schematicName) continue;

          // Check if the symbol is used in this schematic
          // Look for patterns like:
          // - of="SymbolName(...)"
          // - class="custom-symbolname"
          // - tag containing the symbol name
          const symbolPatterns = [
            new RegExp(`of\\s*=\\s*["']${symbolName}\\s*\\(`, "i"),
            new RegExp(`class\\s*=\\s*["']custom-${symbolName.toLowerCase()}["']`, "i"),
            new RegExp(`<hdl21-instance[^>]*of\\s*=\\s*["']${symbolName}`, "i"),
            // Match exact symbol name without parentheses
            new RegExp(`of\\s*=\\s*["']${symbolName}["']`, "i"),
            // Match data-custom-symbol-path attribute
            new RegExp(`data-custom-symbol-path\\s*=\\s*["'][^"']*${symbolName}\\.sym\\.svg["']`, "i"),
          ];

          const isUsed = symbolPatterns.some((pattern) => pattern.test(content));

          if (isUsed) {
            // Add child relationship
            const parentComponent = this.allComponentsByName.get(schematicName);
            const childComponent = this.allComponentsByName.get(symbolName);

            if (parentComponent && childComponent) {
              if (!parentComponent.children.includes(symbolName)) {
                parentComponent.children.push(symbolName);
              }
              if (!childComponent.parents.includes(schematicName)) {
                childComponent.parents.push(schematicName);
              }
            }
          }
        }
      } catch (e) {
        // Ignore read errors
      }
    }
  }

  /**
   * Detect circular references in the component hierarchy using DFS
   */
  private detectCycles(): void {
    this.componentsInCycles.clear();
    const visited = new Set<string>();
    const inCurrentPath = new Set<string>();

    const dfs = (componentName: string): boolean => {
      if (inCurrentPath.has(componentName)) {
        // Found a cycle - mark all components in current path
        return true;
      }
      if (visited.has(componentName)) {
        return false;
      }

      visited.add(componentName);
      inCurrentPath.add(componentName);

      const component = this.allComponentsByName.get(componentName);
      if (component) {
        for (const childName of component.children) {
          if (dfs(childName)) {
            this.componentsInCycles.add(componentName);
          }
        }
      }

      inCurrentPath.delete(componentName);
      return false;
    };

    // Run DFS from each component
    for (const componentName of this.allComponentsByName.keys()) {
      visited.clear();
      inCurrentPath.clear();
      dfs(componentName);
    }
  }

  /**
   * Check if a component is part of a circular reference
   */
  isInCycle(componentName: string): boolean {
    return this.componentsInCycles.has(componentName);
  }

  /**
   * Check if a Python script has a generator function matching the expected name
   */
  private checkForMatchingGenerator(scriptPath: string, expectedName: string): boolean {
    try {
      const content = fs.readFileSync(scriptPath, "utf-8");

      // Look for @h.generator or @generator decorator followed by def expectedName
      // Patterns to match:
      // @h.generator
      // def ExpectedName(...)
      // or
      // @generator
      // def ExpectedName(...)
      const patterns = [
        new RegExp(`@h\\.generator\\s*\\n\\s*def\\s+${expectedName}\\s*\\(`, "m"),
        new RegExp(`@generator\\s*\\n\\s*def\\s+${expectedName}\\s*\\(`, "m"),
        // Also match if there's stuff between decorator and def (like other decorators)
        new RegExp(`@h\\.generator[^@]*def\\s+${expectedName}\\s*\\(`, "s"),
      ];

      return patterns.some((pattern) => pattern.test(content));
    } catch (e) {
      // If we can't read the file, assume it doesn't have the generator
      return false;
    }
  }

  private getRelativeFolderPath(absolutePath: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return absolutePath;

    for (const folder of workspaceFolders) {
      if (absolutePath.startsWith(folder.uri.fsPath)) {
        const relative = path.relative(folder.uri.fsPath, absolutePath);
        return relative || ".";
      }
    }
    return absolutePath;
  }

  private scanDirectory(
    dir: string,
    schematicFiles: Map<string, string>,
    symbolFiles: Map<string, string>,
    scriptFiles: Map<string, string>
  ): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and hidden directories
          if (entry.name.startsWith(".") || entry.name === "node_modules") {
            continue;
          }
          this.scanDirectory(fullPath, schematicFiles, symbolFiles, scriptFiles);
        } else if (entry.isFile()) {
          if (entry.name.endsWith(".sch.svg")) {
            const componentName = entry.name.replace(".sch.svg", "");
            schematicFiles.set(componentName, fullPath);
          } else if (entry.name.endsWith(".sym.svg")) {
            const componentName = entry.name.replace(".sym.svg", "");
            symbolFiles.set(componentName, fullPath);
          } else if (entry.name.endsWith(".py") && !entry.name.startsWith("__")) {
            // Include .py files but skip __init__.py, __pycache__, etc.
            const scriptName = entry.name.replace(".py", "");
            scriptFiles.set(scriptName, fullPath);
          }
        }
      }
    } catch (e) {
      // Ignore permission errors
    }
  }

  getTreeItem(element: HierarchyItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: HierarchyItem): HierarchyItem[] {
    if (!element) {
      // Root level - return folders (or components/scripts if only one folder)
      const componentFolders = new Set(this.components.keys());
      const scriptFolders = new Set(this.scripts.keys());
      const allFolders = Array.from(new Set([...componentFolders, ...scriptFolders])).sort();

      if (allFolders.length === 0) {
        return [];
      }

      // If all items are in the root folder, just show them directly
      if (allFolders.length === 1 && allFolders[0] === ".") {
        const items: HierarchyItem[] = [];
        const components = this.components.get(".") || [];
        const scripts = this.scripts.get(".") || [];

        items.push(...components.map((comp) => new ComponentItem(comp, this.allComponentsByName)));
        items.push(...scripts.map((script) => new ScriptItem(script)));

        return items;
      }

      // Otherwise show folder structure
      return allFolders.map(
        (folder) =>
          new FolderItem(
            folder,
            folder,
            this.components.get(folder) || [],
            this.scripts.get(folder) || []
          )
      );
    }

    if (element instanceof FolderItem) {
      const items: HierarchyItem[] = [];
      items.push(...element.components.map(
        (comp) => new ComponentItem(comp, this.allComponentsByName)
      ));
      items.push(...element.scripts.map(
        (script) => new ScriptItem(script)
      ));
      return items;
    }

    if (element instanceof ComponentItem) {
      return element.getChildInstances();
    }

    if (element instanceof ChildInstanceItem) {
      return element.getChildInstances();
    }

    return [];
  }
}

export function registerHierarchy(
  context: vscode.ExtensionContext,
  editorProvider: any
): HierarchyProvider {
  const hierarchyProvider = new HierarchyProvider();

  // Register tree view
  const treeView = vscode.window.createTreeView("hdl21.hierarchy", {
    treeDataProvider: hierarchyProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("hdl21.hierarchy.refresh", () => {
      hierarchyProvider.refresh();
    })
  );

  // Register open schematic command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "hdl21.hierarchy.openSchematic",
      (item: ComponentItem | ChildInstanceItem) => {
        let component: ComponentInfo | undefined;
        if (item instanceof ComponentItem) {
          component = item.component;
        } else if (item instanceof ChildInstanceItem) {
          component = item.getComponent();
        }

        if (!component) return;

        if (component.schematicPath) {
          vscode.commands.executeCommand(
            "vscode.openWith",
            vscode.Uri.file(component.schematicPath),
            "hdl21.schematics"
          );
        } else {
          // Offer to create the schematic
          vscode.window
            .showInformationMessage(
              `No schematic found for ${component.name}. Create one?`,
              "Create Schematic"
            )
            .then((selection) => {
              if (selection === "Create Schematic") {
                createSchematicForComponent(component!);
              }
            });
        }
      }
    )
  );

  // Register open symbol command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "hdl21.hierarchy.openSymbol",
      (item: ComponentItem | ChildInstanceItem | ScriptItem) => {
        let symbolPath: string | null = null;
        let name: string | undefined;

        if (item instanceof ComponentItem) {
          symbolPath = item.component.symbolPath;
          name = item.component.name;
        } else if (item instanceof ChildInstanceItem) {
          const component = item.getComponent();
          symbolPath = component?.symbolPath || null;
          name = component?.name;
        } else if (item instanceof ScriptItem) {
          symbolPath = item.script.symbolPath;
          name = item.script.name;
        }

        if (symbolPath) {
          vscode.commands.executeCommand(
            "vscode.openWith",
            vscode.Uri.file(symbolPath),
            "hdl21.schematics"
          );
        } else if (name) {
          // Offer to create the symbol (for components only, not scripts)
          if (item instanceof ComponentItem || item instanceof ChildInstanceItem) {
            vscode.window
              .showInformationMessage(
                `No symbol found for ${name}. Create one?`,
                "Create Symbol"
              )
              .then((selection) => {
                if (selection === "Create Symbol" && item instanceof ComponentItem) {
                  createSymbolForComponent(item.component);
                }
              });
          }
        }
      }
    )
  );

  // Register delete component command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "hdl21.hierarchy.delete",
      async (item: ComponentItem) => {
        const filesToDelete: string[] = [];
        if (item.component.schematicPath) {
          filesToDelete.push(item.component.schematicPath);
        }
        if (item.component.symbolPath) {
          filesToDelete.push(item.component.symbolPath);
        }

        if (filesToDelete.length === 0) {
          return;
        }

        // Warn if component is used elsewhere
        if (item.component.parents.length > 0) {
          const usedIn = item.component.parents.join(", ");
          const confirmUsage = await vscode.window.showWarningMessage(
            `${item.component.name} is used in: ${usedIn}. Deleting it may break those schematics. Continue?`,
            { modal: true },
            "Delete Anyway"
          );
          if (confirmUsage !== "Delete Anyway") {
            return;
          }
        }

        const fileList = filesToDelete
          .map((f) => path.basename(f))
          .join(" and ");
        const confirm = await vscode.window.showWarningMessage(
          `Delete ${item.component.name}? This will delete ${fileList}.`,
          { modal: true },
          "Delete"
        );

        if (confirm === "Delete") {
          // Close any open editors for these files first
          for (const filePath of filesToDelete) {
            const fileUri = vscode.Uri.file(filePath);
            // Find and close tabs with this URI
            for (const tabGroup of vscode.window.tabGroups.all) {
              for (const tab of tabGroup.tabs) {
                if (tab.input instanceof vscode.TabInputCustom ||
                    tab.input instanceof vscode.TabInputText) {
                  if (tab.input.uri.fsPath === fileUri.fsPath) {
                    await vscode.window.tabGroups.close(tab);
                  }
                }
              }
            }
          }

          // Now delete the files
          for (const filePath of filesToDelete) {
            try {
              fs.unlinkSync(filePath);
            } catch (e) {
              vscode.window.showErrorMessage(
                `Failed to delete ${path.basename(filePath)}: ${e}`
              );
            }
          }
          hierarchyProvider.refresh();
        }
      }
    )
  );

  // Register create new component command
  context.subscriptions.push(
    vscode.commands.registerCommand("hdl21.hierarchy.new", async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      const name = await vscode.window.showInputBox({
        prompt: "Enter component name",
        placeHolder: "MyComponent",
        validateInput: (value) => {
          if (!value) return "Name is required";
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
            return "Name must be a valid identifier";
          }
          return null;
        },
      });

      if (!name) return;

      const folder = workspaceFolders[0].uri.fsPath;
      const schematicPath = path.join(folder, `${name}.sch.svg`);
      const symbolPath = path.join(folder, `${name}.sym.svg`);

      // Create both files with empty templates
      const emptySchematic = createEmptySchematic(name);
      const emptySymbol = createEmptySymbol(name);

      fs.writeFileSync(schematicPath, emptySchematic);
      fs.writeFileSync(symbolPath, emptySymbol);

      hierarchyProvider.refresh();

      // Open the schematic
      vscode.commands.executeCommand(
        "vscode.openWith",
        vscode.Uri.file(schematicPath),
        "hdl21.schematics"
      );
    })
  );

  // Register create new script command
  context.subscriptions.push(
    vscode.commands.registerCommand("hdl21.hierarchy.newScript", async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      const name = await vscode.window.showInputBox({
        prompt: "Enter script name",
        placeHolder: "MyGenerator",
        validateInput: (value) => {
          if (!value) return "Name is required";
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
            return "Name must be a valid Python identifier";
          }
          return null;
        },
      });

      if (!name) return;

      const folder = workspaceFolders[0].uri.fsPath;
      const scriptPath = path.join(folder, `${name}.py`);

      // Check if file already exists
      if (fs.existsSync(scriptPath)) {
        vscode.window.showErrorMessage(`Script ${name}.py already exists`);
        return;
      }

      // Create script file with HDL21 generator template
      const content = createEmptyScript(name);
      fs.writeFileSync(scriptPath, content);

      hierarchyProvider.refresh();

      // Open the script
      vscode.workspace.openTextDocument(scriptPath).then((doc) => {
        vscode.window.showTextDocument(doc);
      });
    })
  );

  // Register open script command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "hdl21.hierarchy.openScript",
      (item: ScriptItem) => {
        if (item instanceof ScriptItem) {
          vscode.workspace.openTextDocument(item.script.scriptPath).then((doc) => {
            vscode.window.showTextDocument(doc);
          });
        }
      }
    )
  );

  // Register create symbol for script command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "hdl21.hierarchy.createSymbolForScript",
      (item: ScriptItem) => {
        if (!(item instanceof ScriptItem)) return;

        const script = item.script;

        // Only allow if script has matching generator
        if (!script.hasMatchingGenerator) {
          vscode.window.showErrorMessage(
            `Cannot create symbol: script must have a generator named "${script.name}"`
          );
          return;
        }

        // Determine symbol path
        const folder = path.dirname(script.scriptPath);
        const symbolPath = path.join(folder, `${script.name}.sym.svg`);

        // Check if symbol already exists
        if (fs.existsSync(symbolPath)) {
          vscode.window.showErrorMessage(`Symbol ${script.name}.sym.svg already exists`);
          return;
        }

        // Create the symbol
        const content = createEmptySymbol(script.name);
        fs.writeFileSync(symbolPath, content);

        hierarchyProvider.refresh();

        // Open the symbol
        vscode.commands.executeCommand(
          "vscode.openWith",
          vscode.Uri.file(symbolPath),
          "hdl21.schematics"
        );
      }
    )
  );

  // Register delete script command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "hdl21.hierarchy.deleteScript",
      async (item: ScriptItem) => {
        if (!(item instanceof ScriptItem)) return;

        const script = item.script;
        const filesToDelete: string[] = [script.scriptPath];

        // Also ask about deleting associated symbol if it exists
        if (script.symbolPath) {
          const deleteSymbol = await vscode.window.showQuickPick(
            ["Delete script only", "Delete script and symbol"],
            { placeHolder: `${script.name} has an associated symbol. What would you like to delete?` }
          );

          if (!deleteSymbol) return;

          if (deleteSymbol === "Delete script and symbol") {
            filesToDelete.push(script.symbolPath);
          }
        }

        const fileList = filesToDelete.map((f) => path.basename(f)).join(" and ");
        const confirm = await vscode.window.showWarningMessage(
          `Delete ${fileList}?`,
          { modal: true },
          "Delete"
        );

        if (confirm === "Delete") {
          // Close any open editors for these files first
          for (const filePath of filesToDelete) {
            const fileUri = vscode.Uri.file(filePath);
            for (const tabGroup of vscode.window.tabGroups.all) {
              for (const tab of tabGroup.tabs) {
                if (tab.input instanceof vscode.TabInputCustom ||
                    tab.input instanceof vscode.TabInputText) {
                  if (tab.input.uri.fsPath === fileUri.fsPath) {
                    await vscode.window.tabGroups.close(tab);
                  }
                }
              }
            }
          }

          // Delete the files
          for (const filePath of filesToDelete) {
            try {
              fs.unlinkSync(filePath);
            } catch (e) {
              vscode.window.showErrorMessage(
                `Failed to delete ${path.basename(filePath)}: ${e}`
              );
            }
          }
          hierarchyProvider.refresh();
        }
      }
    )
  );

  // Watch for file changes (schematics and symbols)
  const svgWatcher = vscode.workspace.createFileSystemWatcher(
    "**/*.{sch,sym}.svg"
  );
  svgWatcher.onDidCreate(() => hierarchyProvider.refresh());
  svgWatcher.onDidDelete(() => hierarchyProvider.refresh());
  svgWatcher.onDidChange(() => hierarchyProvider.refresh());
  context.subscriptions.push(svgWatcher);

  // Watch for Python script changes
  const pyWatcher = vscode.workspace.createFileSystemWatcher("**/*.py");
  pyWatcher.onDidCreate(() => hierarchyProvider.refresh());
  pyWatcher.onDidDelete(() => hierarchyProvider.refresh());
  pyWatcher.onDidChange(() => hierarchyProvider.refresh());
  context.subscriptions.push(pyWatcher);

  return hierarchyProvider;
}

function createSchematicForComponent(component: ComponentInfo): void {
  // Determine path based on symbol location or workspace root
  let folder: string;
  if (component.symbolPath) {
    folder = path.dirname(component.symbolPath);
  } else {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    folder = workspaceFolders[0].uri.fsPath;
  }

  const schematicPath = path.join(folder, `${component.name}.sch.svg`);
  const content = createEmptySchematic(component.name);

  fs.writeFileSync(schematicPath, content);

  vscode.commands.executeCommand(
    "vscode.openWith",
    vscode.Uri.file(schematicPath),
    "hdl21.schematics"
  );
}

function createSymbolForComponent(component: ComponentInfo): void {
  // Determine path based on schematic location or workspace root
  let folder: string;
  if (component.schematicPath) {
    folder = path.dirname(component.schematicPath);
  } else {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    folder = workspaceFolders[0].uri.fsPath;
  }

  const symbolPath = path.join(folder, `${component.name}.sym.svg`);
  const content = createEmptySymbol(component.name);

  fs.writeFileSync(symbolPath, content);

  vscode.commands.executeCommand(
    "vscode.openWith",
    vscode.Uri.file(symbolPath),
    "hdl21.schematics"
  );
}

function createEmptySchematic(name: string): string {
  return `<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:hdl21="https://github.com/hdl21/hdl21schematics"
  width="1600"
  height="800"
>
  <hdl21:schematic name="${name}" prelude="">
  </hdl21:schematic>
</svg>`;
}

function createEmptySymbol(name: string): string {
  return `<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:hdl21="https://github.com/hdl21/hdl21schematics"
  width="400"
  height="400"
>
  <hdl21:schematic name="${name}" prelude="">
  </hdl21:schematic>
  <!-- Symbol graphics go here -->
  <rect x="150" y="150" width="100" height="100" fill="none" stroke="black" stroke-width="2"/>
  <text x="200" y="205" text-anchor="middle" font-size="14">${name}</text>
</svg>`;
}

function createEmptyScript(name: string): string {
  return `"""
HDL21 Generator: ${name}

This script defines an HDL21 generator that can be used as a component
in hierarchical schematic designs.
"""

import hdl21 as h
from hdl21.primitives import *


@h.generator
def ${name}(params: h.HasNoParams) -> h.Module:
    """
    ${name} generator.

    Args:
        params: Generator parameters (none required by default)

    Returns:
        HDL21 Module
    """
    m = h.Module()

    # Define ports
    # m.vdd = h.Port()
    # m.vss = h.Port()
    # m.inp = h.Port()
    # m.out = h.Port()

    # Add instances
    # m.nmos1 = Nmos()(g=m.inp, d=m.out, s=m.vss, b=m.vss)

    return m
`;
}
