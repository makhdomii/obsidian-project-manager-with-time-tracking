import { Plugin, WorkspaceLeaf, TFile, Notice, addIcon } from "obsidian";
import { ProjectManagerSettings, DEFAULT_SETTINGS, Workspace } from "./types";
import { ProjectManagerSettingTab } from "./settings";
import { WorkspaceManager } from "./managers/WorkspaceManager";
import { ProjectManager } from "./managers/ProjectManager";
import { TaskManager } from "./managers/TaskManager";
import { TimeTracker } from "./managers/TimeTracker";
import { KanbanView, KANBAN_VIEW_TYPE } from "./views/KanbanView";
import { ProjectDashboardView, PROJECT_DASHBOARD_VIEW_TYPE } from "./views/ProjectDashboardView";
import { TaskModal } from "./views/TaskModal";
import { ProjectModal } from "./views/ProjectModal";
import { AnalyticsManager } from "./managers/AnalyticsManager";
import { ArchiveManager } from "./managers/ArchiveManager";
import { ProjectManagerApi, createApi } from "./api";
import { Calendar, createCalendar } from "./utils/Calendar";
import { defaultArchiveFolder } from "./utils/WorkspacePaths";
import { NoteScanner } from "./utils/NoteContent";
import { DASHBOARD_STYLES } from "./styles/dashboardStyles";
import { resetTimerWithConfirm } from "./views/TimerBar";

export default class ProjectManagerPlugin extends Plugin {
  settings: ProjectManagerSettings;
  workspaceManager: WorkspaceManager;
  projectManager: ProjectManager;
  taskManager: TaskManager;
  timeTracker: TimeTracker;
  analytics: AnalyticsManager;
  noteScanner: NoteScanner;
  archiveManager: ArchiveManager;
  /** Public surface for other plugins — see src/api.ts */
  api: ProjectManagerApi;
  /** Jalali or Gregorian, per settings. Rebuilt whenever those change. */
  calendar: Calendar;
  private styleEl: HTMLStyleElement | null = null;
  /** Raw timer from data.json — held until timeTracker has been constructed */
  private persistedTimer: unknown = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.workspaceManager = new WorkspaceManager(this.app);
    this.projectManager = new ProjectManager(this.app);
    this.taskManager = new TaskManager(this.app);
    this.timeTracker = new TimeTracker(this.app, this.taskManager);
    this.timeTracker.setPersistHandler(() => void this.savePluginData());
    this.analytics = new AnalyticsManager(this.app);
    this.noteScanner = new NoteScanner(this.app);
    this.archiveManager = new ArchiveManager(this.app, this.workspaceManager);
    this.api = createApi(this);
    this.rebuildCalendar();

    this.restoreTimer();
    await this.migrateStatusNames();

    // Ensure all workspace folders exist
    for (const ws of this.settings.workspaces) {
      await this.workspaceManager.ensureWorkspace(ws);
      await this.archiveManager.ensureArchiveFolders(ws);
    }

    // Register views
    this.registerView(KANBAN_VIEW_TYPE, (leaf) => new KanbanView(leaf, this));
    this.registerView(PROJECT_DASHBOARD_VIEW_TYPE, (leaf) => new ProjectDashboardView(leaf, this));

    // Load styles
    this.loadStyles();

    // Commands
    this.addCommand({
      id: "open-kanban",
      name: "Open Kanban Board",
      callback: () => this.openKanban(),
    });

    this.addCommand({
      id: "new-task",
      name: "New Task",
      callback: () => this.openNewTaskModal(this.getCurrentWorkspace()),
    });

    this.addCommand({
      id: "new-project",
      name: "New Project",
      callback: () => this.openNewProjectModal(this.getCurrentWorkspace()),
    });

    this.addCommand({
      id: "sync-archive",
      name: "Tidy archive (move closed items, restore reopened ones)",
      callback: async () => {
        const ws = this.getCurrentWorkspace();
        const r = await this.archiveManager.syncWorkspace(ws);
        new Notice(
          r.moved || r.restored
            ? `Archive tidied — ${r.moved} moved, ${r.restored} restored`
            : "Archive already up to date"
        );
        this.refreshTimerViews();
      },
    });

    this.addCommand({
      id: "open-project-dashboard",
      name: "Open Project Dashboard",
      callback: () => this.openProjectDashboard(),
    });

    this.addCommand({
      id: "start-timer",
      name: "Start Timer (active file)",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) { new Notice("No active file"); return; }
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (fm?.type !== "task") { new Notice("Active file is not a task"); return; }
        try {
          this.timeTracker.startTimer(file.path, fm.title ?? file.basename, fm.workspace ?? this.settings.defaultWorkspaceId);
          new Notice(`Timer started: ${fm.title}`);
          this.refreshTimerViews();
        } catch (err: any) {
          new Notice(err.message);
        }
      },
    });

    this.addCommand({
      id: "pause-timer",
      name: "Pause / Resume Timer",
      callback: () => {
        if (!this.timeTracker.isRunning()) { new Notice("No timer running"); return; }
        this.timeTracker.togglePause();
        new Notice(
          this.timeTracker.isPaused()
            ? `Paused at ${this.timeTracker.getElapsed()}`
            : `Resumed: ${this.timeTracker.getActiveTimer()?.taskTitle}`
        );
        this.refreshTimerViews();
      },
    });

    this.addCommand({
      id: "stop-timer",
      name: "Stop Timer",
      callback: async () => {
        if (!this.timeTracker.isRunning()) { new Notice("No timer running"); return; }
        const ws = this.getCurrentWorkspace();
        const hours = await this.timeTracker.stopTimer(ws);
        new Notice(`Stopped. Logged ${hours}h`);
        this.refreshTimerViews();
      },
    });

    this.addCommand({
      id: "reset-timer",
      name: "Reset Timer (keep running from zero)",
      callback: () => {
        if (!this.timeTracker.isRunning()) { new Notice("No timer running"); return; }
        resetTimerWithConfirm(this.app, this, () => this.refreshTimerViews());
      },
    });

    this.addCommand({
      id: "discard-timer",
      name: "Discard Timer (log nothing)",
      callback: () => {
        if (!this.timeTracker.isRunning()) { new Notice("No timer running"); return; }
        const title = this.timeTracker.getActiveTimer()?.taskTitle;
        this.timeTracker.discard();
        new Notice(`Discarded timer: ${title}`);
        this.refreshTimerViews();
      },
    });

    // Ribbon icons for quick access
    this.addRibbonIcon("folder-open", "Open Kanban Board", () => this.openKanban());
    this.addRibbonIcon("folder-open", "Open Project Dashboard", () => this.openProjectDashboard());

    // Settings tab
    this.addSettingTab(new ProjectManagerSettingTab(this.app, this));
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(KANBAN_VIEW_TYPE);
    // The style tag must go with the plugin, or the next load stacks on top of it
    this.styleEl?.remove();
    this.styleEl = null;
  }

  /**
   * data.json holds both the settings and the active timer. Settings stay
   * top-level as before, so existing files work without migration, and the timer
   * sits beside them under the activeTimer key.
   */
  async loadSettings(): Promise<void> {
    const data = ((await this.loadData()) ?? {}) as Record<string, unknown>;
    const { activeTimer, ...settings } = data;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, settings);
    this.persistedTimer = activeTimer ?? null;

    // New installs default to Gregorian, which suits most people. But everything
    // that existed before this setting was Jalali-only, so an existing vault
    // keeps Jalali rather than silently switching calendars under the user.
    const isUpgrade = Object.keys(settings).length > 0;
    if (isUpgrade && settings.calendar === undefined) {
      this.settings.calendar = "jalali";
    }

    // Workspaces created before archiving existed do not carry this key
    for (const ws of this.settings.workspaces) {
      if (!ws.archiveFolder) ws.archiveFolder = defaultArchiveFolder(ws.rootFolder);
    }
  }

  /** The only writer of data.json — settings and timer always go out together */
  async savePluginData(): Promise<void> {
    await this.saveData({ ...this.settings, activeTimer: this.timeTracker.serialize() });
  }

  async saveSettings(): Promise<void> {
    // The calendar is derived from settings, so it has to be rebuilt before any
    // view re-reads it — otherwise switching calendars appears to do nothing
    // until the next reload.
    this.rebuildCalendar();
    await this.savePluginData();
  }

  /** One calendar object shared by every view, so they cannot disagree */
  rebuildCalendar(): void {
    this.calendar = createCalendar(this.settings.calendar, this.settings.weekStart);
  }

  /**
   * Renames the old status names in settings, once and for good.
   *
   * Needed because stored settings land on top of DEFAULT_SETTINGS: without it,
   * data.json keeps "not started" forever and the board columns stop matching the
   * migrated notes — meaning no task is drawn at all. The old name is *replaced*
   * here, not supported alongside.
   */
  private async migrateStatusNames(): Promise<void> {
    const RENAMES: Record<string, string> = {
      "not started": "todo",
      "in progress": "active",
    };
    const before = this.settings.statuses.join("\u0000");
    const renamed = this.settings.statuses.map((s) => {
      const key = String(s).trim().toLowerCase();
      return RENAMES[key] ?? key;
    });
    this.settings.statuses = [...new Set(renamed)];
    if (this.settings.statuses.join("\u0000") !== before) {
      await this.savePluginData();
    }
  }

  /** Restores the saved timer and tells the user how long it thinks it has run */
  private restoreTimer(): void {
    if (!this.timeTracker.restore(this.persistedTimer)) return;
    const t = this.timeTracker.getActiveTimer();
    if (!t) return;
    const state = this.timeTracker.isPaused() ? "paused" : "still running";
    new Notice(
      `Timer restored (${state}): ${t.taskTitle} — ${this.timeTracker.getElapsed()}`,
      8000
    );
  }

  getCurrentWorkspace(): Workspace {
    return (
      this.settings.workspaces.find((ws) => ws.id === this.settings.defaultWorkspaceId) ??
      this.settings.workspaces[0]
    );
  }

  async openKanban(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(KANBAN_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: KANBAN_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  refreshKanban(): void {
    const leaves = this.app.workspace.getLeavesOfType(KANBAN_VIEW_TYPE);
    for (const leaf of leaves) {
      (leaf.view as KanbanView).render();
    }
  }

  openTaskModal(file: TFile, ws: Workspace): void {
    new TaskModal(this.app, this, ws, file).open();
  }

  openNewTaskModal(ws: Workspace): void {
    new TaskModal(this.app, this, ws, null).open();
  }

  openProjectModal(file: TFile, ws: Workspace): void {
    new ProjectModal(this.app, this, ws, file).open();
  }

  openNewProjectModal(ws: Workspace): void {
    new ProjectModal(this.app, this, ws, null).open();
  }

  openProjectDashboard(): void {
    const existing = this.app.workspace.getLeavesOfType(PROJECT_DASHBOARD_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    void leaf.setViewState({ type: PROJECT_DASHBOARD_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  /**
   * Called after any status change: moves the file — and for a project its tasks
   * and their time entries — into the archive, or back out of it.
   *
   * Obsidian's metadata cache updates a beat after frontmatter is written, so we
   * wait to read the new status rather than the old one.
   */
  async syncArchiveFor(ws: Workspace, file: TFile): Promise<void> {
    await this.nextMetadataTick(file);
    const type = this.app.metadataCache.getFileCache(file)?.frontmatter?.type;
    if (type === "project") await this.archiveManager.syncProject(ws, file);
    else if (type === "task") await this.archiveManager.syncTask(ws, file);
  }

  /** Waits for this file's metadata cache to refresh, with a time limit */
  private nextMetadataTick(file: TFile): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.app.metadataCache.offref(ref);
        resolve();
      };
      const ref = this.app.metadataCache.on("changed", (changed) => {
        if (changed.path === file.path) finish();
      });
      window.setTimeout(finish, 400);
    });
  }

  /** After any timer state change both views need refreshing, not just the kanban */
  refreshTimerViews(): void {
    this.refreshKanban();
    this.refreshProjectDashboard();
  }

  refreshProjectDashboard(): void {
    const leaves = this.app.workspace.getLeavesOfType(PROJECT_DASHBOARD_VIEW_TYPE);
    for (const leaf of leaves) {
      (leaf.view as ProjectDashboardView).render();
    }
  }

  loadStyles(): void {
    const styleId = "pm-styles";
    // This used to return early when the style tag already existed, which meant
    // that after any update or reload the previous version's stylesheet stayed and
    // new rules never applied. The content is now always rewritten.
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = this.getStyles();
    this.styleEl = style;
  }

  getStyles(): string {
    return `
/* ===== Project Manager Plugin Styles ===== */

.pm-kanban-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--background-primary);
  font-family: var(--font-interface);
}

.pm-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--background-secondary);
  border-bottom: 1px solid var(--background-modifier-border);
  flex-wrap: wrap;
  flex-shrink: 0;
}

.pm-ws-select, .pm-filter-select, .pm-filter-input {
  padding: 5px 10px;
  border-radius: 7px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 12.5px;
}

.pm-btn {
  padding: 6px 14px;
  border-radius: 7px;
  border: 1px solid var(--background-modifier-border);
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 600;
  background: transparent;
  color: var(--text-muted);
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease, transform 0.05s ease;
}
.pm-btn:hover { background: var(--background-modifier-hover); color: var(--text-normal); }
.pm-btn:active { transform: translateY(1px); }
.pm-btn-primary { background: var(--interactive-accent); color: var(--text-on-accent); border-color: transparent; }
.pm-btn-primary:hover { background: var(--interactive-accent-hover); color: var(--text-on-accent); }
.pm-btn-secondary { color: var(--text-muted); }
.pm-btn-danger { color: var(--color-red); border-color: color-mix(in srgb, var(--color-red) 45%, var(--background-modifier-border)); }
.pm-btn-danger:hover { background: color-mix(in srgb, var(--color-red) 14%, transparent); color: var(--color-red); }

.pm-timer-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--interactive-accent) 16%, var(--background-secondary));
  border: 1px solid color-mix(in srgb, var(--interactive-accent) 35%, var(--background-modifier-border));
  color: var(--text-normal);
  font-size: 12px;
  margin-left: auto;
}
.pm-timer-bar .pm-timer-elapsed {
  color: var(--interactive-accent);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.pm-timer-bar .pm-timer-task {
  max-width: 22ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
}
.pm-timer-bar .pm-btn { padding: 2px 9px; font-size: 11.5px; }

/* Paused: colours go neutral and the dot stops pulsing, so a glance is enough */
.pm-timer-bar.paused {
  background: var(--background-secondary);
  border-color: var(--background-modifier-border);
}
.pm-timer-bar.paused .pm-timer-elapsed { color: var(--text-muted); }
.pm-timer-bar.paused .pm-timer-dot,
.pm-card-timer.paused .pm-timer-dot {
  animation: none;
  background: var(--text-faint);
}
.pm-card-timer.paused { color: var(--text-muted); }
.pm-timer-badge {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  padding: 0 4px;
}
.pm-elapsed-display.paused { color: var(--text-muted); }

.pm-confirm .pm-confirm-body {
  margin: 0 0 16px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.55;
}
.pm-confirm .pm-modal-btns { justify-content: flex-end; }

/* An archived item — still on the board, only its file lives elsewhere */
.pm-archived-badge {
  font-size: 10px;
  line-height: 1;
  opacity: 0.55;
  flex-shrink: 0;
  cursor: default;
}

/* Columns match the board height and scroll themselves. This used to be
   align-items: flex-start, so every column grew to fit its contents: one done
   column with 20 cards made the whole page tall and buried the other columns. */
.pm-kanban-board {
  display: flex;
  gap: 14px;
  padding: 16px;
  overflow-x: auto;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}

.pm-kanban-col {
  min-width: 240px;
  max-width: 280px;
  flex: 0 0 260px;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 100%;
}

.pm-col-strip {
  height: 3px;
  background: var(--pm-status-color, var(--background-modifier-border));
  flex-shrink: 0;
}

.pm-col-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
}
.pm-col-title {
  font-weight: 700;
  font-size: 12px;
  color: var(--text-normal);
  /* Statuses are written lowercase on purpose — show them that way */
  text-transform: none;
  display: flex;
  align-items: center;
  gap: 7px;
}
.pm-col-title::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--pm-status-color, var(--text-faint));
  flex-shrink: 0;
}
.pm-col-count {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  color: var(--text-muted);
  font-size: 10.5px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}

.pm-col-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 50px;
  padding: 2px 8px 10px;
  transition: background 0.15s;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  scrollbar-width: thin;
}
/* A column scrollbar only shows on hover — five permanent bars is noise */
.pm-col-cards::-webkit-scrollbar { width: 8px; }
.pm-col-cards::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 4px;
}
.pm-kanban-col:hover .pm-col-cards::-webkit-scrollbar-thumb {
  background: var(--background-modifier-border);
}

.pm-col-more {
  margin: 2px 2px 0;
  padding: 5px 8px;
  font-size: 11.5px;
  color: var(--text-muted);
  background: transparent;
  border: 1px dashed var(--background-modifier-border);
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
}
.pm-col-more:hover {
  color: var(--text-normal);
  border-style: solid;
  background: var(--background-modifier-hover);
}
.pm-col-cards.pm-drag-over {
  background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
  outline: 2px dashed var(--interactive-accent);
  border-radius: 6px;
}
.pm-col-empty {
  margin: 2px 4px 8px;
  padding: 16px 8px;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-faint);
  border: 1.5px dashed var(--background-modifier-border);
  border-radius: 8px;
}

.pm-overdue-card {
  border-color: color-mix(in srgb, var(--color-red) 55%, var(--background-modifier-border));
}
.pm-project-card-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.pm-project-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-normal);
  line-height: 1.3;
  flex: 1;
  min-width: 0;
}
.pm-project-chip {
  background: color-mix(in srgb, var(--pm-status-color, var(--text-faint)) 16%, transparent);
  color: var(--pm-status-color, var(--text-muted));
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  text-transform: none;
  flex-shrink: 0;
}
.pm-project-meta {
  display: grid;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
}
.pm-project-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.pm-project-actions .pm-btn {
  flex: 1 1 auto;
}

.pm-task-card {
  position: relative;
  background: var(--background-primary);
  border-radius: 8px;
  padding: 10px 11px 9px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.08);
  cursor: pointer;
  border: 1px solid var(--background-modifier-border);
  transition: box-shadow 0.12s ease, transform 0.12s ease, background 0.12s ease;
  user-select: none;
}
.pm-task-card:hover {
  box-shadow: 0 6px 16px rgba(0,0,0,0.2);
  transform: translateY(-2px);
  background: var(--background-modifier-hover);
}
.pm-kanban-board .pm-task-card.pm-task-inactive {
  opacity: 0.5;
}
.pm-kanban-board .pm-task-card.pm-task-inactive:hover {
  opacity: 0.7;
}
.pm-kanban-board .pm-task-card.pm-task-active {
  border-color: color-mix(in srgb, var(--interactive-accent) 55%, var(--background-modifier-border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 30%, transparent), 0 1px 2px rgba(0,0,0,0.14);
}
.pm-kanban-board .pm-task-card.pm-task-active::before {
  content: "";
  position: absolute;
  inset-inline-start: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 3px;
  background: var(--interactive-accent);
}
.pm-task-card.pm-dragging {
  opacity: 0.5;
  transform: rotate(2deg);
}
.pm-card-muted {
  opacity: 0.55;
}
.pm-card-muted:hover {
  opacity: 0.85;
}

/* Full text pill — still used on Project Dashboard cards */
.pm-priority-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 9px;
  border-radius: 999px;
  margin-bottom: 5px;
  letter-spacing: 0.02em;
}
/* Priority is an ordered intensity scale, so it takes colour from the status
   palette (good→critical) rather than categorical slots, always with a label. */
.pm-priority-low { background: color-mix(in srgb, var(--pm-status-good) 18%, transparent); color: var(--pm-status-good); }
.pm-priority-medium { background: color-mix(in srgb, var(--pm-status-warning) 20%, transparent); color: var(--text-normal); }
.pm-priority-high { background: color-mix(in srgb, var(--pm-status-serious) 20%, transparent); color: var(--text-normal); }
.pm-priority-critical { background: color-mix(in srgb, var(--pm-status-critical) 18%, transparent); color: var(--pm-status-critical); }

/* Small priority dot — used on Kanban task cards */
.pm-pr-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 4px;
  flex-shrink: 0;
  background: var(--pm-priority-color, var(--text-faint));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--pm-priority-color, var(--text-faint)) 22%, transparent);
}

.pm-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.pm-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-normal);
  line-height: 1.4;
  /* The title takes the space so the note marker and priority dot sit right */
  flex: 1;
  min-width: 0;
}
/* The "this note has notes" marker — always beside the title so a column can be
   scanned at a glance. Its tooltip shows the first few lines of the note. */
.pm-note-badge {
  font-size: 11px;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 2px;
  opacity: 0.7;
  cursor: help;
}
.pm-note-badge:hover { opacity: 1; }

.pm-card-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  font-size: 11px;
  color: var(--text-muted);
}
.pm-meta-dot::before { content: "\\00b7"; margin: 0 5px; color: var(--text-faint); }
.pm-overdue { color: var(--color-red); font-weight: 700; }
.pm-card-hours {
  font-variant-numeric: tabular-nums;
  color: var(--text-faint);
  margin-inline-start: auto;
}
.pm-card-timer {
  margin-top: 7px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--interactive-accent);
  display: flex;
  align-items: center;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}
.pm-timer-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--interactive-accent);
  flex-shrink: 0;
  animation: pm-pulse 1.8s ease-out infinite;
}
@keyframes pm-pulse {
  0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--interactive-accent) 55%, transparent); }
  70%  { box-shadow: 0 0 0 6px color-mix(in srgb, var(--interactive-accent) 0%, transparent); }
  100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--interactive-accent) 0%, transparent); }
}
@media (prefers-reduced-motion: reduce) {
  .pm-timer-dot { animation: none; }
  .pm-task-card { transition: none; }
}

/* Modal styles */
.pm-modal h2 {
  margin: 0 0 14px;
  padding-bottom: 12px;
  font-size: 18px;
  font-weight: 700;
  border-bottom: 1px solid var(--background-modifier-border);
}
.pm-modal .setting-item { border-top: 1px solid var(--background-modifier-border); }
.pm-modal h3 { margin: 20px 0 8px; font-size: 15px; font-weight: 600; }
.pm-modal h4 { margin: 14px 0 6px; font-size: 13px; color: var(--text-muted); font-weight: 600; }

.pm-time-stats {
  display: flex;
  gap: 20px;
  padding: 10px 0;
  font-size: 13px;
  color: var(--text-muted);
}
.pm-timer-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
}
.pm-elapsed-display {
  font-size: 24px;
  font-weight: 700;
  color: #7ecfa0;
  font-variant-numeric: tabular-nums;
  min-width: 90px;
}
.pm-manual-entry { padding: 8px 0; }
.pm-modal-btns {
  display: flex;
  gap: 8px;
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid var(--background-modifier-border);
  justify-content: flex-end;
}

/* Workspace settings style */
.pm-workspace-setting {
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
` + DASHBOARD_STYLES;
  }
}
