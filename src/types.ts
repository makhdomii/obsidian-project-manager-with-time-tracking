export interface Workspace {
  id: string;
  name: string;
  rootFolder: string;
  projectsFolder: string;
  tasksFolder: string;
  timeEntriesFolder: string;
}

export interface ProjectManagerSettings {
  workspaces: Workspace[];
  defaultWorkspaceId: string;
  dateFormat: string;
  statuses: string[];
  priorities: string[];
}

export const DEFAULT_SETTINGS: ProjectManagerSettings = {
  workspaces: [
    {
      id: "default",
      name: "ProjectManager",
      rootFolder: "ProjectManager",
      projectsFolder: "ProjectManager/Projects",
      tasksFolder: "ProjectManager/Tasks",
      timeEntriesFolder: "ProjectManager/TimeEntries",
    },
  ],
  defaultWorkspaceId: "default",
  dateFormat: "YYYY-MM-DD",
  statuses: ["not started", "in progress", "done", "cancel", "quite"],
  priorities: ["low", "medium", "high", "critical"],
};

export interface ProjectFrontmatter {
  type: "project";
  title: string;
  status: string;
  priority: string;
  start: string;
  end: string;
  created: string;
  due: string;
  tags: string[];
  hours: number;
  task_count: number;
  workspace: string;
}

export interface TaskFrontmatter {
  type: "task";
  title: string;
  project: string;
  status: string;
  priority: string;
  start: string;
  end: string;
  created: string;
  due: string;
  total_hours: number;
  days_count: number;
  workspace: string;
}

export interface TimeEntry {
  time_entry: string;
  task: string;
  hours: number;
  start_time: string;
  end_time: string;
  created: string;
}

export interface ActiveTimer {
  taskPath: string;
  taskTitle: string;
  startTime: Date;
  workspaceId: string;
}
