/**
 * TaskListView - Layout-agnostic task list UI component
 * Can be rendered vertically (sidebar) or horizontally (tabs)
 */

import {
  BoxRenderable,
  SelectRenderable,
  TabSelectRenderable,
  type CliRenderer,
  type SelectOption,
  type TabSelectOption,
} from "@opentui/core";
import type { TaskManager } from "./task-manager";
import type { Task, TaskListLayout } from "./task-types";
import {
  getStatusIcon,
  getStatusColor,
  getTaskDisplayName,
  getTaskDescription,
} from "./task-types";

export interface TaskListViewOptions {
  layout: TaskListLayout;
  taskManager: TaskManager;
  showAddOption?: boolean;
}

export class TaskListView {
  private container: BoxRenderable;
  private selectList: SelectRenderable | null = null;
  private tabSelect: TabSelectRenderable | null = null;
  private taskManager: TaskManager;
  private layout: TaskListLayout;
  private showAddOption: boolean;
  private renderer: CliRenderer;
  private selectedIndex: number = 0;

  // Store bound event handlers for cleanup
  private boundHandlers = {
    taskAdded: () => this.updateTaskList(),
    taskUpdated: () => this.updateTaskList(),
    taskRemoved: () => this.updateTaskList(),
    activeTaskChanged: () => this.updateSelection(),
  };

  constructor(renderer: CliRenderer, options: TaskListViewOptions) {
    this.renderer = renderer;
    this.taskManager = options.taskManager;
    this.layout = options.layout;
    this.showAddOption = options.showAddOption ?? true;

    // Create container based on layout orientation
    this.container = new BoxRenderable(renderer, {
      flexDirection: "column",
      width:
        this.layout.orientation === "vertical"
          ? (this.layout.width as any)
          : "100%",
      height:
        this.layout.orientation === "horizontal"
          ? (this.layout.height as any)
          : "100%",
      // backgroundColor: "#1a1a1a",
      border: this.layout.orientation === "vertical", // Only show border in vertical mode
      borderColor: "#444444",
      title: this.layout.orientation === "vertical" ? "Tasks" : undefined, // Only show title in vertical mode
      titleAlignment: "center",
    });

    // Create appropriate list component based on orientation
    if (this.layout.orientation === "vertical") {
      this.createVerticalList();
    } else {
      this.createHorizontalList();
    }

    // Initialize with current tasks
    this.updateTaskList();

    // Listen to task manager changes using bound handlers
    this.taskManager.on("taskAdded", this.boundHandlers.taskAdded);
    this.taskManager.on("taskUpdated", this.boundHandlers.taskUpdated);
    this.taskManager.on("taskRemoved", this.boundHandlers.taskRemoved);
    this.taskManager.on(
      "activeTaskChanged",
      this.boundHandlers.activeTaskChanged,
    );
  }

  private createVerticalList(): void {
    // Create select list for vertical layout
    this.selectList = new SelectRenderable(this.renderer, {
      width: "100%",
      flexGrow: 1,
      backgroundColor: "transparent",
      textColor: "#cccccc",
      focusedBackgroundColor: "#1a1a1a",
      focusedTextColor: "#ffffff",
      selectedBackgroundColor: "#2a4a5a",
      selectedTextColor: "#ffffff",
      descriptionColor: "#888888",
      selectedDescriptionColor: "#aaaaaa",
      showDescription: true,
      wrapSelection: true,
      itemSpacing: 0,
    });

    this.container.add(this.selectList);
  }

  private createHorizontalList(): void {
    // Create tab select for horizontal layout
    this.tabSelect = new TabSelectRenderable(this.renderer, {
      width: "100%",
      flexGrow: 1,
      options: [],
      backgroundColor: "transparent",
      textColor: "#cccccc",
      selectedBackgroundColor: "#2a4a5a",
      selectedTextColor: "#ffffff",
      selectedDescriptionColor: "#aaaaaa",
      showDescription: false, // Disable description to keep it single-line
      showUnderline: false, // Disable underline to avoid rendering artifacts
      showScrollArrows: true,
      wrapSelection: true,
      tabWidth: 15,
    });

    this.container.add(this.tabSelect);
  }

  private updateTaskList(): void {
    const tasks = this.taskManager.getAllTasks();

    if (this.layout.orientation === "vertical" && this.selectList) {
      const options: SelectOption[] = tasks.map((task) =>
        this.taskToSelectOption(task),
      );
      this.selectList.options = options;
    } else if (this.layout.orientation === "horizontal" && this.tabSelect) {
      const options: TabSelectOption[] = tasks.map((task) =>
        this.taskToTabOption(task),
      );
      this.tabSelect.setOptions(options);
    }

    this.updateSelection();
  }

  private taskToSelectOption(task: Task): SelectOption {
    const icon = getStatusIcon(task.status);
    const name = `${icon} ${getTaskDisplayName(task)}`;
    const description = getTaskDescription(task);

    return {
      name,
      description,
      value: task.id,
    };
  }

  private taskToTabOption(task: Task): TabSelectOption {
    const icon = getStatusIcon(task.status);
    const name = `${icon} ${getTaskDisplayName(task)}`;
    const description = getTaskDescription(task);

    return {
      name,
      description,
      value: task.id,
    };
  }

  private updateSelection(): void {
    const activeTaskId = this.taskManager.getActiveTaskId();
    if (!activeTaskId) return;

    const tasks = this.taskManager.getAllTasks();
    const activeIndex = tasks.findIndex((t) => t.id === activeTaskId);

    if (activeIndex >= 0) {
      if (this.selectList) {
        // Update selection by moving to the index
        const currentIndex = this.selectList.getSelectedIndex();
        const diff = activeIndex - currentIndex;
        if (diff > 0) {
          this.selectList.moveDown(diff);
        } else if (diff < 0) {
          this.selectList.moveUp(-diff);
        }
      } else if (this.tabSelect) {
        this.tabSelect.setSelectedIndex(activeIndex);
      }
      this.selectedIndex = activeIndex;
    }
  }

  // Navigation API
  moveUp(step: number = 1): void {
    if (this.selectList) {
      this.selectList.moveUp(step);
    } else if (this.tabSelect) {
      // Tab select uses left/right, but we can still support up as "previous"
      const current = this.tabSelect.getSelectedIndex();
      const tasks = this.taskManager.getAllTasks();
      const newIndex = Math.max(0, current - step);
      this.tabSelect.setSelectedIndex(newIndex);
      this.selectedIndex = newIndex;
    }
  }

  moveDown(step: number = 1): void {
    if (this.selectList) {
      this.selectList.moveDown(step);
    } else if (this.tabSelect) {
      // Tab select uses left/right, but we can still support down as "next"
      const current = this.tabSelect.getSelectedIndex();
      const tasks = this.taskManager.getAllTasks();
      const newIndex = Math.min(tasks.length - 1, current + step);
      this.tabSelect.setSelectedIndex(newIndex);
      this.selectedIndex = newIndex;
    }
  }

  getSelectedIndex(): number {
    if (this.selectList) {
      return this.selectList.getSelectedIndex();
    } else if (this.tabSelect) {
      return this.tabSelect.getSelectedIndex();
    }
    return this.selectedIndex;
  }

  getSelectedTaskId(): string | null {
    const tasks = this.taskManager.getAllTasks();

    if (tasks.length === 0) return null;

    const index = this.getSelectedIndex();

    // Ensure index is within bounds
    const safeIndex = Math.min(index, tasks.length - 1);
    const task = tasks[safeIndex];

    return task ? task.id : null;
  }

  // Layout control
  setVisible(visible: boolean): void {
    this.layout.visible = visible;
    if (this.layout.orientation === "vertical") {
      this.container.width = visible ? (this.layout.width! as any) : 0;
      this.container.border = visible;
    } else {
      this.container.height = visible ? (this.layout.height! as any) : 0;
      this.container.border = visible;
    }
  }

  isVisible(): boolean {
    return this.layout.visible;
  }

  toggleVisibility(): void {
    this.setVisible(!this.layout.visible);
  }

  // Get the container to add to parent
  getContainer(): BoxRenderable {
    return this.container;
  }

  // Cleanup
  destroy(): void {
    this.taskManager.off("taskAdded", this.boundHandlers.taskAdded);
    this.taskManager.off("taskUpdated", this.boundHandlers.taskUpdated);
    this.taskManager.off("taskRemoved", this.boundHandlers.taskRemoved);
    this.taskManager.off(
      "activeTaskChanged",
      this.boundHandlers.activeTaskChanged,
    );

    if (this.selectList) {
      this.selectList.destroy();
      this.selectList = null;
    }

    if (this.tabSelect) {
      this.tabSelect.destroy();
      this.tabSelect = null;
    }

    this.container.destroy();
  }
}
