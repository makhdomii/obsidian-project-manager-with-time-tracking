import { ItemView, WorkspaceLeaf, TFile, Menu, Notice } from "obsidian";
import ProjectManagerPlugin from "../main";
import { Workspace } from "../types";
import { updateFrontmatterFields } from "../utils/FrontmatterUtils";

export const KANBAN_VIEW_TYPE = "project-manager-kanban";

export class KanbanView extends ItemView {
  plugin: ProjectManagerPlugin;
  currentWorkspace: Workspace;
  filterProject: string = "";
  filterPriority: string = "";
  private refreshInterval: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ProjectManagerPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentWorkspace = plugin.getCurrentWorkspace();
  }

  getViewType(): string { return KANBAN_VIEW_TYPE; }
  getDisplayText(): string { return "Kanban Board"; }
  getIcon(): string { return "layout-kanban"; }

  async onOpen(): Promise<void> {
    await this.render();
    this.refreshInterval = window.setInterval(() => {
      if (this.plugin.timeTracker.isRunning()) {
        const timerEl = this.containerEl.querySelector(".pm-timer-elapsed");
        if (timerEl) timerEl.textContent = this.plugin.timeTracker.getElapsed();
      }
    }, 1000);
  }

  async onClose(): Promise<void> {
    if (this.refreshInterval !== null) {
      clearInterval(this.refreshInterval);
    }
  }

  async render(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("pm-kanban-container");

    // Toolbar
    this.renderToolbar(container);

    // Board
    const board = container.createDiv({ cls: "pm-kanban-board" });
    const statuses = this.plugin.settings.statuses;
    const tasks = await this.plugin.taskManager.getTasks(this.currentWorkspace);

    for (const status of statuses) {
      const col = board.createDiv({ cls: "pm-kanban-col" });
      const colFiltered = tasks.filter((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        if (!fm) return false;
        if (fm.status !== status) return false;
        if (this.filterProject && fm.project !== `[[${this.filterProject}]]`) return false;
        if (this.filterPriority && fm.priority !== this.filterPriority) return false;
        return true;
      });

      const header = col.createDiv({ cls: "pm-col-header" });
      header.createSpan({ cls: "pm-col-title", text: status });
      header.createSpan({ cls: "pm-col-count", text: String(colFiltered.length) });

      const cards = col.createDiv({ cls: "pm-col-cards" });
      cards.setAttribute("data-status", status);

      for (const task of colFiltered) {
        this.renderTaskCard(cards, task, status);
      }

      // Drop zone
      cards.addEventListener("dragover", (e) => { e.preventDefault(); cards.addClass("pm-drag-over"); });
      cards.addEventListener("dragleave", () => cards.removeClass("pm-drag-over"));
      cards.addEventListener("drop", async (e) => {
        e.preventDefault();
        cards.removeClass("pm-drag-over");
        const taskPath = e.dataTransfer?.getData("text/plain");
        if (!taskPath) return;
        const file = this.app.vault.getAbstractFileByPath(taskPath) as TFile | null;
        if (!file) return;
        await updateFrontmatterFields(this.app, file, { status });
        await this.render();
      });
    }
  }

  renderTaskCard(container: HTMLElement, file: TFile, status: string): void {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const card = container.createDiv({ cls: "pm-task-card" });
    card.setAttribute("draggable", "true");
    card.setAttribute("data-path", file.path);

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/plain", file.path);
      card.addClass("pm-dragging");
    });
    card.addEventListener("dragend", () => card.removeClass("pm-dragging"));

    // Priority badge
    const priorityClass = `pm-priority-${(fm.priority ?? "medium").toLowerCase()}`;
    card.createDiv({ cls: `pm-priority-badge ${priorityClass}`, text: fm.priority ?? "medium" });

    // Title
    card.createDiv({ cls: "pm-card-title", text: fm.title ?? file.basename });

    // Project link
    if (fm.project) {
      const projDiv = card.createDiv({ cls: "pm-card-project" });
      projDiv.createSpan({ text: "📁 " });
      projDiv.createSpan({ text: fm.project.replace(/^\[\[|\]\]$/g, "") });
    }

    // Due date
    if (fm.due) {
      const dueDiv = card.createDiv({ cls: "pm-card-due" });
      const isOverdue = fm.due < new Date().toISOString().slice(0, 10) && status !== "done";
      dueDiv.addClass(isOverdue ? "pm-overdue" : "pm-due-ok");
      dueDiv.createSpan({ text: `📅 ${fm.due}` });
    }

    // Hours
    card.createDiv({ cls: "pm-card-hours", text: `⏱ ${fm.total_hours ?? 0}h` });

    // Timer indicator
    const activePath = this.plugin.timeTracker.getActiveTaskPath();
    if (activePath === file.path) {
      const timerDiv = card.createDiv({ cls: "pm-card-timer" });
      timerDiv.createSpan({ cls: "pm-timer-dot", text: "● " });
      timerDiv.createSpan({ cls: "pm-timer-elapsed", text: this.plugin.timeTracker.getElapsed() });
    }

    // Click to open task modal
    card.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".pm-card-timer")) return;
      this.plugin.openTaskModal(file, this.currentWorkspace);
    });

    // Right-click context menu
    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const menu = new Menu();
      menu.addItem((item) =>
        item.setTitle("Open note").setIcon("file-text").onClick(() => {
          this.app.workspace.getLeaf(false).openFile(file);
        })
      );
      menu.addItem((item) =>
        item.setTitle("Start timer").setIcon("play").onClick(async () => {
          try {
            this.plugin.timeTracker.startTimer(file.path, fm.title ?? file.basename, this.currentWorkspace.id);
            new Notice(`Timer started: ${fm.title}`);
            await this.render();
          } catch (err: any) {
            new Notice(err.message);
          }
        })
      );
      if (this.plugin.timeTracker.getActiveTaskPath() === file.path) {
        menu.addItem((item) =>
          item.setTitle("Stop timer").setIcon("square").onClick(async () => {
            try {
              const hours = await this.plugin.timeTracker.stopTimer(this.currentWorkspace);
              new Notice(`Stopped. Logged ${hours}h`);
              await this.render();
            } catch (err: any) {
              new Notice(err.message);
            }
          })
        );
      }
      menu.showAtMouseEvent(e);
    });
  }

  renderToolbar(container: HTMLElement): void {
    const toolbar = container.createDiv({ cls: "pm-toolbar" });

    // Workspace selector
    const wsSelect = toolbar.createEl("select", { cls: "pm-ws-select" });
    this.plugin.settings.workspaces.forEach((ws) => {
      const opt = wsSelect.createEl("option", { value: ws.id, text: ws.name });
      if (ws.id === this.currentWorkspace.id) opt.selected = true;
    });
    wsSelect.addEventListener("change", async () => {
      const ws = this.plugin.settings.workspaces.find((w) => w.id === wsSelect.value);
      if (ws) {
        this.currentWorkspace = ws;
        await this.render();
      }
    });

    // Filter by project
    const projInput = toolbar.createEl("input", {
      cls: "pm-filter-input",
      type: "text",
      placeholder: "Filter project...",
    });
    projInput.value = this.filterProject;
    projInput.addEventListener("input", async () => {
      this.filterProject = projInput.value.trim();
      await this.render();
    });

    // Filter by priority
    const prioSelect = toolbar.createEl("select", { cls: "pm-filter-select" });
    prioSelect.createEl("option", { value: "", text: "All priorities" });
    this.plugin.settings.priorities.forEach((p) => {
      const opt = prioSelect.createEl("option", { value: p, text: p });
      if (p === this.filterPriority) opt.selected = true;
    });
    prioSelect.addEventListener("change", async () => {
      this.filterPriority = prioSelect.value;
      await this.render();
    });

    // New task button
    toolbar.createEl("button", { cls: "pm-btn pm-btn-primary", text: "+ New Task" })
      .addEventListener("click", () => {
        this.plugin.openNewTaskModal(this.currentWorkspace);
      });

    // New project button
    toolbar.createEl("button", { cls: "pm-btn pm-btn-secondary", text: "+ New Project" })
      .addEventListener("click", () => {
        this.plugin.openNewProjectModal(this.currentWorkspace);
      });

    // Active timer display
    if (this.plugin.timeTracker.isRunning()) {
      const timerBar = toolbar.createDiv({ cls: "pm-timer-bar" });
      timerBar.createSpan({ text: `⏱ ${this.plugin.timeTracker.getActiveTimer()?.taskTitle} — ` });
      timerBar.createSpan({ cls: "pm-timer-elapsed", text: this.plugin.timeTracker.getElapsed() });
      timerBar.createEl("button", { cls: "pm-btn pm-btn-danger", text: "Stop" })
        .addEventListener("click", async () => {
          try {
            const hours = await this.plugin.timeTracker.stopTimer(this.currentWorkspace);
            new Notice(`Stopped. Logged ${hours}h`);
            await this.render();
          } catch (err: any) {
            new Notice(err.message);
          }
        });
    }
  }
}
