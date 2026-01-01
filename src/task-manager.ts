/**
 * TaskManager - State management for tasks
 * Layout-agnostic: provides data and operations, UI consumes it
 */

import { randomUUID } from "crypto";
import { appendFileSync } from "fs";
import type { Task, TaskStatus, TaskConfig } from "./task-types";
import { PtyProcess } from "./pty-process";

const DEBUG_LOG = "/tmp/tuirnr-debug.txt";
const DEBUG_ENABLED = false; // Set to true to enable debug logging
function debugLog(msg: string) {
  if (!DEBUG_ENABLED) return;
  try {
    appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

export interface TaskManagerEvents {
  taskAdded: (task: Task) => void;
  taskUpdated: (task: Task) => void;
  taskRemoved: (taskId: string) => void;
  taskOutputAppended: (taskId: string, text: string) => void;
  activeTaskChanged: (taskId: string | null) => void;
}

export class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private activeTaskId: string | null = null;
  private listeners: Partial<Record<keyof TaskManagerEvents, Function[]>> = {};
  private maxOutputLines: number = 2000;
  private defaultCols: number = 80;
  private defaultRows: number = 24;

  constructor() {}

  /**
   * Set the default terminal size for new tasks
   */
  setDefaultTerminalSize(cols: number, rows: number): void {
    this.defaultCols = cols;
    this.defaultRows = rows;
    debugLog(`Set default terminal size: ${cols}x${rows}`);
  }

  /**
   * Get the current default terminal size
   */
  getDefaultTerminalSize(): { cols: number; rows: number } {
    return { cols: this.defaultCols, rows: this.defaultRows };
  }

  // Task lifecycle
  createTask(command: string, args: string[] = [], name?: string): Task {
    const task: Task = {
      id: randomUUID(),
      name: name || command,
      command,
      args,
      status: "idle",
      rawOutput: "",
      createdAt: new Date(),
      restartCount: 0,
    };
    this.tasks.set(task.id, task);
    this.emit("taskAdded", task);

    // Auto-select first task
    if (this.tasks.size === 1) {
      this.setActiveTask(task.id);
    }

    // Auto-start the task after a delay to allow UI to set terminal size
    debugLog(`Scheduling auto-start for task: ${task.id}`);
    setTimeout(() => {
      debugLog(`Auto-start timeout fired for: ${task.id}`);
      this.startTask(task.id);
    }, 150);

    return task;
  }

  createTaskFromConfig(config: TaskConfig): Task {
    const task: Task = {
      id: randomUUID(),
      name: config.name || config.command,
      command: config.command,
      args: config.args || [],
      cwd: config.cwd,
      env: config.env,
      status: "idle",
      rawOutput: "",
      createdAt: new Date(),
      restartCount: 0,
      autoRestart: config.autoRestart,
    };
    this.tasks.set(task.id, task);
    this.emit("taskAdded", task);

    // Auto-select first task
    if (this.tasks.size === 1) {
      this.setActiveTask(task.id);
    }

    return task;
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  removeTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    // Kill process if running
    if (task.ptyProcess && !task.ptyProcess.closed) {
      task.ptyProcess.close();
    }

    this.tasks.delete(id);
    this.emit("taskRemoved", id);

    // If active task was removed, select another
    if (this.activeTaskId === id) {
      const remaining = this.getAllTasks();
      this.setActiveTask(remaining.length > 0 ? remaining[0]!.id : null);
    }

    return true;
  }

  // Task operations
  async startTask(id: string): Promise<void> {
    debugLog(`startTask called for: ${id}`);
    const task = this.tasks.get(id);
    if (!task) {
      debugLog(`Task not found: ${id}`);
      return;
    }

    if (task.status === "running") {
      debugLog(`Task already running: ${id}`);
      return;
    }

    debugLog(`Setting status to starting`);
    task.status = "starting";
    this.emit("taskUpdated", task);

    // Create and start the PTY process
    const ptyProcess = new PtyProcess({
      command: task.command,
      args: task.args,
      cwd: task.cwd,
      env: task.env,
      cols: this.defaultCols,
      rows: this.defaultRows,
    });

    // Wire up output handling
    ptyProcess.on("data", (data: Uint8Array) => {
      // Decode raw PTY data and append to rawOutput for ghostty-terminal
      const text = new TextDecoder().decode(data);
      this.appendOutput(id, text);
    });

    // Wire up exit handling
    ptyProcess.on("exit", (exitCode: number, signal: string | null) => {
      const currentTask = this.tasks.get(id);
      if (!currentTask) return;

      const newStatus: TaskStatus = exitCode === 0 ? "stopped" : "crashed";
      currentTask.status = newStatus;
      currentTask.stoppedAt = new Date();
      currentTask.exitCode = exitCode;
      if (signal) currentTask.signal = signal;
      delete currentTask.pid;
      delete currentTask.ptyProcess;

      this.emit("taskUpdated", currentTask);

      // Auto-restart if configured and crashed
      if (newStatus === "crashed" && currentTask.autoRestart) {
        setTimeout(() => {
          this.restartTask(id);
        }, 1000);
      }
    });

    try {
      debugLog(`About to start PTY process`);
      await ptyProcess.start();
      debugLog(`PTY started, pid: ${ptyProcess.pid}`);

      task.ptyProcess = ptyProcess;
      task.status = "running";
      task.startedAt = new Date();
      task.pid = ptyProcess.pid ?? undefined;
      this.emit("taskUpdated", task);
    } catch (error) {
      debugLog(`Error starting PTY: ${error}`);
      task.status = "crashed";
      task.stoppedAt = new Date();
      // Append error to output
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.appendOutput(id, `Error starting process: ${errorMessage}\n`);
      this.emit("taskUpdated", task);
    }
  }

  async stopTask(
    id: string,
    signal: NodeJS.Signals = "SIGTERM",
  ): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) return;

    if (task.status !== "running") return;

    // Send signal to the real process
    if (task.ptyProcess && !task.ptyProcess.closed) {
      task.ptyProcess.kill(signal);
      // The exit event handler will update the task status
    } else {
      // No pty process, just update status directly
      task.status = "stopped";
      task.stoppedAt = new Date();
      task.signal = signal;
      delete task.pid;
      delete task.ptyProcess;
      this.emit("taskUpdated", task);
    }
  }

  async restartTask(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) return;

    // Stop if running
    if (task.status === "running") {
      await this.stopTask(id);
      // Wait a bit for the process to fully stop
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Clean up old ptyProcess reference
    delete task.ptyProcess;

    // Clear output
    task.rawOutput = "";
    task.restartCount++;
    delete task.exitCode;
    delete task.signal;

    // Start
    await this.startTask(id);
  }

  updateTaskName(id: string, name: string): void {
    const task = this.tasks.get(id);
    if (!task) return;

    task.name = name;
    this.emit("taskUpdated", task);
  }
  // Internal status update (used by process manager)
  updateTaskStatus(
    id: string,
    status: TaskStatus,
    exitCode?: number,
    signal?: string,
  ): void {
    const task = this.tasks.get(id);
    if (!task) return;

    task.status = status;

    if (status === "running") {
      task.startedAt = new Date();
      if (!task.pid) {
        task.pid = Math.floor(Math.random() * 90000) + 10000; // Stub PID
      }
    } else if (status === "stopped" || status === "crashed") {
      task.stoppedAt = new Date();
      if (exitCode !== undefined) task.exitCode = exitCode;
      if (signal) task.signal = signal;
      delete task.pid;

      // Auto-restart if configured
      if (status === "crashed" && task.autoRestart) {
        setTimeout(() => {
          this.restartTask(id);
        }, 1000);
      }
    }

    this.emit("taskUpdated", task);
  }

  appendOutput(id: string, text: string): void {
    const task = this.tasks.get(id);
    if (!task) return;

    task.rawOutput += text;

    // Trim to max size (keep last maxOutputLines worth of characters)
    const maxChars = this.maxOutputLines * 200; // ~200 chars per line estimate
    if (task.rawOutput.length > maxChars) {
      // Find the first newline after trimming to keep clean line boundaries
      const trimPoint = task.rawOutput.length - maxChars;
      const nextNewline = task.rawOutput.indexOf("\n", trimPoint);
      if (nextNewline > trimPoint) {
        task.rawOutput = task.rawOutput.slice(nextNewline + 1);
      } else {
        task.rawOutput = task.rawOutput.slice(trimPoint);
      }
    }

    // Only emit taskUpdated - listeners can check what changed
    // Emitting both events causes double renders
    this.emit("taskUpdated", task);
  }

  clearTaskOutput(id: string): void {
    const task = this.tasks.get(id);
    if (!task) return;

    task.rawOutput = "";
    this.emit("taskUpdated", task);
  }

  // Active task management
  setActiveTask(id: string | null): void {
    if (id && !this.tasks.has(id)) return;

    this.activeTaskId = id;
    this.emit("activeTaskChanged", id);
  }

  getActiveTask(): Task | null {
    if (!this.activeTaskId) return null;
    return this.tasks.get(this.activeTaskId) || null;
  }

  getActiveTaskId(): string | null {
    return this.activeTaskId;
  }

  // Navigation helpers
  getNextTaskId(): string | null {
    const tasks = this.getAllTasks();
    if (tasks.length === 0) return null;

    const firstTask = tasks[0];
    if (!firstTask) return null;
    if (!this.activeTaskId) return firstTask.id;

    const currentIndex = tasks.findIndex((t) => t.id === this.activeTaskId);
    if (currentIndex === -1) return firstTask.id;

    const nextIndex = (currentIndex + 1) % tasks.length;
    const nextTask = tasks[nextIndex];
    return nextTask ? nextTask.id : null;
  }

  getPreviousTaskId(): string | null {
    const tasks = this.getAllTasks();
    if (tasks.length === 0) return null;

    const firstTask = tasks[0];
    if (!firstTask) return null;
    if (!this.activeTaskId) return firstTask.id;

    const currentIndex = tasks.findIndex((t) => t.id === this.activeTaskId);
    if (currentIndex === -1) return firstTask.id;

    const prevIndex = (currentIndex - 1 + tasks.length) % tasks.length;
    const prevTask = tasks[prevIndex];
    return prevTask ? prevTask.id : null;
  }

  // Event handling
  on<K extends keyof TaskManagerEvents>(
    event: K,
    handler: TaskManagerEvents[K],
  ): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(handler as any);
  }

  off<K extends keyof TaskManagerEvents>(
    event: K,
    handler?: TaskManagerEvents[K],
  ): void {
    if (!handler) {
      // Remove all handlers for this event
      delete this.listeners[event];
    } else {
      // Remove specific handler
      const handlers = this.listeners[event];
      if (handlers) {
        const index = handlers.indexOf(handler as any);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    }
  }

  /**
   * Clear all event handlers - useful when re-initializing the UI
   */
  clearAllHandlers(): void {
    this.listeners = {};
    debugLog("Cleared all event handlers");
  }

  private emit<K extends keyof TaskManagerEvents>(
    event: K,
    ...args: Parameters<TaskManagerEvents[K]>
  ): void {
    if (event === "taskUpdated") {
      const task = args[0] as Task;
      debugLog(
        `Emitting taskUpdated: id=${task.id.slice(0, 8)} status=${task.status} rawOutput=${task.rawOutput.length}chars`,
      );
    } else {
      debugLog(`Emitting event: ${event}`);
    }
    const handlers = this.listeners[event];
    if (handlers) {
      debugLog(`Found ${handlers.length} handlers for ${event}`);
      for (const handler of handlers) {
        (handler as any)(...args);
      }
    } else {
      debugLog(`No handlers for ${event}`);
    }
  }

  // Utility
  getTaskCount(): number {
    return this.tasks.size;
  }

  getRunningTaskCount(): number {
    return this.getAllTasks().filter((t) => t.status === "running").length;
  }

  // Task queries
  getTasksByStatus(status: TaskStatus): Task[] {
    return this.getAllTasks().filter((t) => t.status === status);
  }

  hasRunningTasks(): boolean {
    return this.getAllTasks().some((t) => t.status === "running");
  }

  // Bulk operations
  async startAll(): Promise<void> {
    const tasks = this.getAllTasks().filter((t) => t.status !== "running");
    await Promise.all(tasks.map((t) => this.startTask(t.id)));
  }

  async stopAll(): Promise<void> {
    const tasks = this.getTasksByStatus("running");
    await Promise.all(tasks.map((t) => this.stopTask(t.id)));
  }

  async restartAll(): Promise<void> {
    const tasks = this.getAllTasks();
    await Promise.all(tasks.map((t) => this.restartTask(t.id)));
  }

  /**
   * Cleanup all PTY processes - call this before exiting
   */
  cleanup(): void {
    for (const task of this.tasks.values()) {
      if (task.ptyProcess && !task.ptyProcess.closed) {
        task.ptyProcess.close();
      }
    }
  }
}
