import * as vscode from "vscode";
import { TextDecoder } from "util";
import * as path from "path";
import * as fs from "fs";
import { PythonBridge, DeviceInfo, ParamInfo } from "./PythonBridge";
import { registerComponentsExplorer } from "./PdkExplorerProvider";
import { registerHierarchy } from "./HierarchyProvider";

export function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Read text content from the file at `uri`.
async function readFile(uri: vscode.Uri): Promise<string> {
  if (uri.scheme === "untitled") {
    return ""; // New file, no content.
  }
  const bytes = await vscode.workspace.fs.readFile(uri);
  return new TextDecoder("utf-8").decode(bytes);
}

// # Schematic Document Model
//
// Implementer of VsCode's `CustomDocument` interface,
// which really just consists of its `uri` and `dispose` method.
//
// Much of the work which the VsCode API requests via calls to `SchematicEditorProvider`
// is offloaded to each individual `SchematicDocument` instance.
//
// File type detection
enum SchematicFileType {
  Schematic = "schematic", // .sch.svg
  Symbol = "symbol", // .sym.svg
}

function getFileType(uri: vscode.Uri): SchematicFileType {
  const fileName = path.basename(uri.fsPath);
  if (fileName.endsWith(".sym.svg")) {
    return SchematicFileType.Symbol;
  }
  return SchematicFileType.Schematic;
}

// Extract port names from SVG content using regex
// Ports are marked with class="hdl21-port-*" and have a name in a text element
function extractPortNames(svgContent: string): string[] {
  const portNames: string[] = [];
  // Match port groups and extract name from text element
  // Pattern: <g class="hdl21-port-*">...<text ...>portname</text>...</g>
  const portGroupRegex =
    /<g[^>]*class="hdl21-port-[^"]*"[^>]*>[\s\S]*?<text[^>]*>([^<]+)<\/text>[\s\S]*?<\/g>/gi;
  let match;
  while ((match = portGroupRegex.exec(svgContent)) !== null) {
    if (match[1]) {
      portNames.push(match[1].trim());
    }
  }
  return portNames;
}

class SchematicDocument implements vscode.CustomDocument {
  // The `CustomDocument` Interface
  readonly uri: vscode.Uri;
  readonly fileType: SchematicFileType;

  public dispose(): any {
    // Does nothing.
    // If we eventually add any subscriptions or event listeners,
    // we'll need to dispose of them here.
  }

  static async create(
    uri: vscode.Uri,
    backupId: string | undefined,
    provider: SchematicEditorProvider
  ): Promise<SchematicDocument | PromiseLike<SchematicDocument>> {
    // If we have a backup, read that. Otherwise read the resource from the workspace
    const dataFile =
      typeof backupId === "string" ? vscode.Uri.parse(backupId) : uri;
    const fileData = await readFile(dataFile);
    return new SchematicDocument(uri, fileData, provider);
  }

  // SVG string value of the document
  documentData: string;
  // Reference to the provider
  provider: SchematicEditorProvider;
  // Reference to our webview panel.
  // Set to `null` at creation time, and then set during `resolveCustomEditor`.
  webviewPanel: vscode.WebviewPanel | null;
  // Promise resolver for pending content request (used during save)
  private pendingContentResolver: ((content: string) => void) | null = null;

  private constructor(
    uri: vscode.Uri,
    initialContent: string,
    provider: SchematicEditorProvider
  ) {
    this.uri = uri;
    this.documentData = initialContent;
    this.provider = provider;
    this.webviewPanel = null;
    this.fileType = getFileType(uri);
  }

  // Get the path to the linked file (symbol ↔ schematic)
  getLinkedFilePath(): string | null {
    const filePath = this.uri.fsPath;
    if (this.fileType === SchematicFileType.Symbol) {
      // Symbol file -> look for schematic
      return filePath.replace(".sym.svg", ".sch.svg");
    } else {
      // Schematic file -> look for symbol
      return filePath.replace(".sch.svg", ".sym.svg");
    }
  }

  // Check if the linked file exists
  async linkedFileExists(): Promise<boolean> {
    const linkedPath = this.getLinkedFilePath();
    if (!linkedPath) return false;
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(linkedPath));
      return true;
    } catch {
      return false;
    }
  }

  // Read the linked file content
  async readLinkedFile(): Promise<string | null> {
    const linkedPath = this.getLinkedFilePath();
    if (!linkedPath) return null;
    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.file(linkedPath)
      );
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return null;
    }
  }

  // Compute and send symbol validation to the editor
  async sendSymbolValidation(): Promise<void> {
    const hasImplementation = await this.linkedFileExists();
    const linkedContent = hasImplementation ? await this.readLinkedFile() : null;

    // Extract ports from current file
    const currentPorts = extractPortNames(this.documentData);

    // Extract ports from linked file
    const linkedPorts = linkedContent ? extractPortNames(linkedContent) : [];

    // Compute port status
    let symbolPorts: string[];
    let schematicPorts: string[];

    if (this.fileType === SchematicFileType.Symbol) {
      symbolPorts = currentPorts;
      schematicPorts = linkedPorts;
    } else {
      symbolPorts = linkedPorts;
      schematicPorts = currentPorts;
    }

    // Build port status array
    const portStatuses = symbolPorts.map((portName) => ({
      name: portName,
      status: schematicPorts.includes(portName)
        ? ("matched" as const)
        : ("unimplemented" as const),
    }));

    // Find unconnected ports (in schematic but not in symbol)
    const unconnectedPorts = schematicPorts.filter(
      (p) => !symbolPorts.includes(p)
    );

    this.sendMessage({
      kind: "symbol-validation",
      body: {
        fileType: this.fileType,
        isSymbol: this.fileType === SchematicFileType.Symbol,
        hasImplementation,
        implementationPath: this.getLinkedFilePath(),
        symbolPorts: portStatuses,
        unconnectedPorts,
      },
    });
  }

  // Save to our current location
  async save(cancellation: vscode.CancellationToken): Promise<void> {
    await this.saveAs(this.uri, cancellation);
  }

  // Request current content from the webview
  private async requestContent(): Promise<string> {
    return new Promise((resolve) => {
      // Set up the resolver to be called when save-file message arrives
      this.pendingContentResolver = resolve;
      // Request content from the webview
      this.sendMessage({ kind: "request-content" });
      // Timeout after 5 seconds and use existing data
      setTimeout(() => {
        if (this.pendingContentResolver) {
          console.log("Content request timed out, using cached data");
          this.pendingContentResolver = null;
          resolve(this.documentData);
        }
      }, 5000);
    });
  }

  // Save to a new location. *Does not* update our URI field.
  async saveAs(
    targetResource: vscode.Uri,
    cancellation: vscode.CancellationToken
  ): Promise<void> {
    console.log("SAVE AS");
    if (cancellation.isCancellationRequested) {
      return;
    }
    // Request fresh content from the webview before saving
    const content = await this.requestContent();
    const bytes = new TextEncoder().encode(content);
    await vscode.workspace.fs.writeFile(targetResource, bytes);
  }

  // Revert to the content on disk
  async revert(_cancellation: vscode.CancellationToken): Promise<void> {
    // Reload the data from disk
    this.documentData = await readFile(this.uri);
    // Send it to the webview for rendering
    this.sendMessage({ kind: "load-file", body: this.documentData });
    // Notify the VsCode API that we've reverted
    // FIXME: does it want us to do this? Their example does.
    this.notifyChange();
  }

  // Back up to a temporary destination
  async backup(
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken
  ): Promise<vscode.CustomDocumentBackup> {
    // Save to the destination
    await this.saveAs(destination, cancellation);

    // And give VsCode a function to delete it
    const deleter = async () => {
      try {
        await vscode.workspace.fs.delete(destination);
      } catch {
        /* noop */
      }
    };
    return {
      id: destination.toString(),
      delete: deleter,
    };
  }

  // Send a message to the webiew
  private sendMessage(msg: any) {
    if (!this.webviewPanel) {
      console.log("ERROR: sendMessage called with no webviewPanel");
      return;
    }
    return this.webviewPanel.webview.postMessage(msg);
  }
  undo() {
    console.log("GOT AN UNDO!"); // FIXME!
  }
  redo() {
    console.log("GOT AN UNDO!"); // FIXME!
  }
  // Notify VsCode of a change to the document
  notifyChange() {
    return this.provider.changer.fire({
      document: this,
      undo: this.undo.bind(this),
      redo: this.redo.bind(this),
    });
  }

  // Send a PDK device to the webview to be added to the schematic
  sendPdkDevice(device: DeviceInfo, pdkName: string) {
    this.sendMessage({
      kind: "add-pdk-device",
      body: { device, pdkName },
    });
    // Request focus so keyboard shortcuts work
    this.requestFocus();
  }

  // Request the webview to focus for keyboard input
  requestFocus() {
    this.sendMessage({ kind: "request-focus" });
  }

  // Send a custom symbol to the webview to be added to the schematic
  async sendCustomSymbol(symbolPath: string) {
    // Read the symbol file to extract ports and get the SVG content
    const symbolContent = await readFile(vscode.Uri.file(symbolPath));
    const ports = extractPortNames(symbolContent);
    const symbolName = path.basename(symbolPath).replace(".sym.svg", "");

    this.sendMessage({
      kind: "add-custom-symbol",
      body: {
        name: symbolName,
        path: symbolPath,
        ports,
        svgContent: symbolContent, // Include the full SVG content
      },
    });
    // Request focus so keyboard shortcuts work
    this.requestFocus();
  }

  // Handle incoming messages from the webview process.
  async handleMessage(msg: any) {
    switch (msg.kind) {
      case "renderer-up": {
        // Editor has reported it's alive, send it some schematic content
        const content = await readFile(this.uri);
        this.sendMessage({
          kind: "load-file",
          body: content,
        });
        // Send symbol validation info for hierarchical diagram support
        return this.sendSymbolValidation();
      }
      case "change": {
        console.log("GOT CHANGE MESSAGE");
        console.log(msg);
        return this.notifyChange();
      }
      case "save-file": {
        // Update the document data with content from the webview
        this.documentData = msg.body;
        // If we're waiting for content (during save), resolve the promise
        if (this.pendingContentResolver) {
          this.pendingContentResolver(msg.body);
          this.pendingContentResolver = null;
        }
        return;
      }
      case "log-in-main":
        return console.log(msg.body);
      case "open-schematic": {
        // Open implementation file when user double-clicks a custom symbol
        // Supports both schematic (.sch.svg) and generator (.py) files
        const { symbolPath, componentName } = msg.body;

        // Compute potential implementation paths
        const schematicPath = symbolPath.replace(".sym.svg", ".sch.svg");
        const scriptPath = symbolPath.replace(".sym.svg", ".py");

        const schematicExists = fs.existsSync(schematicPath);
        const scriptExists = fs.existsSync(scriptPath);

        if (schematicExists && scriptExists) {
          // Both exist - let user choose
          vscode.window.showQuickPick(
            [
              { label: "$(file) Open Schematic", detail: schematicPath, target: "schematic" },
              { label: "$(code) Open Script", detail: scriptPath, target: "script" }
            ],
            { placeHolder: `Open ${componentName} implementation...` }
          ).then(selection => {
            if (selection?.target === "schematic") {
              vscode.commands.executeCommand(
                "vscode.openWith",
                vscode.Uri.file(schematicPath),
                "hdl21.schematics"
              );
            } else if (selection?.target === "script") {
              vscode.workspace.openTextDocument(scriptPath).then(doc =>
                vscode.window.showTextDocument(doc)
              );
            }
          });
        } else if (schematicExists) {
          // Only schematic exists
          vscode.commands.executeCommand(
            "vscode.openWith",
            vscode.Uri.file(schematicPath),
            "hdl21.schematics"
          );
        } else if (scriptExists) {
          // Only script exists
          vscode.workspace.openTextDocument(scriptPath).then(doc =>
            vscode.window.showTextDocument(doc)
          );
        } else {
          // Neither exists
          vscode.window.showWarningMessage(
            `No implementation found for ${componentName}. Create ${componentName}.sch.svg or ${componentName}.py.`
          );
        }
        return;
      }
      default: {
        console.log("UNKNOWN MESSAGE KIND: ");
        console.log(msg);
      }
    }
  }
}

//
// # Schematic Editor Provider
//
// Implements the `CustomEditorProvider` interface, which is the main entry point
// for most of the VsCode API.
// Manages all `SchematicDocument` instances, forwarding many of the VsCode API
// calls to the appropriate `SchematicDocument` instance.
//
export class SchematicEditorProvider
  implements vscode.CustomEditorProvider<SchematicDocument>
{
  constructor(private readonly context: vscode.ExtensionContext) {
    this.context = context;
  }
  // Global counter of files, largely for new-file naming
  static newSchematicFileId = 1;

  // Track active document for PDK device insertion
  private activeDocument: SchematicDocument | null = null;

  // Get the currently active schematic document
  getActiveDocument(): SchematicDocument | null {
    return this.activeDocument;
  }

  /*
   * # The `CustomEditorProvider` Interface
   */
  async openCustomDocument(
    uri: vscode.Uri,
    openContext: { backupId?: string },
    _token: vscode.CancellationToken
  ): Promise<SchematicDocument> {
    const document: SchematicDocument = await SchematicDocument.create(
      uri,
      openContext.backupId,
      this
    );
    return document;
  }

  // "Resolve" the combination of a document and a webview.
  async resolveCustomEditor(
    document: SchematicDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Give the document a reference to its webview panel
    document.webviewPanel = webviewPanel;

    // Track this as the active document
    this.activeDocument = document;

    // Setup initial content for the webview
    const { webview } = webviewPanel;
    webview.options = { enableScripts: true };
    webview.html = this.initialHtml(webview);

    // And register the document handler for incoming messages from the webview
    webview.onDidReceiveMessage(document.handleMessage.bind(document));

    // Track when this panel becomes active/inactive
    webviewPanel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) {
        this.activeDocument = document;
      }
    });

    // Clear active document when panel is disposed
    webviewPanel.onDidDispose(() => {
      if (this.activeDocument === document) {
        this.activeDocument = null;
      }
    });

    // FIXME: roll in this editable vs read-only stuff
    // const editable = vscode.workspace.fs.isWritableFileSystem(
    //   document.uri.scheme
    // );
  }

  // The change-notification event system.
  // Each `SchematicDocument` has a reference to us, and fires this event it when it changes.
  public changer = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<SchematicDocument>
  >();
  // This `event` field is the part the `CustomEditorProvider` interface requires.
  public readonly onDidChangeCustomDocument = this.changer.event;

  public saveCustomDocument(
    document: SchematicDocument,
    cancellation: vscode.CancellationToken
  ): Thenable<void> {
    return document.save(cancellation);
  }

  public saveCustomDocumentAs(
    document: SchematicDocument,
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken
  ): Thenable<void> {
    return document.saveAs(destination, cancellation);
  }

  public revertCustomDocument(
    document: SchematicDocument,
    cancellation: vscode.CancellationToken
  ): Thenable<void> {
    return document.revert(cancellation);
  }

  public backupCustomDocument(
    document: SchematicDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken
  ): Thenable<vscode.CustomDocumentBackup> {
    return document.backup(context.destination, cancellation);
  }
  /*
   * # End the `CustomEditorProvider` Interface
   */

  // Get the initial HTML for `webview`.
  private initialHtml(webview: vscode.Webview): string {
    // Get the script-path, through VsCode's required URI methods
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "out", "webview.js")
    );
    // Set the CSP to only allow scripts with a specific nonce, generated in this function.
    const nonce = getNonce();
    // FIXME: get rid of the `unsafe-inline` style-tags here, as it says they are "unsafe"
    return /* html */ `
      <!DOCTYPE html>
      <html lang="en" style="margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden;">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
          }
          #tbd {
            width: 100%;
            height: 100%;
          }
        </style>
      </head>
      <body>
        <!-- Note VsCode does seem to care that this script is part of body and not head. -->
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}

// # Activation
//
// Primary VsCode entry point for registering the extension.
//
export async function activate(context: vscode.ExtensionContext) {
  const viewType = "hdl21.schematics";

  // Initialize Python bridge for PDK discovery
  const pythonBridge = new PythonBridge(context);

  // Create the schematic editor provider first (needed by components explorer)
  const editorProvider = new SchematicEditorProvider(context);

  // Register Components Explorer sidebar
  const componentsExplorer = registerComponentsExplorer(context, pythonBridge, editorProvider);

  // Register Design Hierarchy sidebar
  registerHierarchy(context, editorProvider);

  // Add known local PDK paths for development
  // Check for Hdl21 PDKs relative to the extension path
  const extensionPath = context.extensionPath;

  // Look for PDKs in common locations relative to the extension
  const potentialPdkPaths = [
    // Relative to extension: up to Hdl21Schematics, then sibling Hdl21 repo
    path.join(extensionPath, "..", "..", "..", "..", "Hdl21", "pdks", "Gf180"),
    path.join(extensionPath, "..", "..", "..", "..", "Hdl21", "pdks", "Sky130"),
    path.join(extensionPath, "..", "..", "..", "..", "Hdl21", "pdks", "Asap7"),
    // Workspace folder PDKs
    ...(vscode.workspace.workspaceFolders?.map((f) =>
      path.join(f.uri.fsPath, "..", "Hdl21", "pdks", "Gf180")
    ) || []),
  ];

  // Add any valid PDK paths we find
  for (const pdkPath of potentialPdkPaths) {
    try {
      const normalizedPath = path.resolve(pdkPath);
      if (fs.existsSync(normalizedPath)) {
        console.log(`Found potential PDK at: ${normalizedPath}`);
        // Add the path - this will be used when discoverPdks is called
        pythonBridge.addLocalPath(normalizedPath).catch((e) => {
          console.log(`Failed to add PDK path ${normalizedPath}: ${e}`);
        });
      }
    } catch (e) {
      // Ignore errors for paths that don't exist
    }
  }

  // Register command to add local PDK path
  context.subscriptions.push(
    vscode.commands.registerCommand("hdl21.pdk.addLocalPath", async () => {
      const folderUri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "Select PDK Directory",
        title: "Select Local HDL21 PDK Directory",
      });

      if (folderUri && folderUri.length > 0) {
        const pdkPath = folderUri[0].fsPath;
        const success = await pythonBridge.addLocalPath(pdkPath);
        if (success) {
          vscode.window.showInformationMessage(
            `Added local PDK path: ${pdkPath}`
          );
          componentsExplorer.refresh();
        } else {
          vscode.window.showErrorMessage(
            `Failed to add PDK path: ${pdkPath}. Make sure it contains a valid HDL21 PDK module.`
          );
        }
      }
    })
  );

  vscode.commands.registerCommand("hdl21.schematics.new", () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("Requires opening a workspace");
      return;
    }

    const uri = vscode.Uri.joinPath(
      workspaceFolders[0].uri,
      `schematic${SchematicEditorProvider.newSchematicFileId++}.sch.svg`
    ).with({ scheme: "untitled" });

    vscode.commands.executeCommand("vscode.openWith", uri, viewType);
  });

  // Register command to add PDK device to active schematic
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "hdl21.pdk.addDevice",
      (arg1: DeviceInfo | any, arg2?: string) => {
        // Handle both invocation cases:
        // 1. From tree item click: (device, pdkName) as separate arguments
        // 2. From context menu inline button: (treeItem) as single argument
        let device: DeviceInfo;
        let pdkName: string;

        if (arg1 && arg1.device && arg1.pdkName) {
          // Called from context menu - arg1 is a DeviceNode tree item
          device = arg1.device;
          pdkName = arg1.pdkName;
        } else if (arg1 && arg2) {
          // Called from tree item command.arguments
          device = arg1;
          pdkName = arg2;
        } else {
          vscode.window.showErrorMessage(
            "Invalid device. Please try again or refresh the components view."
          );
          return;
        }

        // Get the active schematic document
        const activeDocument = editorProvider.getActiveDocument();
        if (!activeDocument) {
          vscode.window.showWarningMessage(
            "No schematic editor is active. Open a .sch.svg file first."
          );
          return;
        }

        // Prevent adding devices to symbol files
        if (activeDocument.uri.fsPath.endsWith(".sym.svg")) {
          vscode.window.showWarningMessage(
            "Cannot add components to a symbol file. Open a .sch.svg schematic file instead."
          );
          return;
        }

        // Send device directly to schematic - user can double-click to edit params
        activeDocument.sendPdkDevice(device, pdkName);

        // Reveal and focus the webview so keyboard shortcuts (R/H/V) work
        if (activeDocument.webviewPanel) {
          activeDocument.webviewPanel.reveal(undefined, true);
        }
      }
    )
  );

  const registration = vscode.window.registerCustomEditorProvider(
    viewType,
    editorProvider,
    {
      // `retainContextWhenHidden` keeps the webview alive even when it is not visible.
      // VsCode offers many admonitions *not* to use this, if we can ever get away from it.
      webviewOptions: { retainContextWhenHidden: true },
      // We *do not* support multiple webviews per document.
      // Doing so would change quite a bit of how the editor works,
      // e.g. to update the graphical display of one while the other is edited.
      supportsMultipleEditorsPerDocument: false,
    }
  );

  // Register cleanup on deactivation
  context.subscriptions.push({
    dispose: () => {
      pythonBridge.stop();
    },
  });

  // Finally, register it with the VsCode `context`.
  context.subscriptions.push(registration);

  // Show welcome message on first activation
  showWelcomeMessage(context);
}

// Show a welcome message to users when no schematic is open
function showWelcomeMessage(context: vscode.ExtensionContext) {
  // Check if we've shown the welcome message before
  const hasShownWelcome = context.globalState.get<boolean>(
    "hdl21.hasShownWelcome"
  );

  if (!hasShownWelcome) {
    vscode.window
      .showInformationMessage(
        "Welcome to HDL21 Schematics! Open a .sch.svg or .sym.svg file to start editing.",
        "Create New Schematic",
        "Got it!"
      )
      .then((selection) => {
        if (selection === "Create New Schematic") {
          vscode.commands.executeCommand("hdl21.schematics.new");
        }
      });

    // Mark that we've shown the welcome message
    context.globalState.update("hdl21.hasShownWelcome", true);
  }
}
