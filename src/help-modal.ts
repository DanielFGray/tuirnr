/**
 * Help Modal - Shows keybindings
 */

import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core";
import type { CommandRegistry } from "./command-registry";

export class HelpModal {
  private renderer: CliRenderer;
  private commandRegistry: CommandRegistry;
  private container: BoxRenderable | null = null;
  private visible: boolean = false;

  constructor(renderer: CliRenderer, commandRegistry: CommandRegistry) {
    this.renderer = renderer;
    this.commandRegistry = commandRegistry;
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;

    // Get terminal dimensions for centering
    const termWidth = this.renderer.width || 80;
    const termHeight = this.renderer.height || 24;
    const modalWidth = 60;
    const modalHeight = 20;

    // Calculate centered position
    const left = Math.floor((termWidth - modalWidth) / 2);
    const top = Math.floor((termHeight - modalHeight) / 2);

    // Create centered modal container
    this.container = new BoxRenderable(this.renderer, {
      id: "help-modal",
      position: "absolute",
      left: left,
      top: top,
      width: modalWidth,
      height: modalHeight,
      backgroundColor: "#222222",
      border: true,
      borderColor: "#666666",
      padding: 2,
      zIndex: 1000,
      flexDirection: "column",
      gap: 1,
    });

    // Title
    const title = new TextRenderable(this.renderer, {
      content: "Keyboard Shortcuts",
      fg: "#FFFFFF",
      bg: "transparent",
      width: "100%",
    });
    this.container.add(title);

    // Divider
    const divider = new TextRenderable(this.renderer, {
      content: "─".repeat(56),
      fg: "#666666",
      bg: "transparent",
      width: "100%",
    });
    this.container.add(divider);

    // Get all commands with keybinds, sorted by mode
    const commands = this.commandRegistry.getCommandsWithKeybinds();
    const normalCommands = commands.filter(
      (cmd) => !cmd.mode || cmd.mode === "normal" || cmd.mode === "all",
    );
    const insertCommands = commands.filter((cmd) => cmd.mode === "insert");
    const addTaskCommands = commands.filter((cmd) => cmd.mode === "add-task");

    // Build keybindings text
    const lines: string[] = [];

    if (normalCommands.length > 0) {
      lines.push("NORMAL MODE:");
      normalCommands.forEach((cmd) => {
        const keybind = cmd.keybind!.padEnd(12);
        lines.push(`  ${keybind} ${cmd.description}`);
      });
    }

    if (insertCommands.length > 0) {
      lines.push("");
      lines.push("INSERT MODE:");
      insertCommands.forEach((cmd) => {
        const keybind = cmd.keybind!.padEnd(12);
        lines.push(`  ${keybind} ${cmd.description}`);
      });
    }

    if (addTaskCommands.length > 0) {
      lines.push("");
      lines.push("ADD TASK MODE:");
      addTaskCommands.forEach((cmd) => {
        const keybind = cmd.keybind!.padEnd(12);
        lines.push(`  ${keybind} ${cmd.description}`);
      });
    }

    lines.push("");
    lines.push("Press any key to close");

    const content = new TextRenderable(this.renderer, {
      content: lines.join("\n"),
      fg: "#CCCCCC",
      bg: "transparent",
      width: "100%",
      wrapMode: "word",
    });
    this.container.add(content);

    this.renderer.root.add(this.container);
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;

    if (this.container) {
      this.renderer.root.remove(this.container.id);
      this.container.destroyRecursively();
      this.container = null;
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  destroy(): void {
    this.hide();
  }
}
