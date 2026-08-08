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
import { NoteScanner } from "./utils/NoteContent";
import { DASHBOARD_STYLES } from "./styles/dashboardStyles";

export default class ProjectManagerPlugin extends Plugin {
  settings: ProjectManagerSettings;
  workspaceManager: WorkspaceManager;
  projectManager: ProjectManager;
  taskManager: TaskManager;
  timeTracker: TimeTracker;
  analytics: AnalyticsManager;
  noteScanner: NoteScanner;
  private styleEl: HTMLStyleElement | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.workspaceManager = new WorkspaceManager(this.app);
    this.projectManager = new ProjectManager(this.app);
    this.taskManager = new TaskManager(this.app);
    this.timeTracker = new TimeTracker(this.app, this.taskManager);
    this.analytics = new AnalyticsManager(this.app);
    this.noteScanner = new NoteScanner(this.app);

    // Ensure all workspace folders exist
    for (const ws of this.settings.workspaces) {
      await this.workspaceManager.ensureWorkspace(ws);
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
          this.refreshKanban();
        } catch (err: any) {
          new Notice(err.message);
        }
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
        this.refreshKanban();
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
    // تگ استایل باید با پلاگین بره، وگرنه لود بعدی روش می‌افته
    this.styleEl?.remove();
    this.styleEl = null;
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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

  refreshProjectDashboard(): void {
    const leaves = this.app.workspace.getLeavesOfType(PROJECT_DASHBOARD_VIEW_TYPE);
    for (const leaf of leaves) {
      (leaf.view as ProjectDashboardView).render();
    }
  }

  loadStyles(): void {
    const styleId = "pm-styles";
    // قبلاً اگه تگ استایل از قبل بود، همین‌جا return می‌کرد — یعنی بعد از هر
    // آپدیت یا reload پلاگین، استایلِ نسخه‌ی قبلی می‌موند و قواعد جدید هیچ‌وقت
    // اعمال نمی‌شد. حالا محتوا همیشه بازنویسی می‌شه.
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
.pm-timer-bar .pm-timer-elapsed { color: var(--interactive-accent); font-weight: 700; }

.pm-kanban-board {
  display: flex;
  gap: 14px;
  padding: 16px;
  overflow-x: auto;
  flex: 1;
  align-items: flex-start;
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
  text-transform: capitalize;
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
  text-transform: capitalize;
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
/* اولویت یک مقیاس شدت مرتبه، پس از پالت وضعیت (good→critical) رنگ می‌گیره،
   نه از اسلات‌های دسته‌ای — و همیشه با متنِ خوانا کنارش، نه رنگِ تنها. */
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
  /* عنوان فضا رو پر می‌کنه تا نشانگرِ یادداشت و نقطه‌ی اولویت بچسبن به راست */
  flex: 1;
  min-width: 0;
}
/* نشانگر «این نوت یادداشت داره» — همیشه کنار عنوان، تا اسکن ستون با یک نگاه
   ممکن باشه. تولتیپش چند خط اولِ یادداشت رو نشون می‌ده. */
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
