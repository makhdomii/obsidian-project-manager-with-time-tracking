import { ItemView, WorkspaceLeaf, TFile, Menu, Notice } from "obsidian";
import { updateFrontmatterFields } from "../utils/FrontmatterUtils";
import ProjectManagerPlugin from "../main";
import { Workspace } from "../types";
import { statusColor, isMutedStatus } from "../utils/StatusColors";

export const PROJECT_DASHBOARD_VIEW_TYPE = "project-manager-project-dashboard";

export class ProjectDashboardView extends ItemView {
  plugin: ProjectManagerPlugin;
  currentWorkspace: Workspace;
  filterStatus: string = "";
  filterPriority: string = "";
  private refreshInterval: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ProjectManagerPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentWorkspace = plugin.getCurrentWorkspace();
  }

  getViewType(): string {
    return PROJECT_DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Project Dashboard";
  }

  getIcon(): string {
    return "folder-open";
  }

  async onOpen(): Promise<void> {
    await this.render();
    this.refreshInterval = window.setInterval(() => {
      if (this.plugin.timeTracker.isRunning()) {
        const timerEl = this.containerEl.querySelector(".pm-timer-elapsed");
        if (timerEl) timerEl.textContent = this.plugin.timeTracker.getElapsed();
      }
    }, 1000);

    this.registerEvent(this.app.vault.on("create", () => this.render()));
    this.registerEvent(this.app.vault.on("modify", () => this.render()));
    this.registerEvent(this.app.vault.on("delete", () => this.render()));
    this.registerEvent(this.app.metadataCache.on("resolved", () => this.render()));
  }

  async onClose(): Promise<void> {
    if (this.refreshInterval !== null) {
      clearInterval(this.refreshInterval);
    }
  }

  async render(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("pm-dashboard-container");

    this.renderToolbar(container);

    const content = container.createDiv({ cls: "pm-dashboard-content" });
    const projects = await this.plugin.projectManager.getProjects(this.currentWorkspace);
    const tasks = await this.plugin.taskManager.getTasks(this.currentWorkspace);

    // Group projects by status into a kanban-style board
    const statuses = this.plugin.settings.statuses;
    const board = content.createDiv({ cls: "pm-kanban-board" });

    for (const status of statuses) {
      const col = board.createDiv({ cls: "pm-kanban-col" });
      col.style.setProperty("--pm-status-color", statusColor(status));
      col.createDiv({ cls: "pm-col-strip" });
      const header = col.createDiv({ cls: "pm-col-header" });
      header.createSpan({ cls: "pm-col-title", text: status });

      const colTasks = projects
        .filter((project) => {
          const fm = this.app.metadataCache.getFileCache(project)?.frontmatter ?? {};
          if (this.filterPriority && fm.priority !== this.filterPriority) return false;
          if (this.filterStatus && fm.status !== this.filterStatus) return false;
          return fm.status === status;
        });

      header.createSpan({ cls: "pm-col-count", text: String(colTasks.length) });

      const cards = col.createDiv({ cls: "pm-col-cards" });
      cards.setAttribute("data-status", status);

      if (colTasks.length === 0) {
        cards.createDiv({ cls: "pm-col-empty", text: "No projects here" });
      }
      for (const project of colTasks) {
        this.renderProjectCard(cards, project, tasks);
      }

      // Drop zone handlers
      cards.addEventListener("dragover", (e) => { e.preventDefault(); cards.addClass("pm-drag-over"); });
      cards.addEventListener("dragleave", () => cards.removeClass("pm-drag-over"));
      cards.addEventListener("drop", async (e) => {
        e.preventDefault();
        cards.removeClass("pm-drag-over");
        const projPath = e.dataTransfer?.getData("text/plain");
        if (!projPath) return;
        const file = this.app.vault.getAbstractFileByPath(projPath) as TFile | null;
        if (!file) return;
        await updateFrontmatterFields(this.app, file, { status });
        // Refresh both views
        this.plugin.refreshProjectDashboard();
        this.plugin.refreshKanban();
      });
    }
  }

  renderProjectCard(container: HTMLElement, project: TFile, tasks: TFile[]): void {
    const fm = this.app.metadataCache.getFileCache(project)?.frontmatter ?? {};
    const projectSlug = project.basename;
    const projectTasks = tasks.filter((task) => {
      const tfm = this.app.metadataCache.getFileCache(task)?.frontmatter;
      return tfm?.project === `[[${projectSlug}]]`;
    });

    const totalHours = projectTasks.reduce((sum, task) => {
      const tfm = this.app.metadataCache.getFileCache(task)?.frontmatter;
      return sum + Number(tfm?.total_hours ?? 0);
    }, 0);

    const status = fm.status ?? "not started";
    const overdue = fm.due && fm.due < new Date().toISOString().slice(0, 10) && status !== "done";

    const card = container.createDiv({ cls: "pm-task-card" });
    // make draggable like task cards
    card.setAttribute("draggable", "true");
    card.setAttribute("data-path", project.path);
    if (overdue) card.addClass("pm-overdue-card");
    if (isMutedStatus(status)) card.addClass("pm-card-muted");

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/plain", project.path);
      card.addClass("pm-dragging");
    });
    card.addEventListener("dragend", () => card.removeClass("pm-dragging"));

    // Priority badge (reuse task styles)
    const priorityClass = `pm-priority-${(fm.priority ?? "medium").toLowerCase()}`;
    card.createDiv({ cls: `pm-priority-badge ${priorityClass}`, text: fm.priority ?? "medium" });

    const header = card.createDiv({ cls: "pm-project-card-header" });
    header.createDiv({ cls: "pm-project-title", text: fm.title ?? project.basename });
    header.createDiv({ cls: "pm-project-chip", text: status });

    const meta = card.createDiv({ cls: "pm-project-meta" });
    meta.createDiv({ cls: "pm-project-stat", text: `Priority: ${fm.priority ?? "medium"}` });
    meta.createDiv({ cls: "pm-project-stat", text: `Due: ${fm.due ?? "—"}` });
    meta.createDiv({ cls: "pm-project-stat", text: `Tasks: ${projectTasks.length}` });
    meta.createDiv({ cls: "pm-project-stat", text: `Hours: ${Math.round(totalHours * 100) / 100}` });

    const actions = card.createDiv({ cls: "pm-project-actions" });
    actions.createEl("button", { cls: "pm-btn pm-btn-secondary", text: "Edit" })
      .addEventListener("click", (e) => {
        e.stopPropagation();
        this.plugin.openProjectModal(project, this.currentWorkspace);
      });

    actions.createEl("button", { cls: "pm-btn", text: "Open note" })
      .addEventListener("click", (e) => {
        e.stopPropagation();
        this.app.workspace.getLeaf(false).openFile(project);
      });

    card.addEventListener("click", () => {
      this.plugin.openProjectModal(project, this.currentWorkspace);
    });

    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const menu = new Menu();
      menu.addItem((item) =>
        item.setTitle("Open project note").setIcon("file-text").onClick(() => {
          this.app.workspace.getLeaf(false).openFile(project);
        })
      );
      menu.addItem((item) =>
        item.setTitle("Edit project").setIcon("pencil").onClick(() => {
          this.plugin.openProjectModal(project, this.currentWorkspace);
        })
      );
      menu.showAtMouseEvent(e);
    });
  }

  renderToolbar(container: HTMLElement): void {
    const toolbar = container.createDiv({ cls: "pm-toolbar" });

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

    const statusSelect = toolbar.createEl("select", { cls: "pm-filter-select" });
    statusSelect.createEl("option", { value: "", text: "All statuses" });
    this.plugin.settings.statuses.forEach((status) => {
      const opt = statusSelect.createEl("option", { value: status, text: status });
      if (status === this.filterStatus) opt.selected = true;
    });
    statusSelect.addEventListener("change", async () => {
      this.filterStatus = statusSelect.value;
      await this.render();
    });

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

    toolbar.createEl("button", { cls: "pm-btn pm-btn-primary", text: "+ New Task" })
      .addEventListener("click", () => {
        this.plugin.openNewTaskModal(this.currentWorkspace);
      });

    toolbar.createEl("button", { cls: "pm-btn pm-btn-secondary", text: "+ New Project" })
      .addEventListener("click", () => {
        this.plugin.openNewProjectModal(this.currentWorkspace);
      });

    toolbar.createEl("button", { cls: "pm-btn pm-btn-secondary", text: "Open Kanban" })
      .addEventListener("click", () => {
        this.plugin.openKanban();
      });

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
