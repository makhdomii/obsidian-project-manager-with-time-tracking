import { normalizePath } from "obsidian";
import { Workspace } from "../types";

/**
 * مسیرهای یک workspace در دو نسخه وجود دارن: فعال و بایگانی‌شده. هر جایی که
 * فایل‌ها رو جمع می‌کنیم باید *هر دو* رو ببینه، وگرنه به محضِ بایگانی‌شدنِ یه
 * تسک، ساعت‌هاش از گزارش‌ها و تقویم غیب می‌شن.
 */

export function archiveEnabled(ws: Workspace): boolean {
  return !!ws.archiveFolder && ws.archiveFolder.trim().length > 0;
}

export function archiveTasksFolder(ws: Workspace): string {
  return normalizePath(`${ws.archiveFolder}/Tasks`);
}

export function archiveProjectsFolder(ws: Workspace): string {
  return normalizePath(`${ws.archiveFolder}/Projects`);
}

export function archiveTimeEntriesFolder(ws: Workspace): string {
  return normalizePath(`${ws.archiveFolder}/TimeEntries`);
}

/** پوشه‌های تسک: [فعال, بایگانی] — یا فقط فعال اگه بایگانی خاموشه */
export function taskFolders(ws: Workspace): string[] {
  return archiveEnabled(ws)
    ? [normalizePath(ws.tasksFolder), archiveTasksFolder(ws)]
    : [normalizePath(ws.tasksFolder)];
}

export function projectFolders(ws: Workspace): string[] {
  return archiveEnabled(ws)
    ? [normalizePath(ws.projectsFolder), archiveProjectsFolder(ws)]
    : [normalizePath(ws.projectsFolder)];
}

export function timeEntryFolders(ws: Workspace): string[] {
  return archiveEnabled(ws)
    ? [normalizePath(ws.timeEntriesFolder), archiveTimeEntriesFolder(ws)]
    : [normalizePath(ws.timeEntriesFolder)];
}

/** آیا این مسیر زیر یکی از این پوشه‌هاست؟ */
export function isUnderAnyFolder(path: string, folders: string[]): boolean {
  return folders.some((f) => f && path.startsWith(`${f}/`));
}

export function isArchivedPath(ws: Workspace, path: string): boolean {
  if (!archiveEnabled(ws)) return false;
  return path.startsWith(`${normalizePath(ws.archiveFolder)}/`);
}

/** مسیر پیش‌فرضِ بایگانی برای workspaceهایی که هنوز تنظیمش نکردن */
export function defaultArchiveFolder(rootFolder: string): string {
  return `${rootFolder}/Archive`;
}
