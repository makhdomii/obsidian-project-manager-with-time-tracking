export interface Workspace {
  id: string;
  name: string;
  rootFolder: string;
  projectsFolder: string;
  tasksFolder: string;
  timeEntriesFolder: string;
  /**
   * ریشه‌ی بایگانی. تسک/پروژه‌ای که وضعیتش بسته می‌شه با تایم‌انتری‌هاش به
   * زیرپوشه‌های Tasks/Projects/TimeEntries همین‌جا منتقل می‌شه. خالی یعنی
   * بایگانی خاموش. (workspaceهای قدیمی این کلید رو ندارن — موقع لود پر می‌شه.)
   */
  archiveFolder: string;
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
      archiveFolder: "ProjectManager/Archive",
    },
  ],
  defaultWorkspaceId: "default",
  dateFormat: "YYYY-MM-DD",
  statuses: ["todo", "active", "done", "cancel", "quite"],
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

/**
 * تایمر فعال. همه‌چیزش سریالایزبله (تاریخ‌ها ISO string‌ان، نه Date) چون عیناً
 * توی data.json ذخیره می‌شه تا اگه اوبسیدین کرش کرد یا بسته شد، تایمر از همون
 * جایی که بود برگرده.
 *
 * مدت‌زمان از روی تایم‌استمپ‌ها حساب می‌شه نه از روی یه شمارنده‌ی در حافظه،
 * برای همین لازم نیست هر ثانیه روی دیسک بنویسیم — فقط موقع تغییرِ وضعیت.
 */
export interface ActiveTimer {
  taskPath: string;
  taskTitle: string;
  workspaceId: string;
  /** ISO — لحظه‌ی اولین start؛ همین به‌عنوان start_time توی time entry می‌شینه */
  startedAt: string;
  /** ISO — شروع سگمنتِ در حال اجرا. null یعنی الان پاز است. */
  segmentStart: string | null;
  /** میلی‌ثانیه‌ی جمع‌شده از سگمنت‌های تمام‌شده (قبل از پازهای قبلی) */
  accumulatedMs: number;
}
