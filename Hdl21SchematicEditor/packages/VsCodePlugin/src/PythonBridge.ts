/**
 * PythonBridge - Manages communication with the Python PDK discovery service
 *
 * Spawns a Python process running the pdk_discovery module and communicates
 * via JSON-RPC over stdin/stdout.
 */

import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";
import * as readline from "readline";
import * as path from "path";

// Type definitions matching the Python dataclasses

export interface PortInfo {
  name: string;
  direction: string;
}

export interface ParamInfo {
  name: string;
  dtype: string;
  default: any;
  description: string;
}

export interface DeviceInfo {
  name: string;
  module_path: string;
  category: string;
  ports: PortInfo[];
  params: ParamInfo[];
  symbol_type: string;
}

export interface PdkInfo {
  name: string;
  version: string;
  description: string;
  devices: DeviceInfo[];
}

interface CommandResponse {
  status: "ok" | "error";
  message?: string;
  pdks?: PdkInfo[];
  device?: DeviceInfo;
  output?: string;
}

type ResponseCallback = (response: CommandResponse) => void;

export class PythonBridge {
  private process: ChildProcess | null = null;
  private responseQueue: ResponseCallback[] = [];
  private isStarting = false;
  private startPromise: Promise<void> | null = null;
  private outputChannel: vscode.OutputChannel;

  constructor(private context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel("HDL21 PDK Discovery");
  }

  private log(message: string) {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }

  /**
   * Start the Python discovery service
   */
  async start(): Promise<void> {
    if (this.process) {
      return; // Already running
    }

    if (this.isStarting && this.startPromise) {
      return this.startPromise;
    }

    this.isStarting = true;
    this.startPromise = this.doStart();

    try {
      await this.startPromise;
    } finally {
      this.isStarting = false;
    }
  }

  private async doStart(): Promise<void> {
    const pythonPath = await this.getPythonPath();

    // Get the path to the pdk_discovery.py script
    // The extension is at Hdl21SchematicEditor/packages/VsCodePlugin
    // The script is at Hdl21SchematicImporter/hdl21schematicimporter/pdk_discovery.py
    const extensionPath = this.context.extensionPath;
    const scriptPath = path.join(
      extensionPath,
      "..",
      "..",
      "..",
      "Hdl21SchematicImporter",
      "hdl21schematicimporter",
      "pdk_discovery.py"
    );

    this.log(`Starting Python bridge...`);
    this.log(`Python path: ${pythonPath}`);
    this.log(`Script path: ${scriptPath}`);
    this.log(`Extension path: ${extensionPath}`);

    return new Promise((resolve, reject) => {
      try {
        // Run the script directly instead of as a module
        this.process = spawn(pythonPath, [scriptPath]);
        this.log(`Spawned Python process with PID: ${this.process.pid}`);

        if (!this.process.stdout || !this.process.stdin) {
          reject(new Error("Failed to create Python process streams"));
          return;
        }

        // Set up response reader
        const rl = readline.createInterface({
          input: this.process.stdout,
        });

        rl.on("line", (line) => {
          this.log(`Python response: ${line}`);
          try {
            const response = JSON.parse(line) as CommandResponse;
            const callback = this.responseQueue.shift();
            if (callback) {
              callback(response);
            }
          } catch (e) {
            this.log(`Failed to parse Python response: ${line}`);
          }
        });

        // Handle stderr for debugging
        if (this.process.stderr) {
          this.process.stderr.on("data", (data) => {
            const msg = data.toString();
            this.log(`Python stderr: ${msg}`);
          });
        }

        this.process.on("error", (err) => {
          this.log(`Python process error: ${err.message}`);
          vscode.window.showErrorMessage(`PDK Discovery error: ${err.message}`);
          this.process = null;
          reject(err);
        });

        this.process.on("exit", (code) => {
          this.log(`Python process exited with code ${code}`);
          this.process = null;
          // Reject any pending callbacks
          while (this.responseQueue.length > 0) {
            const cb = this.responseQueue.shift();
            if (cb) {
              cb({ status: "error", message: "Process exited" });
            }
          }
        });

        // Send a ping to verify the process is working
        this.sendCommand({ action: "ping" })
          .then((response) => {
            if (response.status === "ok") {
              resolve();
            } else {
              reject(new Error("Python process ping failed"));
            }
          })
          .catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Stop the Python discovery service
   */
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.responseQueue = [];
  }

  /**
   * Get the Python interpreter path
   */
  private async getPythonPath(): Promise<string> {
    // Try to use the Python extension's selected interpreter
    const pythonExt = vscode.extensions.getExtension("ms-python.python");

    if (pythonExt) {
      try {
        if (!pythonExt.isActive) {
          await pythonExt.activate();
        }

        const api = pythonExt.exports;

        // Try different API methods based on Python extension version
        if (api?.settings?.getExecutionDetails) {
          const details = api.settings.getExecutionDetails(
            vscode.workspace.workspaceFolders?.[0]?.uri
          );
          if (details?.execCommand?.[0]) {
            return details.execCommand[0];
          }
        }

        // Alternative API for newer versions
        if (api?.environments?.getActiveEnvironmentPath) {
          const envPath = await api.environments.getActiveEnvironmentPath(
            vscode.workspace.workspaceFolders?.[0]?.uri
          );
          if (envPath?.path) {
            return envPath.path;
          }
        }
      } catch (e) {
        console.log("Could not get Python path from extension:", e);
      }
    }

    // Check workspace settings
    const config = vscode.workspace.getConfiguration("python");
    const pythonPath = config.get<string>("pythonPath");
    if (pythonPath && pythonPath !== "python") {
      return pythonPath;
    }

    // Fallback to system Python
    return process.platform === "win32" ? "python" : "python3";
  }

  /**
   * Send a command to the Python service
   */
  private sendCommand(cmd: Record<string, any>): Promise<CommandResponse> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        reject(new Error("Python bridge not started"));
        return;
      }

      const timeout = setTimeout(() => {
        // Remove callback from queue
        const idx = this.responseQueue.indexOf(resolve as any);
        if (idx >= 0) {
          this.responseQueue.splice(idx, 1);
        }
        reject(new Error("Command timeout"));
      }, 30000); // 30 second timeout

      this.responseQueue.push((response) => {
        clearTimeout(timeout);
        resolve(response);
      });

      const commandStr = JSON.stringify(cmd) + "\n";
      this.process.stdin.write(commandStr);
    });
  }

  /**
   * Ensure the bridge is started before running a command
   */
  private async ensureStarted(): Promise<void> {
    if (!this.process) {
      await this.start();
    }
  }

  /**
   * Discover all installed PDKs
   */
  async discoverPdks(): Promise<PdkInfo[]> {
    await this.ensureStarted();

    try {
      const response = await this.sendCommand({ action: "discover" });

      if (response.status === "ok" && response.pdks) {
        return response.pdks;
      }

      console.error("Failed to discover PDKs:", response.message);
      return [];
    } catch (e) {
      console.error("Error discovering PDKs:", e);
      return [];
    }
  }

  /**
   * Install a PDK package
   */
  async installPdk(
    packageName: string
  ): Promise<{ status: string; output: string }> {
    await this.ensureStarted();

    try {
      const response = await this.sendCommand({
        action: "install",
        package: packageName,
      });

      return {
        status: response.status,
        output: response.output || response.message || "",
      };
    } catch (e) {
      return {
        status: "error",
        output: String(e),
      };
    }
  }

  /**
   * Get detailed information about a specific device
   */
  async getDeviceDetails(
    pdkName: string,
    deviceName: string
  ): Promise<DeviceInfo | null> {
    await this.ensureStarted();

    try {
      const response = await this.sendCommand({
        action: "get_device_details",
        pdk: pdkName,
        device: deviceName,
      });

      if (response.status === "ok" && response.device) {
        return response.device;
      }

      return null;
    } catch (e) {
      console.error("Error getting device details:", e);
      return null;
    }
  }

  /**
   * Add a local PDK path for discovery
   */
  async addLocalPath(pdkPath: string): Promise<boolean> {
    await this.ensureStarted();

    try {
      this.log(`Adding local PDK path: ${pdkPath}`);
      const response = await this.sendCommand({
        action: "add_local_path",
        path: pdkPath,
      });

      if (response.status === "ok") {
        this.log(`Successfully added local PDK path: ${pdkPath}`);
        return true;
      }

      this.log(`Failed to add local PDK path: ${response.message}`);
      return false;
    } catch (e) {
      this.log(`Error adding local PDK path: ${e}`);
      return false;
    }
  }

  /**
   * Get the extension path for finding relative PDK directories
   */
  getExtensionPath(): string {
    return this.context.extensionPath;
  }
}
