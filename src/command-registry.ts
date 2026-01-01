/**
 * Command Registry
 * Manages commands and their keybindings for the tuirnr application
 */

export interface Command {
  id: string;
  name: string;
  description: string;
  keybind?: string;
  action: () => void;
  mode?: "normal" | "insert" | "add-task" | "all";
}

export class CommandRegistry {
  private commands: Map<string, Command> = new Map();

  register(command: Command): void {
    this.commands.set(command.id, command);
  }

  registerMany(commands: Command[]): void {
    commands.forEach((cmd) => this.register(cmd));
  }

  getCommand(id: string): Command | undefined {
    return this.commands.get(id);
  }

  getAllCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  getCommandsByMode(mode: "normal" | "insert" | "add-task" | "all"): Command[] {
    return this.getAllCommands().filter(
      (cmd) => !cmd.mode || cmd.mode === mode || cmd.mode === "all",
    );
  }

  getCommandsWithKeybinds(): Command[] {
    return this.getAllCommands().filter((cmd) => cmd.keybind);
  }

  executeCommand(id: string): void {
    const command = this.commands.get(id);
    if (command) {
      command.action();
    }
  }
}
