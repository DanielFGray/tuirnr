/**
 * Command Palette - Filterable command selector
 */

import {
  BoxRenderable,
  InputRenderable,
  SelectRenderable,
  InputRenderableEvents,
  SelectRenderableEvents,
  type CliRenderer,
  type SelectOption,
} from "@opentui/core";
import type { CommandRegistry, Command } from "./command-registry";

export class CommandPalette {
  private renderer: CliRenderer;
  private commandRegistry: CommandRegistry;
  private container: BoxRenderable | null = null;
  private inputField: InputRenderable | null = null;
  private selectList: SelectRenderable | null = null;
  private visible: boolean = false;
  private allCommands: Command[] = [];
  private filteredCommands: Command[] = [];

  constructor(renderer: CliRenderer, commandRegistry: CommandRegistry) {
    this.renderer = renderer;
    this.commandRegistry = commandRegistry;
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;

    // Get all commands
    this.allCommands = this.commandRegistry.getAllCommands();
    this.filteredCommands = this.allCommands;

    // Get terminal dimensions for centering
    const termWidth = this.renderer.width || 80;
    const termHeight = this.renderer.height || 24;
    const modalWidth = 70;
    const modalHeight = 25;

    // Calculate centered position
    const left = Math.floor((termWidth - modalWidth) / 2);
    const top = Math.floor((termHeight - modalHeight) / 2);

    // Create centered modal container
    this.container = new BoxRenderable(this.renderer, {
      id: "command-palette",
      position: "absolute",
      left: left,
      top: top,
      width: modalWidth,
      height: modalHeight,
      backgroundColor: "#222222",
      border: true,
      borderColor: "#666666",
      padding: 1,
      zIndex: 1000,
      flexDirection: "column",
      gap: 0,
    });

    // Create input field for filtering
    this.inputField = new InputRenderable(this.renderer, {
      id: "command-palette-input",
      width: "100%",
      height: 1,
      padding: 1,
      placeholder: "Type to filter commands...",
      backgroundColor: "#1a1a1a",
      textColor: "#FFFFFF",
      placeholderColor: "#666666",
      cursorColor: "#FFFF00",
    });

    // Create select list
    this.selectList = new SelectRenderable(this.renderer, {
      id: "command-palette-list",
      width: "100%",
      flexGrow: 1,
      options: this.commandsToOptions(this.filteredCommands),
      backgroundColor: "#222222",
      textColor: "#CCCCCC",
      selectedBackgroundColor: "#3b82f6",
      selectedTextColor: "#FFFFFF",
      descriptionColor: "#888888",
      selectedDescriptionColor: "#CCCCCC",
      showDescription: true,
      showScrollIndicator: true,
      wrapSelection: false,
    });

    this.container.add(this.inputField);
    this.container.add(this.selectList);

    // Handle input filtering
    this.inputField.on(InputRenderableEvents.INPUT, (value: string) => {
      this.filterCommands(value);
    });

    // Handle command selection
    this.selectList.on(
      SelectRenderableEvents.ITEM_SELECTED,
      (_index: number, option: SelectOption) => {
        const command = option.value as Command;
        if (command) {
          this.hide();
          // Execute the command
          this.commandRegistry.executeCommand(command.id);
        }
      },
    );

    // Handle keyboard navigation in input field
    const prevInputOnKeyDown = this.inputField.onKeyDown;
    this.inputField.onKeyDown = (key) => {
      if (key.name === "escape") {
        this.hide();
        return;
      } else if (key.name === "up") {
        this.selectList?.moveUp();
        return;
      } else if (key.name === "down") {
        this.selectList?.moveDown();
        return;
      } else if (key.name === "enter" || key.name === "return") {
        // Select the highlighted command
        const selectedOption = this.selectList?.getSelectedOption();
        if (selectedOption) {
          const command = selectedOption.value as Command;
          if (command) {
            this.hide();
            this.commandRegistry.executeCommand(command.id);
          }
        }
        return;
      }
      prevInputOnKeyDown?.(key);
    };

    this.renderer.root.add(this.container);
    this.inputField.focus();
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;

    if (this.inputField) {
      this.inputField.blur();
    }

    if (this.container) {
      this.renderer.root.remove(this.container.id);
      this.container.destroyRecursively();
      this.container = null;
      this.inputField = null;
      this.selectList = null;
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

  private filterCommands(query: string): void {
    const normalizedQuery = query.toLowerCase().trim();

    if (!normalizedQuery) {
      this.filteredCommands = this.allCommands;
    } else {
      this.filteredCommands = this.allCommands.filter((cmd) => {
        const nameMatch = cmd.name.toLowerCase().includes(normalizedQuery);
        const descMatch = cmd.description
          .toLowerCase()
          .includes(normalizedQuery);
        const keybindMatch =
          cmd.keybind?.toLowerCase().includes(normalizedQuery) ?? false;
        return nameMatch || descMatch || keybindMatch;
      });
    }

    if (this.selectList) {
      this.selectList.options = this.commandsToOptions(this.filteredCommands);
    }
  }

  private commandsToOptions(commands: Command[]): SelectOption[] {
    if (commands.length === 0) {
      return [
        { name: "No commands found", description: "", value: null as any },
      ];
    }

    return commands.map((cmd) => ({
      name: cmd.keybind ? `${cmd.name} (${cmd.keybind})` : cmd.name,
      description: cmd.description,
      value: cmd,
    }));
  }

  destroy(): void {
    this.hide();
  }
}
