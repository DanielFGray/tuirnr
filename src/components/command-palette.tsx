/**
 * Command Palette - Interactive filterable command selector
 * Note: Does NOT use useKeyboard - parent handles all keyboard input
 */

import { createSignal, createMemo, createEffect, For, Show } from "solid-js";
import { useTerminalDimensions } from "@opentui/solid";
import { RGBA } from "@opentui/core";
import type { KeyEvent } from "@opentui/core";

export interface Command {
  id: string;
  key: string;
  desc: string;
  action: () => void;
}

export interface CommandPaletteRef {
  handleKey: (key: KeyEvent) => void;
}

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
  ref?: (ref: CommandPaletteRef) => void;
}

export function CommandPalette(props: CommandPaletteProps) {
  const termDims = useTerminalDimensions();
  const [filter, setFilter] = createSignal("");
  const [selected, setSelected] = createSignal(0);

  // Filter commands based on search
  const filtered = createMemo(() => {
    const query = filter().toLowerCase();
    if (!query) return props.commands;
    return props.commands.filter(
      (cmd) =>
        cmd.desc.toLowerCase().includes(query) ||
        cmd.key.toLowerCase().includes(query) ||
        cmd.id.toLowerCase().includes(query),
    );
  });

  // Reset selection when filter changes
  createEffect(() => {
    filter(); // track
    setSelected(0);
  });

  // Execute selected command
  const executeSelected = () => {
    const cmds = filtered();
    if (cmds.length > 0 && selected() < cmds.length) {
      const cmd = cmds[selected()];
      props.onClose();
      cmd.action();
    }
  };

  // Handle keyboard input (called by parent)
  const handleKey = (key: KeyEvent) => {
    if (key.name === "escape") {
      props.onClose();
      return;
    }

    if (key.name === "return") {
      executeSelected();
      return;
    }

    if (key.name === "up" || (key.ctrl && key.name === "p")) {
      setSelected((s) => (s > 0 ? s - 1 : filtered().length - 1));
      return;
    }

    if (key.name === "down" || (key.ctrl && key.name === "n")) {
      setSelected((s) => (s < filtered().length - 1 ? s + 1 : 0));
      return;
    }

    if (key.name === "backspace") {
      setFilter((f) => f.slice(0, -1));
      return;
    }

    // Type characters into filter
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      setFilter((f) => f + key.sequence);
    }
  };

  // Expose handleKey to parent via ref
  createEffect(() => {
    props.ref?.({ handleKey });
  });

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width={termDims().width}
      height={termDims().height}
      backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
      alignItems="center"
      justifyContent="center"
    >
      <box
        width={60}
        height={20}
        backgroundColor="#222222"
        border
        borderColor="#666666"
        flexDirection="column"
      >
        {/* Header */}
        <box paddingLeft={2} paddingRight={2} paddingTop={1}>
          <box flexDirection="row" justifyContent="space-between">
            <text fg="#ffffff">Commands</text>
            <text fg="#666666">esc</text>
          </box>
        </box>

        {/* Filter display */}
        <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
          <text fg="#888888">
            {filter() ? `Filter: ${filter()}_` : "Type to filter..."}
          </text>
        </box>

        {/* Command List */}
        <scrollbox
          flexGrow={1}
          paddingLeft={1}
          paddingRight={1}
          scrollbarOptions={{ visible: false }}
        >
          <Show
            when={filtered().length > 0}
            fallback={
              <box paddingLeft={2}>
                <text fg="#666666">No commands found</text>
              </box>
            }
          >
            <For each={filtered()}>
              {(cmd, index) => (
                <box
                  backgroundColor={
                    selected() === index() ? "#3b82f6" : "transparent"
                  }
                  paddingLeft={2}
                  paddingRight={2}
                >
                  <text fg={selected() === index() ? "#ffffff" : "#cccccc"}>
                    <text fg={selected() === index() ? "#ffffff" : "#888888"}>
                      {cmd.key.padEnd(4)}
                    </text>
                    {cmd.desc}
                  </text>
                </box>
              )}
            </For>
          </Show>
        </scrollbox>

        {/* Footer */}
        <box paddingLeft={2} paddingRight={2} paddingBottom={1}>
          <text fg="#666666">up/down navigate | enter select | esc close</text>
        </box>
      </box>
    </box>
  );
}
