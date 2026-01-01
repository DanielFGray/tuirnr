/**
 * Core task data types for tuirnr
 * Designed to be layout-agnostic (works with both vertical sidebar and horizontal tabs)
 */

export type TaskStatus =
  | "running"
  | "stopped"
  | "crashed"
  | "starting"
  | "idle";

// Import PtyProcess type - using import type to avoid circular deps
import type { PtyProcess } from "./pty-process";

export interface Task {
  id: string;
  name: string; // User-friendly name (defaults to command)
  command: string;
  args: string[];
  cwd?: string; // Working directory for the command
  env?: Record<string, string>; // Environment variables
  status: TaskStatus;
  pid?: number;
  exitCode?: number;
  signal?: string;
  rawOutput: string; // Raw ANSI output for ghostty-terminal rendering
  createdAt: Date;
  startedAt?: Date;
  stoppedAt?: Date;
  restartCount: number; // Number of times restarted
  autoRestart?: boolean; // Auto-restart on crash

  // PTY process management (only present while process is running)
  ptyProcess?: PtyProcess;
}

export type LayoutPlacement = "left" | "right" | "top" | "bottom";

export interface TaskListLayout {
  orientation: "vertical" | "horizontal";
  placement: LayoutPlacement;
  width?: string | number; // For vertical (sidebar)
  height?: string | number; // For horizontal (tabs)
  visible: boolean; // For zoom mode
}

export function getStatusIcon(status: TaskStatus): string {
  switch (status) {
    case "running":
      return "●"; // Green circle
    case "stopped":
      return "⏸"; // Yellow pause
    case "crashed":
      return "✗"; // Red X
    case "starting":
      return "↻"; // Blue refresh
    case "idle":
      return "○"; // Empty circle
    default:
      return "?";
  }
}

export function getStatusColor(status: TaskStatus): string {
  switch (status) {
    case "running":
      return "#00ff00"; // Green
    case "stopped":
      return "#ffaa00"; // Yellow
    case "crashed":
      return "#ff0000"; // Red
    case "starting":
      return "#00aaff"; // Blue
    case "idle":
      return "#888888"; // Gray
    default:
      return "#666666";
  }
}

export function getTaskDisplayName(task: Task): string {
  return task.name || task.command;
}

export function getTaskDescription(task: Task): string {
  if (task.status === "running" && task.pid) {
    return `PID: ${task.pid}`;
  }
  if (task.status === "crashed" && task.exitCode !== undefined) {
    return `Exit: ${task.exitCode}`;
  }
  if (task.status === "stopped") {
    return "Stopped";
  }
  if (task.restartCount > 0) {
    return `${task.status} (restarted ${task.restartCount}x)`;
  }
  return task.status;
}

/**
 * Task configuration for creating/loading tasks
 */
export interface TaskConfig {
  name?: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  autoRestart?: boolean;
}
