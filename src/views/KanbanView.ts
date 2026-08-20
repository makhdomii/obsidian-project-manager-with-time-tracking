import { ItemView, WorkspaceLeaf, TFile, Menu, Notice } from "obsidian";
import ProjectManagerPlugin from "../main";
import { Workspace } from "../types";
import { linkSlug, updateFrontmatterFields } from "../utils/FrontmatterUtils";
import { statusColor, priorityColor, isMutedStatus, normalizeStatus, normalizePriority } from "../utils/StatusColors";
import { NoteInfo, renderNoteBadge } from "../utils/NoteContent";
import { isArchivedPath } from "../utils/WorkspacePaths";
import { renderTimerBar, resetTimerWithConfirm, tickTimerDisplays } from "./TimerBar";

export const KANBAN_VIEW_TYPE = "project-manager-kanban";

/** How many cards of a closed column are shown by default */
const COLLAPSED_LIMIT = 8;

export class KanbanView extends ItemView {
  plugin: ProjectManagerPlugin;
  currentWorkspace: Workspace;
  /** Selected project slug — empty means all projects */
  filterProject: string = "";
  filterPriority: string = "";
  /** Paths of tasks holding text beyond the template → marker on the card */
  private noted: Map<string, NoteInfo> = new Map();
  /** Closed columns the user expanded — has to survive the next render */
  private expandedCols: Set<string> = new Set();
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
      if (this.plugin.timeTracker.isTicking()) {
        tickTimerDisplays(this.containerEl, this.plugin);
      }
    }, 1000);

    // "changed" rather than vault "modify": modify fires the moment bytes hit
    // the file, before Obsidian has re-parsed the frontmatter, so rendering
    // then reads the *old* values. That is why an edit made outside the app —
    // a git discard, a pull — left the board showing the previous title.
    this.registerEvent(this.app.metadataCache.on("changed", () => this.render()));
    this.registerEvent(this.app.metadataCache.on("resolved", () => this.render()));
    this.registerEvent(this.app.vault.on("create", () => this.render()));
    this.registerEvent(this.app.vault.on("delete", () => this.render()));
    this.registerEvent(this.app.vault.on("rename", () => this.render()));
  }

  async onClose(): Promise<void> {
    if (this.refreshInterval !== null) {
      clearInterval(this.refreshInterval);
    }
  }

  /** Keep typing focus across full redraws (selects). */
  private captureToolbarFocus(container: HTMLElement): {
    kind: "ws" | "project" | "prio";
  } | null {
    const el = container.querySelector(":focus") as HTMLElement | null;
    if (!el || !container.contains(el)) return null;
    if (el.classList.contains("pm-ws-select")) return { kind: "ws" };
    if (el.classList.contains("pm-project-select")) return { kind: "project" };
    if (el.classList.contains("pm-filter-select")) return { kind: "prio" };
    return null;
  }

  private restoreToolbarFocus(
    container: HTMLElement,
    focus: ReturnType<KanbanView["captureToolbarFocus"]>
  ): void {
    if (!focus) return;
    const sel =
      focus.kind === "ws"
        ? container.querySelector<HTMLSelectElement>(".pm-ws-select")
        : focus.kind === "project"
          ? container.querySelector<HTMLSelectElement>(".pm-project-select")
          : container.querySelector<HTMLSelectElement>(".pm-filter-select");
    if (!sel) return;
    sel.focus();
  }

  async render(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    const restoreFocus = this.captureToolbarFocus(container);
    container.empty();
    container.addClass("pm-kanban-container");

    const tasks = await this.plugin.taskManager.getTasks(this.currentWorkspace);
    const projects = await this.plugin.projectManager.getProjects(this.currentWorkspace);
    this.noted = await this.plugin.noteScanner.scan(tasks);

    // Settings columns first, then any status values that exist on tasks but are
    // not configured (e.g. legacy "doing") — otherwise those tasks vanish.
    const foundStatuses = tasks.map((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return String(fm?.status ?? "");
    });
    const statuses = this.allStatuses(foundStatuses);

    this.ensureProjectFilter(projects);
    this.renderToolbar(container, projects, tasks);

    const board = container.createDiv({ cls: "pm-kanban-board" });
    const selectedSlug = this.filterProject;

    for (const status of statuses) {
      const col = board.createDiv({ cls: "pm-kanban-col" });
      col.setCssProps({ "--pm-status-color": statusColor(status) });
      const colKey = normalizeStatus(status);
      const colFiltered = tasks.filter((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        if (!fm) return false;
        if (normalizeStatus(fm.status) !== colKey) return false;
        if (selectedSlug && linkSlug(fm.project) !== selectedSlug) return false;
        if (
          this.filterPriority &&
          normalizePriority(fm.priority) !== normalizePriority(this.filterPriority)
        ) {
          return false;
        }
        return true;
      });

      // Closed columns only ever grow, and whatever was just closed gets lost at
      // the bottom — so newest first, with the rest behind a button.
      const closed = isMutedStatus(status);
      if (closed) {
        colFiltered.sort((a, b) => b.stat.mtime - a.stat.mtime);
      }
      const expanded = this.expandedCols.has(colKey);
      const hidden = closed && !expanded ? Math.max(0, colFiltered.length - COLLAPSED_LIMIT) : 0;
      const visible = hidden > 0 ? colFiltered.slice(0, COLLAPSED_LIMIT) : colFiltered;

      col.createDiv({ cls: "pm-col-strip" });
      const header = col.createDiv({ cls: "pm-col-header" });
      header.createSpan({ cls: "pm-col-title", text: status });
      header.createSpan({ cls: "pm-col-count", text: String(colFiltered.length) });

      const cards = col.createDiv({ cls: "pm-col-cards" });
      cards.setAttribute("data-status", colKey);

      if (colFiltered.length === 0) {
        cards.createDiv({
          cls: "pm-col-empty",
          text: selectedSlug ? "No tasks for this project" : "No tasks here",
        });
      }
      for (const task of visible) {
        this.renderTaskCard(cards, task, colKey, !!selectedSlug);
      }

      if (hidden > 0 || (closed && expanded && colFiltered.length > COLLAPSED_LIMIT)) {
        const toggle = cards.createEl("button", {
          cls: "pm-col-more",
          text: hidden > 0 ? `Show ${hidden} older` : "Show fewer",
        });
        toggle.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (expanded) this.expandedCols.delete(colKey);
          else this.expandedCols.add(colKey);
          await this.render();
        });
      }

      // Drop zone — always write the canonical lowercase status so boards match.
      cards.addEventListener("dragover", (e) => { e.preventDefault(); cards.addClass("pm-drag-over"); });
      cards.addEventListener("dragleave", () => cards.removeClass("pm-drag-over"));
      cards.addEventListener("drop", async (e) => {
        e.preventDefault();
        cards.removeClass("pm-drag-over");
        const taskPath = e.dataTransfer?.getData("text/plain");
        if (!taskPath) return;
        const file = this.app.vault.getAbstractFileByPath(taskPath) as TFile | null;
        if (!file) return;
        await updateFrontmatterFields(this.app, file, { status: colKey });
        await this.plugin.syncArchiveFor(this.currentWorkspace, file);
        await this.render();
      });
    }

    this.restoreToolbarFocus(container, restoreFocus);
  }

  private ensureProjectFilter(projects: TFile[]): void {
    if (!this.filterProject) return;
    if (!projects.some((p) => p.basename === this.filterProject)) {
      this.filterProject = "";
    }
  }

  /** Known statuses from settings, plus any extras found on tasks */
  private allStatuses(found: string[]): string[] {
    const known = this.plugin.settings.statuses.map(normalizeStatus);
    const knownSet = new Set(known);
    const extra = Array.from(new Set(found.map(normalizeStatus)))
      .filter((s) => s && !knownSet.has(s))
      .sort();
    return [...known, ...extra];
  }

  /**
   * Finds task files Obsidian's index disagrees with disk about, and makes it
   * re-read them.
   *
   * When something writes to the vault behind Obsidian's back — a git discard,
   * a pull, an editor outside the app — Obsidian can go on serving the metadata
   * it parsed before, and no plugin event ever fires. The board then shows the
   * old title until the note is opened, which is what finally forces a re-read.
   *
   * Comparing the adapter's mtime with the one on the cached file object is how
   * that disagreement becomes visible. Writing the content straight back
   * through the vault is what resolves it: the read comes from disk, so the
   * index is rebuilt from what is actually there. The bytes are unchanged, so
   * git sees nothing; only the modification time moves.
   */
  private async reindexStaleFiles(): Promise<number> {
    const files = await this.plugin.taskManager.getTasks(this.currentWorkspace);
    let stale = 0;

    for (const file of files) {
      let onDisk: { mtime: number } | null = null;
      try {
        onDisk = await this.app.vault.adapter.stat(file.path);
      } catch {
        continue; // gone or unreadable — the next render will drop it
      }
      if (!onDisk || onDisk.mtime === file.stat.mtime) continue;

      stale++;
      try {
        await this.app.vault.process(file, (content) => content);
      } catch {
        // Locked or read-only; the count still tells the user what is going on
      }
    }
    return stale;
  }

  renderTaskCard(
    container: HTMLElement,
    file: TFile,
    status: string,
    hideProject = false
  ): void {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const title = fm.title ?? file.basename;
    const card = container.createDiv({ cls: "pm-task-card" });
    card.setAttribute("draggable", "true");
    card.setAttribute("data-path", file.path);
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", title);

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
    head.createDiv({ cls: "pm-card-title", text: title });
    const notes = this.noted.get(file.path);
    if (notes) renderNoteBadge(head, notes);
    if (isArchivedPath(this.currentWorkspace, file.path)) {
      head.createSpan({
        cls: "pm-archived-badge",
        text: "🗄",
        attr: { "aria-label": "Archived — the file lives in the archive folder" },
      });
    }
    const prDot = head.createDiv({ cls: "pm-pr-dot" });
    prDot.setCssProps({ "--pm-priority-color": priorityColor(fm.priority ?? "medium") });
    prDot.setAttribute("aria-label", `Priority: ${fm.priority ?? "medium"}`);

    // Meta row — project · due · hours, all on one line
    const meta = card.createDiv({ cls: "pm-card-meta" });
    const showProject = !hideProject && !!fm.project;
    if (showProject) {
      meta.createSpan({ text: `📁 ${linkSlug(fm.project)}` });
    }
    if (fm.due) {
      const isOverdue = fm.due < new Date().toISOString().slice(0, 10) && status !== "done";
      if (showProject) {
        const sep = meta.createSpan({ cls: "pm-meta-dot" });
        sep.setAttribute("aria-hidden", "true");
      }
      meta.createSpan({ cls: isOverdue ? "pm-overdue" : "", text: `📅 ${fm.due}` });
    }
    meta.createSpan({ cls: "pm-card-hours", text: `⏱ ${fm.total_hours ?? 0}h` });

    // Timer indicator
    if (activePath === file.path) {
      const isPaused = this.plugin.timeTracker.isPaused();
      const timerDiv = card.createDiv({ cls: `pm-card-timer${isPaused ? " paused" : ""}` });
      timerDiv.createSpan({ cls: "pm-timer-dot", attr: { "aria-hidden": "true" } });
      timerDiv.createSpan({ cls: "pm-timer-elapsed", text: this.plugin.timeTracker.getElapsed() });
      if (isPaused) timerDiv.createSpan({ cls: "pm-timer-badge", text: "paused" });
    }

    const openCard = () => this.plugin.openTaskModal(file, this.currentWorkspace);

    // Click / keyboard to open task modal
    card.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".pm-card-timer")) return;
      openCard();
    });
    card.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      openCard();
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
        const paused = this.plugin.timeTracker.isPaused();
        menu.addItem((item) =>
          item
            .setTitle(paused ? "Resume timer" : "Pause timer")
            .setIcon(paused ? "play" : "pause")
            .onClick(async () => {
              this.plugin.timeTracker.togglePause();
              await this.render();
            })
        );
        menu.addItem((item) =>
          item.setTitle("Reset timer").setIcon("rotate-ccw").onClick(() => {
            resetTimerWithConfirm(this.app, this.plugin, () => void this.render());
          })
        );
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

  renderToolbar(container: HTMLElement, projects: TFile[], tasks: TFile[]): void {
    const toolbar = container.createDiv({ cls: "pm-toolbar" });

    // Workspace selector
    const wsSelect = toolbar.createEl("select", { cls: "pm-ws-select" });
    wsSelect.setAttribute("aria-label", "Workspace");
    this.plugin.settings.workspaces.forEach((ws) => {
      const opt = wsSelect.createEl("option", { value: ws.id, text: ws.name });
      if (ws.id === this.currentWorkspace.id) opt.selected = true;
    });
    wsSelect.addEventListener("change", async () => {
      const ws = this.plugin.settings.workspaces.find((w) => w.id === wsSelect.value);
      if (ws) {
        this.currentWorkspace = ws;
        this.plugin.settings.defaultWorkspaceId = ws.id;
        this.filterProject = "";
        await this.plugin.saveSettings();
        await this.render();
      }
    });

    // Project filter — one dropdown instead of a row of buttons
    const taskCountBySlug = new Map<string, number>();
    for (const task of tasks) {
      const fm = this.app.metadataCache.getFileCache(task)?.frontmatter;
      const slug = linkSlug(fm?.project);
      if (!slug) continue;
      taskCountBySlug.set(slug, (taskCountBySlug.get(slug) ?? 0) + 1);
    }

    const projSelect = toolbar.createEl("select", { cls: "pm-filter-select pm-project-select" });
    projSelect.setAttribute("aria-label", "Filter by project");
    projSelect.createEl("option", {
      value: "",
      text: `All projects (${tasks.length})`,
    });

    const sorted = projects.slice().sort((a, b) => {
      const ta = String(this.app.metadataCache.getFileCache(a)?.frontmatter?.title ?? a.basename);
      const tb = String(this.app.metadataCache.getFileCache(b)?.frontmatter?.title ?? b.basename);
      return ta.localeCompare(tb);
    });
    for (const file of sorted) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const slug = file.basename;
      const title = String(fm?.title ?? slug);
      const count = taskCountBySlug.get(slug) ?? 0;
      const opt = projSelect.createEl("option", {
        value: slug,
        text: `${title} (${count})`,
      });
      if (slug === this.filterProject) opt.selected = true;
    }
    projSelect.addEventListener("change", async () => {
      this.filterProject = projSelect.value;
      await this.render();
    });

    // Filter by priority
    const prioSelect = toolbar.createEl("select", { cls: "pm-filter-select" });
    prioSelect.setAttribute("aria-label", "Filter by priority");
    prioSelect.createEl("option", { value: "", text: "All priorities" });
    this.plugin.settings.priorities.forEach((p) => {
      const opt = prioSelect.createEl("option", { value: p, text: p });
      if (p === this.filterPriority) opt.selected = true;
    });
    prioSelect.addEventListener("change", async () => {
      this.filterPriority = prioSelect.value;
      await this.render();
    });

    // New task button — preselects the active project when set
    toolbar.createEl("button", { cls: "pm-btn pm-btn-primary", text: "+ New Task" })
      .addEventListener("click", () => {
        this.plugin.openNewTaskModal(this.currentWorkspace, this.filterProject || undefined);
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

    // A way out when a card is showing something stale. The board redraws on
    // metadata events, but a file changed outside Obsidian — a git discard, a
    // pull — is only noticed once Obsidian itself re-indexes it, and nothing a
    // plugin can do forces that. Reload re-reads the files and says so plainly.
    const reload = toolbar.createEl("button", {
      cls: "pm-btn pm-btn-secondary",
      text: "↻ Reload",
      attr: { "aria-label": "Re-read the task files and redraw the board" },
    });
    reload.addEventListener("click", async () => {
      const stale = await this.reindexStaleFiles();
      await this.render();
      new Notice(
        stale > 0
          ? `Board reloaded — ${stale} file(s) had changed outside Obsidian`
          : "Board reloaded"
      );
    });

    // Active timer display
    renderTimerBar(toolbar, this.plugin, this.currentWorkspace, () => void this.render());
  }
}
