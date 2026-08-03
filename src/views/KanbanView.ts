import { ItemView, WorkspaceLeaf, TFile, Menu, Notice } from "obsidian";
import ProjectManagerPlugin from "../main";
import { Workspace } from "../types";
import { updateFrontmatterFields } from "../utils/FrontmatterUtils";
import { statusColor, priorityColor, isMutedStatus } from "../utils/StatusColors";

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

    this.registerEvent(
        this.app.vault.on("create", () => this.render())
    );
    this.registerEvent(
        this.app.vault.on("modify", () => this.render())
    );
    this.registerEvent(
        this.app.vault.on("delete", () => this.render())
    );
    this.registerEvent(
        this.app.metadataCache.on("resolved", () => this.render())
    );    
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
      col.style.setProperty("--pm-status-color", statusColor(status));
      const colFiltered = tasks.filter((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        if (!fm) return false;
        if (fm.status !== status) return false;
        if (this.filterProject && fm.project !== `[[${this.filterProject}]]`) return false;
        if (this.filterPriority && fm.priority !== this.filterPriority) return false;
        return true;
      });

      col.createDiv({ cls: "pm-col-strip" });
      const header = col.createDiv({ cls: "pm-col-header" });
      header.createSpan({ cls: "pm-col-title", text: status });
      header.createSpan({ cls: "pm-col-count", text: String(colFiltered.length) });

      const cards = col.createDiv({ cls: "pm-col-cards" });
      cards.setAttribute("data-status", status);

      if (colFiltered.length === 0) {
        cards.createDiv({ cls: "pm-col-empty", text: "No tasks here" });
      }
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

    const activePath = this.plugin.timeTracker.getActiveTaskPath();
    if (this.plugin.timeTracker.isRunning()) {
      card.addClass(activePath === file.path ? "pm-task-active" : "pm-task-inactive");
    }
    if (isMutedStatus(status) && activePath !== file.path) {
      card.addClass("pm-card-muted");
    }

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/plain", file.path);
      card.addClass("pm-dragging");
    });
    card.addEventListener("dragend", () => card.removeClass("pm-dragging"));

    // Title + priority dot
    const head = card.createDiv({ cls: "pm-card-head" });
    head.createDiv({ cls: "pm-card-title", text: fm.title ?? file.basename });
    const prDot = head.createDiv({ cls: "pm-pr-dot" });
    prDot.style.setProperty("--pm-priority-color", priorityColor(fm.priority ?? "medium"));
    prDot.setAttribute("aria-label", `Priority: ${fm.priority ?? "medium"}`);

    // Meta row — project · due · hours, all on one line
    const meta = card.createDiv({ cls: "pm-card-meta" });
    if (fm.project) {
      meta.createSpan({ text: `📁 ${fm.project.replace(/^\[\[|\]\]$/g, "")}` });
    }
    if (fm.due) {
      const isOverdue = fm.due < new Date().toISOString().slice(0, 10) && status !== "done";
      if (fm.project) meta.createSpan({ cls: "pm-meta-dot" });
      meta.createSpan({ cls: isOverdue ? "pm-overdue" : "", text: `📅 ${fm.due}` });
    }
    meta.createSpan({ cls: "pm-card-hours", text: `⏱ ${fm.total_hours ?? 0}h` });

    // Timer indicator
    if (activePath === file.path) {
      const timerDiv = card.createDiv({ cls: "pm-card-timer" });
      timerDiv.createSpan({ cls: "pm-timer-dot" });
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
        this.plugin.settings.defaultWorkspaceId = ws.id;
        await this.plugin.saveSettings();
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

    // Project dashboard button
    toolbar.createEl("button", { cls: "pm-btn pm-btn-secondary", text: "Project Dashboard" })
      .addEventListener("click", () => {
        this.plugin.openProjectDashboard();
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
