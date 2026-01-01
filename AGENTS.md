# Agent Instructions

**tuirnr** - A terminal-based process manager with interactive TUI built with OpenTUI and Solid.js.

This project uses **beads** for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Build & Run Commands

```bash
# Install dependencies
bun install

# Run the application (development)
bun src/tuirnr.tsx "echo hello" "sleep 10"

# Run with watch mode
bun --watch src/tuirnr.tsx

# Type checking
bunx tsc --noEmit

# Format code
prettier --write src/**/*.{ts,tsx}
```

**Note:** This project currently has NO automated tests. When adding tests, document test commands here.

## Code Style Guidelines

### File Organization

- **Entry point:** `src/tuirnr.tsx` - Main application with Solid.js render loop
- **Components:** `src/components/` - Reusable UI components
- **Business logic:** Classes in `src/` (TaskManager, PtyProcess, CommandRegistry)
- **Types:** `src/task-types.ts` and inline interface definitions

### Imports

Follow this order:
1. External libraries (solid-js, @opentui/*, bun types)
2. Internal absolute imports (src/*)
3. Type-only imports (use `import type` for types)

```typescript
// ✅ Good
import { createSignal, onMount } from "solid-js";
import { render, useKeyboard } from "@opentui/solid";
import type { Subprocess } from "bun";

import { TaskManager } from "./task-manager";
import type { Task, TaskStatus } from "./task-types";
```

### TypeScript & Types

- **Strict mode enabled** - All compiler strict options are on
- Use `type` for type aliases, `interface` for object shapes
- Prefer explicit return types on exported functions/methods
- Use `Record<string, T>` over index signatures when appropriate
- Event handlers use typed interfaces (see `PtyProcessEvents`, `TaskManagerEvents`)

```typescript
// ✅ Good - explicit types
export interface PtyProcessOptions {
  command: string;
  args?: string[];
  cols?: number;
  rows?: number;
}

export class PtyProcess {
  constructor(private options: PtyProcessOptions) {}
  
  async start(): Promise<void> {
    // ...
  }
}

// ❌ Bad - implicit any
function processData(data) {
  return data.transform();
}
```

### Naming Conventions

- **Classes:** PascalCase (`TaskManager`, `PtyProcess`)
- **Files:** kebab-case (`task-manager.ts`, `pty-process.ts`)
- **Components:** PascalCase files (`CommandPalette.tsx`)
- **Interfaces:** PascalCase, no `I` prefix (`Task`, `PtyProcessOptions`)
- **Type aliases:** PascalCase (`TaskStatus`, `LayoutPlacement`)
- **Variables/functions:** camelCase (`activeTaskId`, `getStatusIcon`)
- **Constants:** UPPER_SNAKE_CASE only for true constants (`DEBUG_LOG`, `DEBUG_ENABLED`)
- **Private members:** Prefix with `_` (`_closed`, `_pid`)

### JSX & Solid.js

- Use `.tsx` extension for files with JSX
- Set `jsxImportSource: "@opentui/solid"` in tsconfig
- Prefer `<For>` over `.map()` for reactive lists
- Use signals for reactive state: `const [value, setValue] = createSignal(initial)`
- Use `createEffect` for side effects, `createMemo` for derived values
- Component props should use interfaces

```typescript
// ✅ Good - using For for reactivity
<For each={tasks()}>
  {(task) => <text>{task.name}</text>}
</For>

// ⚠️ Avoid - .map() can cause reactivity issues
{tasks().map((task) => <text>{task.name}</text>)}
```

### Error Handling

- Throw descriptive errors with context
- Use try-catch for async operations and external processes
- Clean up resources in finally blocks or cleanup handlers
- Silent failures only when explicitly intended (with comments)

```typescript
// ✅ Good
async start(): Promise<void> {
  if (this.terminal) {
    throw new Error("Process already started");
  }
  
  try {
    this.subprocess = Bun.spawn(args, options);
  } catch (error) {
    this.cleanup();
    throw new Error(`Failed to spawn process: ${error}`);
  }
}
```

### Comments & Documentation

- Use JSDoc for exported functions/classes
- Inline comments for non-obvious logic
- Explain **why**, not **what** (code shows what)
- Mark workarounds with `// WORKAROUND:` or `// TODO:`

```typescript
/**
 * PtyProcess - Wrapper around Bun.Terminal + Bun.spawn for PTY-based process management
 *
 * Provides a clean API for spawning processes with pseudo-terminals and managing their lifecycle.
 */
export class PtyProcess {
  /**
   * Send a signal to child processes (for SIGINT) or the process itself
   *
   * For SIGINT, we signal child processes directly since Bun.Terminal doesn't
   * set up proper job control and bash won't forward signals to its children.
   */
  kill(signal: NodeJS.Signals = "SIGTERM"): void {
    // Implementation...
  }
}
```

### Event Systems

Use typed event emitter pattern:

```typescript
export interface EventMap {
  eventName: (arg: Type) => void;
}

on<K extends keyof EventMap>(event: K, handler: EventMap[K]): void {
  // Store handler
}

private emit<K extends keyof EventMap>(
  event: K, 
  ...args: Parameters<EventMap[K]>
): void {
  // Call handlers
}
```

### Cleanup & Resources

- Always clean up PTY processes, intervals, event listeners
- Use Solid.js `onCleanup` for component cleanup
- Implement cleanup/destroy methods on classes managing resources
- Clear event handlers when components unmount

## Known Issues & Gotchas

- **No job control in PTYs** - Bun.Terminal doesn't set up proper job control (see issue `mprocs-4vs`)
- **Polling for resize** - OpenTUI lacks resize events, we poll every 100ms (see issue `mprocs-euw`)
- **Duplicate render blocks** - Task list rendered twice with different patterns (see issue `mprocs-wd4`)
- **Debug code present** - Remove before production (see issue `mprocs-kw1`)

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create beads issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Type check with `bunx tsc --noEmit`
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
