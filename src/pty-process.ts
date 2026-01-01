/**
 * PtyProcess - Wrapper around Bun.Terminal + Bun.spawn for PTY-based process management
 *
 * Provides a clean API for spawning processes with pseudo-terminals and managing their lifecycle.
 */

import type { Subprocess } from "bun";

export interface PtyProcessOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export interface PtyProcessEvents {
  data: (data: Uint8Array) => void;
  exit: (exitCode: number, signal: string | null) => void;
}

export class PtyProcess {
  private terminal: InstanceType<typeof Bun.Terminal> | null = null;
  private subprocess: ReturnType<typeof Bun.spawn> | null = null;
  private listeners: Partial<Record<keyof PtyProcessEvents, Function[]>> = {};
  private _closed: boolean = false;
  private _pid: number | null = null;

  constructor(private options: PtyProcessOptions) {}

  /**
   * Start the process with a PTY
   */
  async start(): Promise<void> {
    if (this.terminal) {
      throw new Error("Process already started");
    }

    const { command, args = [], cwd, env, cols = 80, rows = 24 } = this.options;

    // Create the terminal
    this.terminal = new Bun.Terminal({
      cols,
      rows,
      data: (_term, data) => {
        this.emit("data", data);
      },
      exit: (_term, exitCode, signal) => {
        // Note: This is PTY lifecycle, not process exit
        // We primarily rely on subprocess.exited for process exit
      },
    });

    // Build the command - if args provided, use them; otherwise check if we need shell wrapping
    let spawnArgs: string[];
    if (args.length > 0) {
      spawnArgs = [command, ...args];
    } else {
      // Check if command needs shell interpretation (has spaces, pipes, redirects, etc.)
      // Simple commands like "bash" or "/bin/sh" can be spawned directly
      const needsShell = /[\s|&;<>()$`\\"\']/.test(command);
      if (needsShell) {
        // Use shell to interpret the command string
        spawnArgs = ["sh", "-c", command];
      } else {
        // Simple command - spawn directly for better signal handling
        spawnArgs = [command];
      }
    }

    // Spawn the subprocess connected to the terminal
    this.subprocess = Bun.spawn(spawnArgs, {
      terminal: this.terminal,
      cwd,
      env: env ? { ...process.env, ...env } : undefined,
    });

    this._pid = this.subprocess.pid;

    // Handle process exit
    this.subprocess.exited.then((exitCode) => {
      const signal = this.subprocess?.signalCode ?? null;
      this._closed = true;
      this.emit("exit", exitCode, signal);
      this.cleanup();
    });
  }

  /**
   * Write data to the terminal (sends to process stdin)
   */
  write(data: string | Uint8Array): number {
    if (!this.terminal || this._closed) {
      return 0;
    }
    return this.terminal.write(data);
  }

  /**
   * Resize the terminal
   */
  resize(cols: number, rows: number): void {
    if (!this.terminal || this._closed) {
      return;
    }
    this.terminal.resize(cols, rows);
  }

  /**
   * Send a signal to child processes (for SIGINT) or the process itself
   *
   * For SIGINT, we signal child processes directly since Bun.Terminal doesn't
   * set up proper job control and bash won't forward signals to its children.
   */
  kill(signal: NodeJS.Signals = "SIGTERM"): void {
    if (!this.subprocess || this._closed || !this._pid) {
      return;
    }

    if (signal === "SIGINT") {
      // For SIGINT, find and signal child processes
      // This is necessary because bash won't forward SIGINT without job control
      try {
        const result = Bun.spawnSync(["pgrep", "-P", String(this._pid)]);
        const output = result.stdout.toString().trim();
        if (output) {
          const childPids = output.split("\n").map((p) => parseInt(p, 10));
          for (const childPid of childPids) {
            if (!isNaN(childPid)) {
              try {
                process.kill(childPid, signal);
              } catch {
                // Child may have already exited
              }
            }
          }
          return; // Don't kill the shell itself
        }
      } catch {
        // pgrep failed, fall through to direct signal
      }
    }

    // For other signals or if no children found, signal the process directly
    this.subprocess.kill(signal);
  }

  /**
   * Close the terminal and kill the process
   */
  close(): void {
    if (this._closed) {
      return;
    }

    // Kill the process first
    if (this.subprocess) {
      this.subprocess.kill("SIGTERM");
    }

    this.cleanup();
  }

  private cleanup(): void {
    if (this.terminal && !this.terminal.closed) {
      this.terminal.close();
    }
    this.terminal = null;
    this.subprocess = null;
    this._closed = true;
  }

  /**
   * The process ID of the spawned subprocess
   */
  get pid(): number | null {
    return this._pid;
  }

  /**
   * Whether the process has exited and terminal is closed
   */
  get closed(): boolean {
    return this._closed;
  }

  /**
   * Get terminal dimensions
   */
  get dimensions(): { cols: number; rows: number } {
    return {
      cols: this.options.cols ?? 80,
      rows: this.options.rows ?? 24,
    };
  }

  // Event handling
  on<K extends keyof PtyProcessEvents>(
    event: K,
    handler: PtyProcessEvents[K],
  ): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(handler as Function);
  }

  off<K extends keyof PtyProcessEvents>(
    event: K,
    handler?: PtyProcessEvents[K],
  ): void {
    if (!handler) {
      delete this.listeners[event];
    } else {
      const handlers = this.listeners[event];
      if (handlers) {
        const index = handlers.indexOf(handler as Function);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    }
  }

  private emit<K extends keyof PtyProcessEvents>(
    event: K,
    ...args: Parameters<PtyProcessEvents[K]>
  ): void {
    const handlers = this.listeners[event];
    if (handlers) {
      for (const handler of handlers) {
        (handler as Function)(...args);
      }
    }
  }
}
