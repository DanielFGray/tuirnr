# tuirnr

A modern terminal-based process manager with an interactive TUI (Text User Interface). Run and monitor multiple processes simultaneously with real-time output, full PTY interaction, and an intuitive keyboard-driven interface.

Built with [OpenTUI](https://github.com/opentui/opentui) and [Solid.js](https://www.solidjs.com/).

## Features

- **Multi-process management** - Run and monitor multiple commands simultaneously
- **Interactive sessions** - Full PTY support with insert mode for direct process interaction
- **Real-time ANSI output** - Proper terminal emulation with colors, formatting, and cursor support
- **Flexible layouts** - Task list can be positioned on left, right, top, or bottom
- **Command palette** - Quick access to all commands with fuzzy filtering
- **Status monitoring** - View PIDs, exit codes, restart counts, and timing information
- **Task control** - Start, stop, restart, add, and remove tasks on the fly
- **Zoom mode** - Hide task list for focused output viewing
- **Auto-restart** - Configure tasks to automatically restart on crash
- **Modal interface** - Vim-inspired modes (normal, insert, command palette)

## Installation

```bash
bun install
```

## Usage

### Basic Usage

Run tuirnr with one or more commands as arguments:

```bash
tuirnr "bun dev" "bun test:watch"
```

Each command will be parsed and started as a separate task.

```bash
# Monitor log files
tuirnr "tail -f /var/log/app.log" "tail -f /var/log/error.log"

# Development servers
tuirnr "bun frontend" "bun backend" "bun db"

# Long-running processes
tuirnr "docker compose up" "ngrok http 3000"
```

## Interface

```
┌──────Tasks───────┐┌─bun dev──────────────────────────────────────────────────┐
│                  ││Starting server on port 3000                              │
│ ▶ bun dev       ││                                                          │
│                  ││                                                          │
│ ▶ cypress       ││                                                          │
│                  ││                                                          │
│ ▶ typecheck     ││                                                          │
│                  ││                                                          │
│ ▶ lint          ││                                                          │
│                  ││                                                          │
│ ■  bun test      ││                                                          │
│                  ││                                                          │
└──────────────────┘└──────────────────────────────────────────────────────────┘
[NORMAL] 5 tasks | bun dev (running) | OUTPUT | S:toggle view
```

### UI Components

- **Task List** (left panel) - Shows all tasks with status indicators
  - `▶` Running task
  - `■` Stopped task
  - `⏵` Starting task
  - `○` Idle task
  
- **Output Panel** (right panel) - Displays the active task's terminal output
  - Supports full ANSI escape sequences
  - Real-time scrolling output
  - Can switch to status view with `S`

- **Status Bar** (bottom) - Shows current mode, task count, and available actions

## Keyboard Controls

### Normal Mode

Navigation and task management mode (default).

| Key | Action |
|-----|--------|
| `j` / `↓` | Select next task |
| `k` / `↑` | Select previous task |
| `a` | Add new task |
| `d` | Delete active task |
| `r` | Restart active task |
| `s` | Stop active task |
| `i` | Enter insert mode (if task is running) |
| `S` | Toggle status/output view |
| `l` | Rotate layout (left → top → right → bottom) |
| `z` | Toggle zoom mode (hide/show task list) |
| `Space` or `:` | Open command palette |
| `q` or `Ctrl+C` | Quit application |

### Insert Mode

Direct interaction with the active task's PTY (like being inside the process).

| Key | Action |
|-----|--------|
| `Esc` | Return to normal mode |
| `Ctrl+C` | Send SIGINT to running process |
| *All other keys* | Forwarded to the process stdin |

Use insert mode to interact with processes that require user input, send commands to shells, or control interactive programs.

### Command Palette

Fuzzy-searchable command interface.

| Key | Action |
|-----|--------|
| *Type* | Filter commands |
| `↑` / `↓` or `Ctrl+P` / `Ctrl+N` | Navigate commands |
| `Enter` | Execute selected command |
| `Esc` | Close palette |

### Add Task Mode

Interactive task creation.

| Key | Action |
|-----|--------|
| *Type* | Enter command or name |
| `Tab` | Switch between command and name fields |
| `Enter` | Next field or create task |
| `Esc` or `Ctrl+C` | Cancel |
| `Backspace` | Delete character |

## Task Status Information

Toggle to status view with `S` to see detailed task information:

- Task name and full command
- Current status (running/stopped/crashed/starting/idle)
- Process ID (PID) when running
- Exit code and signal (when stopped)
- Start/stop timestamps
- Restart count

## Workflow Examples

### Development Server Monitoring

```bash
# Start multiple dev servers
tmux new -s dev "bun src/tuirnr.tsx 'bun frontend' 'bun backend' 'bun worker'"

# Inside tuirnr:
# - Use j/k to navigate between services
# - Press i to interact with a service (e.g., send commands to a REPL)
# - Press r to restart a crashed service
# - Press S to check PIDs and status
# - Press q to quit all services
```

### Log Monitoring

```bash
bun src/tuirnr.tsx "tail -f app.log" "tail -f error.log" "tail -f access.log"

# Use j/k to switch between log files
# Use z to zoom into a single log
# Use S to see when log files were last updated
```

### Interactive Shell Sessions

```bash
bun src/tuirnr.tsx "bash" "python3" "node"

# Select a shell with j/k
# Press i to enter insert mode
# Type commands directly
# Press Esc to return to normal mode
```

## Tips

* **Zoom mode for focused work** - Press `z` to hide the task list when you need more screen space
* **Layout switching** - Press `l` to find the layout that works best for your workflow
* **Status view for debugging** - Press `S` to see detailed process information like PIDs and exit codes

## Requirements

- [Bun](https://bun.sh/) runtime
- Terminal with ANSI support
- (Optional) [tmux](https://github.com/tmux/tmux) for session management

## Architecture

- **OpenTUI** - Terminal UI rendering framework
- **Solid.js** - Reactive state management
- **ghostty-opentui** - Terminal buffer rendering with full ANSI support
- **Bun.Terminal** - PTY (pseudo-terminal) process management
