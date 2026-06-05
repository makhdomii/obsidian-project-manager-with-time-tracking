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

export default class ProjectManagerPlugin extends Plugin {
  settings: ProjectManagerSettings;
  workspaceManager: WorkspaceManager;
  projectManager: ProjectManager;
  taskManager: TaskManager;
  timeTracker: TimeTracker;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.workspaceManager = new WorkspaceManager(this.app);
    this.projectManager = new ProjectManager(this.app);
    this.taskManager = new TaskManager(this.app);
    this.timeTracker = new TimeTracker(this.app, this.taskManager);

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
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = this.getStyles();
    document.head.appendChild(style);
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
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 13px;
}

.pm-btn {
  padding: 5px 14px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: opacity 0.15s;
}
.pm-btn:hover { opacity: 0.85; }
.pm-btn-primary { background: var(--interactive-accent); color: var(--text-on-accent); }
.pm-btn-secondary { background: var(--background-modifier-hover); color: var(--text-normal); }
.pm-btn-danger { background: #e05252; color: #fff; }

.pm-timer-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: #1a3a2a;
  border-radius: 8px;
  color: #7ecfa0;
  font-size: 13px;
  margin-left: auto;
}

.pm-kanban-board {
  display: flex;
  gap: 16px;
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
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pm-col-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 8px;
  border-bottom: 1px solid var(--background-modifier-border);
}
.pm-col-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-muted);
  text-transform: capitalize;
}
.pm-col-count {
  background: var(--background-modifier-hover);
  color: var(--text-muted);
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 10px;
}

.pm-col-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 60px;
  border-radius: 6px;
  padding: 4px;
  transition: background 0.15s;
}
.pm-col-cards.pm-drag-over {
  background: var(--background-modifier-hover);
  outline: 2px dashed var(--interactive-accent);
}

.pm-dashboard-content {
  padding: 16px;
}
.pm-dashboard-empty {
  padding: 20px;
  color: var(--text-muted);
  font-size: 14px;
}
.pm-project-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
}
.pm-project-card {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}
.pm-project-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
}
.pm-overdue-card {
  border-color: #e05252;
}
.pm-project-card-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.pm-project-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-normal);
  line-height: 1.2;
}
.pm-project-chip {
  background: var(--background-modifier-hover);
  color: var(--text-muted);
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  text-transform: capitalize;
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
  background: var(--background-primary);
  border-radius: 8px;
  padding: 10px 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  cursor: pointer;
  border: 1px solid var(--background-modifier-border);
  transition: box-shadow 0.15s, transform 0.1s;
  user-select: none;
}
.pm-task-card:hover {
  box-shadow: 0 3px 8px rgba(0,0,0,0.18);
  transform: translateY(-1px);
}
.pm-task-card.pm-dragging {
  opacity: 0.5;
  transform: rotate(2deg);
}

.pm-priority-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 10px;
  margin-bottom: 5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pm-priority-low { background: #2d4a2d; color: #7ecfa0; }
.pm-priority-medium { background: #3a3a00; color: #d4c44a; }
.pm-priority-high { background: #4a2000; color: #e09050; }
.pm-priority-critical { background: #4a0000; color: #e05252; }

.pm-card-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-normal);
  margin-bottom: 5px;
  line-height: 1.35;
}
.pm-card-project {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 3px;
}
.pm-card-due {
  font-size: 12px;
  margin-bottom: 3px;
}
.pm-due-ok { color: var(--text-muted); }
.pm-overdue { color: #e05252; font-weight: 600; }
.pm-card-hours {
  font-size: 12px;
  color: var(--text-faint);
}
.pm-card-timer {
  margin-top: 6px;
  font-size: 12px;
  color: #7ecfa0;
  display: flex;
  align-items: center;
}
.pm-timer-dot {
  animation: pm-blink 1s step-start infinite;
}
@keyframes pm-blink {
  50% { opacity: 0; }
}

/* Modal styles */
.pm-modal .setting-item { border-top: 1px solid var(--background-modifier-border); }
.pm-modal h3 { margin: 18px 0 8px; font-size: 15px; }
.pm-modal h4 { margin: 12px 0 6px; font-size: 13px; color: var(--text-muted); }

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
  margin-top: 20px;
  justify-content: flex-end;
}

/* Workspace settings style */
.pm-workspace-setting {
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
`;
  }
}
