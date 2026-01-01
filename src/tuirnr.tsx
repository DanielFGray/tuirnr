#!/usr/bin/env bun
/**
 * tuirnr - Terminal-based process manager with interactive TUI
 * Built with OpenTUI and Solid.js
 */

import {
  createSignal,
  Show,
  onMount,
  createEffect,
  onCleanup,
  For,
} from "solid-js";
import {
  render,
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
  extend,
} from "@opentui/solid";
import { ConsolePosition, ScrollBoxRenderable } from "@opentui/core";
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer";

import { TaskManager } from "./task-manager";
import type { Task, TaskStatus } from "./task-types";
import {
  CommandPalette,
  type Command,
  type CommandPaletteRef,
} from "./components/command-palette";

// Register the ghostty-terminal component
extend({ "ghostty-terminal": GhosttyTerminalRenderable });

type Mode = "normal" | "insert" | "add-task" | "command-palette";
type LayoutPlacement = "left" | "right" | "top" | "bottom";

// Create TaskManager at module level so we can access it in onDestroy
const taskManager = new TaskManager();

// Main app
function App() {
  const renderer = useRenderer();
  const termDims = useTerminalDimensions();

  // Create signals that track TaskManager state
  const [tasks, setTasks] = createSignal<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = createSignal<string | null>(null);

  // Force re-render counter for debugging
  const [renderCount, setRenderCount] = createSignal(0);

  // Subscribe to TaskManager events and update signals
  onMount(() => {
    // Clear any stale handlers from previous runs (module-level singleton issue)
    taskManager.clearAllHandlers();

    const onTaskAdded = () => {
      setTasks([...taskManager.getAllTasks()]);
      setRenderCount((c) => c + 1);
    };
    const onTaskUpdated = () => {
      // Create new array with new object references to trigger Solid reactivity
      const allTasks = taskManager.getAllTasks();
      const copied = allTasks.map((t) => ({ ...t }));
      setTasks(copied);
      setRenderCount((c) => c + 1);
    };
    const onTaskRemoved = () => {
      setTasks([...taskManager.getAllTasks()]);
      setRenderCount((c) => c + 1);
    };
    const onActiveTaskChanged = (taskId: string | null) => {
      setActiveTaskId(taskId);
      setRenderCount((c) => c + 1);
    };

    taskManager.on("taskAdded", onTaskAdded);
    taskManager.on("taskUpdated", onTaskUpdated);
    taskManager.on("taskRemoved", onTaskRemoved);
    taskManager.on("activeTaskChanged", onActiveTaskChanged);

    // Cleanup handlers on unmount
    onCleanup(() => {
      taskManager.off("taskAdded", onTaskAdded);
      taskManager.off("taskUpdated", onTaskUpdated);
      taskManager.off("taskRemoved", onTaskRemoved);
      taskManager.off("activeTaskChanged", onActiveTaskChanged);
    });

    // Add initial tasks from command line args
    // @ts-ignore - process is available in Bun
    const args = typeof process !== "undefined" ? process.argv.slice(2) : [];
    for (const commandLine of args) {
      const trimmed = commandLine.trim();
      if (trimmed) {
        const parts = trimmed.split(/\s+/);
        const command = parts[0] || "";
        const cmdArgs = parts.slice(1);
        taskManager.createTask(command, cmdArgs, trimmed);
      }
    }

    // Initial sync
    setTasks(taskManager.getAllTasks());
    setActiveTaskId(taskManager.getActiveTaskId());
  });

  const [mode, setMode] = createSignal<Mode>("normal");
  const [addTaskCommand, setAddTaskCommand] = createSignal("");
  const [addTaskName, setAddTaskName] = createSignal("");
  const [addTaskField, setAddTaskField] = createSignal<"command" | "name">(
    "command",
  );
  const [layoutPlacement, setLayoutPlacement] =
    createSignal<LayoutPlacement>("left");
  const [zoomMode, setZoomMode] = createSignal(false);
  const [showStatusView, setShowStatusView] = createSignal(false); // Toggle between output and status info

  // Command palette ref for forwarding keyboard events
  let commandPaletteRef: CommandPaletteRef | undefined;

  // Terminal dimensions tracking
  const [terminalDims, setTerminalDims] = createSignal({ cols: 80, rows: 24 });
  const [outputScrollbox, setOutputScrollbox] = createSignal<
    ScrollBoxRenderable | undefined
  >(undefined);

  // Track scrollbox size changes and resize PTY accordingly
  createEffect(() => {
    const scrollbox = outputScrollbox();
    if (!scrollbox) return;

    let lastWidth = 0;
    let lastHeight = 0;
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    let initialSizeSet = false;

    const checkSize = () => {
      // Get inner dimensions (subtract border)
      const width = scrollbox.width - 2;
      const height = scrollbox.height - 2;

      if (
        width > 0 &&
        height > 0 &&
        (width !== lastWidth || height !== lastHeight)
      ) {
        lastWidth = width;
        lastHeight = height;

        // For the first size detection, set immediately (no debounce)
        // This ensures PTYs start with the correct size
        if (!initialSizeSet) {
          initialSizeSet = true;
          taskManager.setDefaultTerminalSize(width, height);
          setTerminalDims({ cols: width, rows: height });
          return;
        }

        // Debounce subsequent resizes
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          taskManager.setDefaultTerminalSize(width, height);
          setTerminalDims({ cols: width, rows: height });

          // Resize all running tasks' PTYs
          for (const task of tasks()) {
            if (task.ptyProcess && !task.ptyProcess.closed) {
              task.ptyProcess.resize(width, height);
            }
          }
        }, 50);
      }
    };

    // Check size periodically (OpenTUI doesn't have per-element resize events exposed to JSX easily)
    const interval = setInterval(checkSize, 100);
    checkSize(); // Initial check

    onCleanup(() => {
      clearInterval(interval);
      if (resizeTimeout) clearTimeout(resizeTimeout);
    });
  });

  // Keyboard handling
  useKeyboard((key) => {
    const currentMode = mode();

    // Insert mode - forward keys to PTY
    if (currentMode === "insert") {
      // Escape returns to normal mode
      if (key.name === "escape") {
        setMode("normal");
        return;
      }

      // Forward all other keys to the active task's PTY
      const activeId = activeTaskId();
      if (activeId) {
        const task = taskManager.getTask(activeId);
        if (task?.ptyProcess && !task.ptyProcess.closed) {
          // Handle Ctrl+C specially - send SIGINT since PTY lacks job control
          const isCtrlC = key.raw === "\x03" || (key.ctrl && key.name === "c");
          if (isCtrlC) {
            // Send SIGINT directly to the process group
            // This works around Bun.Terminal not having proper job control
            task.ptyProcess.kill("SIGINT");
          } else if (key.raw) {
            task.ptyProcess.write(key.raw);
          }
        }
      }
      return;
    }

    // Command palette mode - forward all keys to the command palette
    if (currentMode === "command-palette") {
      if (commandPaletteRef) {
        commandPaletteRef.handleKey(key);
      }
      return;
    }

    // Add task mode
    if (currentMode === "add-task") {
      // Ctrl+C cancels add-task mode
      if (key.raw === "\u0003") {
        setMode("normal");
        setAddTaskCommand("");
        setAddTaskName("");
        setAddTaskField("command");
        return;
      }
      if (key.name === "escape") {
        setMode("normal");
        setAddTaskCommand("");
        setAddTaskName("");
        setAddTaskField("command");
        return;
      }

      if (key.name === "tab") {
        setAddTaskField(addTaskField() === "command" ? "name" : "command");
        return;
      }

      if (key.name === "return") {
        const cmd = addTaskCommand();
        if (addTaskField() === "command" && cmd) {
          setAddTaskField("name");
        } else {
          if (cmd) {
            const parts = cmd.split(/\s+/);
            const command = parts[0] || "";
            const cmdArgs = parts.slice(1);
            const name = addTaskName() || cmd;
            taskManager.createTask(command, cmdArgs, name);
            setMode("normal");
            setAddTaskCommand("");
            setAddTaskName("");
            setAddTaskField("command");
          }
        }
        return;
      }

      if (key.name === "backspace") {
        if (addTaskField() === "command") {
          setAddTaskCommand((prev) => prev.slice(0, -1));
        } else {
          setAddTaskName((prev) => prev.slice(0, -1));
        }
        return;
      }

      if (key.sequence && key.sequence.length === 1) {
        if (addTaskField() === "command") {
          setAddTaskCommand((prev) => prev + key.sequence);
        } else {
          setAddTaskName((prev) => prev + key.sequence);
        }
      }
      return;
    }

    // Normal mode
    if (currentMode === "normal") {
      // Ctrl+C exits in normal mode
      if (key.raw === "\u0003") {
        renderer.destroy();
        return;
      }
      switch (key.name) {
        case "q":
          renderer.destroy();
          return;
        case "i": {
          // Enter insert mode if active task is running
          const activeId = activeTaskId();
          if (activeId) {
            const task = taskManager.getTask(activeId);
            if (task?.status === "running") {
              setMode("insert");
            }
          }
          break;
        }
        case "a":
          setMode("add-task");
          break;
        case "d": {
          const activeId = activeTaskId();
          if (activeId) taskManager.removeTask(activeId);
          break;
        }
        case "r": {
          const activeId = activeTaskId();
          if (activeId) taskManager.restartTask(activeId);
          break;
        }
        case "s": {
          const activeId = activeTaskId();
          if (activeId) taskManager.stopTask(activeId);
          break;
        }
        case "l": {
          // Rotate layout
          const placements: LayoutPlacement[] = [
            "left",
            "top",
            "right",
            "bottom",
          ];
          const currentIdx = placements.indexOf(layoutPlacement());
          const nextIdx = (currentIdx + 1) % placements.length;
          setLayoutPlacement(placements[nextIdx]);
          break;
        }
        case "z": {
          setZoomMode(!zoomMode());
          break;
        }
        case "space": {
          setMode("command-palette");
          return; // Don't process further - command palette will handle next keys
        }
        case "j":
        case "down": {
          const taskList = tasks();
          const activeId = activeTaskId();
          const currentIndex = taskList.findIndex((t) => t.id === activeId);
          if (currentIndex < taskList.length - 1) {
            taskManager.setActiveTask(taskList[currentIndex + 1].id);
          }
          break;
        }
        case "k":
        case "up": {
          const taskList = tasks();
          const activeId = activeTaskId();
          const currentIndex = taskList.findIndex((t) => t.id === activeId);
          if (currentIndex > 0) {
            taskManager.setActiveTask(taskList[currentIndex - 1].id);
          }
          break;
        }
      }

      // Handle : key for command palette
      if (key.sequence === ":") {
        setMode("command-palette");
        return; // Don't process further - command palette will handle next keys
      }

      // DEBUG: Toggle zoom on any unhandled key to verify handler is being called
      if (key.sequence === "x") {
        setZoomMode(!zoomMode());
        return;
      }

      // Handle S key (Shift+s) for status view toggle
      if (key.sequence === "S") {
        setShowStatusView(!showStatusView());
      }
    }
  });

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case "running":
        return "▶";
      case "stopped":
        return "■";
      case "starting":
        return "⏵";
      default:
        return "○";
    }
  };

  // Get raw ANSI output for the active task (for ghostty-terminal)
  const activeTaskAnsi = () => {
    const activeId = activeTaskId();
    const task = tasks().find((t) => t.id === activeId);
    if (task && task.rawOutput) {
      return task.rawOutput;
    }
    return "";
  };

  // Text content for add-task mode and status view
  const textContent = () => {
    if (mode() === "add-task") {
      const cmdIndicator = addTaskField() === "command" ? ">" : " ";
      const nameIndicator = addTaskField() === "name" ? ">" : " ";
      return [
        "",
        "Enter task details:",
        "",
        `${cmdIndicator} Command: ${addTaskCommand()}_`,
        `${nameIndicator} Name:    ${addTaskName()}_ (optional)`,
        "",
        "Enter: Next/Create | Tab: Switch | Esc: Cancel",
      ].join("\n");
    }

    // Use reactive tasks() signal to find active task
    const activeId = activeTaskId();
    const task = tasks().find((t) => t.id === activeId);
    if (task) {
      // Build comprehensive status info
      const lines: string[] = [
        `Task: ${task.name}`,
        `Command: ${task.command} ${task.args?.join(" ") || ""}`,
        `Status: ${task.status}`,
      ];

      // Add PID if running
      if (task.pid) {
        lines.push(`PID: ${task.pid}`);
      }

      // Add restart count if > 0
      if (task.restartCount > 0) {
        lines.push(`Restarts: ${task.restartCount}`);
      }

      // Add exit code if stopped/crashed
      if (task.exitCode !== undefined) {
        lines.push(`Exit Code: ${task.exitCode}`);
      }

      // Add signal if killed by signal
      if (task.signal) {
        lines.push(`Signal: ${task.signal}`);
      }

      // Add timing info
      if (task.startedAt) {
        lines.push(`Started: ${task.startedAt.toLocaleTimeString()}`);
      }
      if (task.stoppedAt) {
        lines.push(`Stopped: ${task.stoppedAt.toLocaleTimeString()}`);
      }

      // Add hint about toggling view
      lines.push("");
      lines.push("Press S to toggle output view");

      return lines.join("\n");
    }

    return "No task selected\n\nPress 'a' to add a new task";
  };

  const statusText = () => {
    const count = tasks().length;
    const task = taskManager.getTask(activeTaskId() || "");
    const taskInfo = task ? `${task.name} (${task.status})` : "no task";
    const viewMode = showStatusView() ? "STATUS" : "OUTPUT";

    if (mode() === "insert") {
      return `[INSERT] ${taskInfo} | Esc:normal mode`;
    }
    if (mode() === "add-task") {
      return `[ADD TASK] ${count} tasks | Press Esc to cancel`;
    }
    if (mode() === "command-palette") {
      return `[COMMAND] : to filter | Enter to execute | Esc to cancel`;
    }
    return `[NORMAL] ${count} tasks | ${taskInfo} | ${viewMode} | S:toggle view`;
  };

  // Commands with actions
  const commands: Command[] = [
    {
      id: "quit",
      key: "q",
      desc: "Quit application",
      action: () => renderer.destroy(),
    },
    {
      id: "add",
      key: "a",
      desc: "Add new task",
      action: () => setMode("add-task"),
    },
    {
      id: "delete",
      key: "d",
      desc: "Delete active task",
      action: () => {
        const id = activeTaskId();
        if (id) taskManager.removeTask(id);
      },
    },
    {
      id: "restart",
      key: "r",
      desc: "Restart active task",
      action: () => {
        const id = activeTaskId();
        if (id) taskManager.restartTask(id);
      },
    },
    {
      id: "stop",
      key: "s",
      desc: "Stop active task",
      action: () => {
        const id = activeTaskId();
        if (id) taskManager.stopTask(id);
      },
    },
    {
      id: "toggle-view",
      key: "S",
      desc: "Toggle status/output view",
      action: () => setShowStatusView(!showStatusView()),
    },
    {
      id: "nav-down",
      key: "j",
      desc: "Navigate down",
      action: () => {
        const taskList = tasks();
        const activeId = activeTaskId();
        const currentIndex = taskList.findIndex((t) => t.id === activeId);
        if (currentIndex < taskList.length - 1) {
          taskManager.setActiveTask(taskList[currentIndex + 1].id);
        }
      },
    },
    {
      id: "nav-up",
      key: "k",
      desc: "Navigate up",
      action: () => {
        const taskList = tasks();
        const activeId = activeTaskId();
        const currentIndex = taskList.findIndex((t) => t.id === activeId);
        if (currentIndex > 0) {
          taskManager.setActiveTask(taskList[currentIndex - 1].id);
        }
      },
    },
    {
      id: "layout",
      key: "l",
      desc: "Rotate layout",
      action: () => {
        const placements: LayoutPlacement[] = [
          "left",
          "top",
          "right",
          "bottom",
        ];
        const currentIdx = placements.indexOf(layoutPlacement());
        setLayoutPlacement(placements[(currentIdx + 1) % placements.length]);
      },
    },
    {
      id: "zoom",
      key: "z",
      desc: "Toggle zoom (hide task list)",
      action: () => setZoomMode(!zoomMode()),
    },
    {
      id: "insert",
      key: "i",
      desc: "Enter insert mode",
      action: () => {
        const id = activeTaskId();
        if (id) {
          const task = taskManager.getTask(id);
          if (task?.status === "running") setMode("insert");
        }
      },
    },
  ];

  const getOrientation = () => {
    const placement = layoutPlacement();
    return placement === "left" || placement === "right" ? "row" : "column";
  };

  const getTaskListSize = () => {
    const placement = layoutPlacement();
    const orientation = getOrientation();
    if (zoomMode()) return { width: 0, height: 0 };
    return orientation === "row"
      ? { width: 20, height: undefined }
      : { width: undefined, height: 3 };
  };

  return (
    <box
      flexDirection="column"
      width={termDims().width}
      height={termDims().height}
    >
      <box flexGrow={1} flexDirection={getOrientation()}>
        {/* Task List - conditionally show before or after output based on placement */}
        <Show
          when={
            !zoomMode() &&
            (layoutPlacement() === "left" || layoutPlacement() === "top")
          }
        >
          <box
            width={getTaskListSize().width}
            height={getTaskListSize().height}
            border
            borderColor="#444444"
            title="Tasks"
            titleAlignment="center"
          >
            <Show
              when={tasks().length > 0}
              fallback={
                <box padding={1}>
                  <text fg="#888888">No tasks</text>
                </box>
              }
            >
              <box padding={1}>
                <For each={tasks()}>
                  {(task) => {
                    return (
                      <text
                        bg={
                          activeTaskId() === task.id ? "#2a4a5a" : "transparent"
                        }
                        fg={activeTaskId() === task.id ? "#ffffff" : "#cccccc"}
                      >
                        {getStatusIcon(task.status)} {task.name}
                        <br />
                      </text>
                    );
                  }}
                </For>
              </box>
            </Show>
          </box>
        </Show>

        {/* Output Panel */}
        <scrollbox
          ref={(r: ScrollBoxRenderable) => setOutputScrollbox(r)}
          flexGrow={1}
          border
          borderColor="#444444"
          title={
            mode() === "add-task"
              ? "Add Task"
              : showStatusView()
                ? `${taskManager.getTask(activeTaskId() || "")?.name || "Task"} - Status`
                : taskManager.getTask(activeTaskId() || "")?.name || "Output"
          }
          titleAlignment="left"
          stickyScroll
        >
          <Show
            when={mode() !== "add-task" && !showStatusView()}
            fallback={<text>{textContent()}</text>}
          >
            <ghostty-terminal
              ansi={activeTaskAnsi()}
              cols={terminalDims().cols}
              rows={terminalDims().rows}
              showCursor={mode() === "insert"}
              cursorStyle="block"
            />
          </Show>
        </scrollbox>

        {/* Task List - show after output for right/bottom placement */}
        <Show
          when={
            !zoomMode() &&
            (layoutPlacement() === "right" || layoutPlacement() === "bottom")
          }
        >
          <box
            width={getTaskListSize().width}
            height={getTaskListSize().height}
            border
            borderColor="#444444"
            title="Tasks"
            titleAlignment="center"
          >
            <Show
              when={tasks().length > 0}
              fallback={
                <box padding={1}>
                  <text fg="#888888">No tasks</text>
                </box>
              }
            >
              <box padding={1}>
                {tasks().map((task) => (
                  <text
                    bg={activeTaskId() === task.id ? "#2a4a5a" : "transparent"}
                    fg={activeTaskId() === task.id ? "#ffffff" : "#cccccc"}
                  >
                    {getStatusIcon(task.status)} {task.name}
                    <br />
                  </text>
                ))}
              </box>
            </Show>
          </box>
        </Show>
      </box>

      {/* Status Bar */}
      <box height={1} backgroundColor="#1a1a1a">
        <text fg="#cccccc">{statusText()}</text>
      </box>

      {/* Command Palette */}
      <Show when={mode() === "command-palette"}>
        <CommandPalette
          commands={commands}
          onClose={() => setMode("normal")}
          ref={(r) => (commandPaletteRef = r)}
        />
      </Show>
    </box>
  );
}

// Render
render(App, {
  targetFps: 30,
  exitOnCtrlC: false, // We handle Ctrl+C ourselves to allow passthrough in insert mode
  openConsoleOnError: false, // Disable console popup - tuirnr has its own UI
  consoleOptions: {
    position: ConsolePosition.BOTTOM,
    maxStoredLogs: 1000,
    sizePercent: 0,
  },
  onDestroy: () => {
    // Kill all PTY processes before exiting
    taskManager.cleanup();
    process.exit(0);
  },
});
