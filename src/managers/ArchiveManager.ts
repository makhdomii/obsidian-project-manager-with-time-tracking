import { App, TFile, normalizePath } from "obsidian";
import { Workspace } from "../types";
import { normalizeStatus } from "../utils/StatusColors";
import { WorkspaceManager } from "./WorkspaceManager";
import {
  archiveEnabled, archiveProjectsFolder, archiveTasksFolder, archiveTimeEntriesFolder,
  isArchivedPath, projectFolders, taskFolders, timeEntryFolders,
} from "../utils/WorkspacePaths";

/** وضعیت‌های بسته — این‌ها می‌رن بایگانی */
const CLOSED = new Set(["done", "cancel", "quite"]);

export function isArchivableStatus(status: unknown): boolean {
  return CLOSED.has(normalizeStatus(status));
}

export interface ArchiveResult {
  moved: number;
  restored: number;
}

export class ArchiveManager {
  constructor(private app: App, private workspaceManager: WorkspaceManager) {}

  // ── همگام‌سازی یک تسک ─────────────────────────────────────────────────

  /**
   * تسک رو بر اساس وضعیتش سر جای درست می‌بره و تایم‌انتری‌هاش رو هم با خودش
   * می‌بره. برگردوندن هم همینه: وضعیت که به todo/active برگرده، فایل برمی‌گرده.
   */
  async syncTask(ws: Workspace, file: TFile): Promise<ArchiveResult> {
    if (!archiveEnabled(ws)) return { moved: 0, restored: 0 };

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.type !== "task") return { moved: 0, restored: 0 };

    const shouldArchive = isArchivableStatus(fm.status);
    const isArchived = isArchivedPath(ws, file.path);
    if (shouldArchive === isArchived) return { moved: 0, restored: 0 };

    const slug = file.basename;
    const target = shouldArchive ? archiveTasksFolder(ws) : normalizePath(ws.tasksFolder);
    await this.moveFile(file, target);
    const entries = await this.moveTimeEntriesFor(ws, slug, shouldArchive);

    return shouldArchive
      ? { moved: 1 + entries, restored: 0 }
      : { moved: 0, restored: 1 + entries };
  }

  // ── همگام‌سازی یک پروژه (آبشاری) ──────────────────────────────────────

  /**
   * پروژه که بسته بشه، تسک‌هاش و تایم‌انتری‌هاشون هم می‌رن — تا لازم نباشه
   * دستی دنبالشون بگردی.
   *
   * موقع برگردوندن اما فقط تسک‌هایی برمی‌گردن که وضعیت خودشون باز باشه؛ تسکی
   * که مستقلاً done است توی بایگانی می‌مونه، چون بایگانی‌بودنش ربطی به پروژه
   * نداشته.
   */
  async syncProject(ws: Workspace, file: TFile): Promise<ArchiveResult> {
    if (!archiveEnabled(ws)) return { moved: 0, restored: 0 };

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.type !== "project") return { moved: 0, restored: 0 };

    const shouldArchive = isArchivableStatus(fm.status);
    const slug = file.basename;
    const result: ArchiveResult = { moved: 0, restored: 0 };

    // ۱) خودِ پروژه
    if (shouldArchive !== isArchivedPath(ws, file.path)) {
      const target = shouldArchive ? archiveProjectsFolder(ws) : normalizePath(ws.projectsFolder);
      await this.moveFile(file, target);
      if (shouldArchive) result.moved++;
      else result.restored++;
    }

    // ۲) تسک‌های همین پروژه
    for (const task of this.tasksOfProject(ws, slug)) {
      const taskFm = this.app.metadataCache.getFileCache(task)?.frontmatter;
      // برگردوندن فقط برای تسک‌های باز
      const taskShouldArchive = shouldArchive || isArchivableStatus(taskFm?.status);
      if (taskShouldArchive === isArchivedPath(ws, task.path)) continue;

      const target = taskShouldArchive ? archiveTasksFolder(ws) : normalizePath(ws.tasksFolder);
      const taskSlug = task.basename;
      await this.moveFile(task, target);
      const entries = await this.moveTimeEntriesFor(ws, taskSlug, taskShouldArchive);
      if (taskShouldArchive) result.moved += 1 + entries;
      else result.restored += 1 + entries;
    }

    return result;
  }

  // ── عملیات دسته‌ای ────────────────────────────────────────────────────

  /**
   * کل workspace رو مرتب می‌کنه: هرچی بسته‌ست می‌ره بایگانی، هرچی باز شده
   * برمی‌گرده. برای آیتم‌های موجود که قبل از روشن‌شدنِ بایگانی بسته شدن.
   */
  async syncWorkspace(ws: Workspace): Promise<ArchiveResult> {
    if (!archiveEnabled(ws)) return { moved: 0, restored: 0 };
    await this.ensureArchiveFolders(ws);

    const total: ArchiveResult = { moved: 0, restored: 0 };

    // اول پروژه‌ها (آبشارشون تسک‌ها رو هم جابه‌جا می‌کنه)
    for (const file of this.filesIn(projectFolders(ws), "project", ws)) {
      const r = await this.syncProject(ws, file);
      total.moved += r.moved;
      total.restored += r.restored;
    }

    // بعد تسک‌های باقی‌مانده (بدون پروژه یا پروژه‌ی باز)
    for (const file of this.filesIn(taskFolders(ws), "task", ws)) {
      const r = await this.syncTask(ws, file);
      total.moved += r.moved;
      total.restored += r.restored;
    }

    return total;
  }

  async ensureArchiveFolders(ws: Workspace): Promise<void> {
    if (!archiveEnabled(ws)) return;
    await this.workspaceManager.ensureFolder(ws.archiveFolder);
    await this.workspaceManager.ensureFolder(archiveTasksFolder(ws));
    await this.workspaceManager.ensureFolder(archiveProjectsFolder(ws));
    await this.workspaceManager.ensureFolder(archiveTimeEntriesFolder(ws));
  }

  // ── کمکی‌ها ───────────────────────────────────────────────────────────

  private filesIn(folders: string[], type: string, ws: Workspace): TFile[] {
    const out: TFile[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!folders.some((f) => file.path.startsWith(`${f}/`))) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm?.type !== type) continue;
      const wsName = String(fm.workspace ?? "").replace(/^\[\[|\]\]$/g, "").trim();
      if (wsName && wsName !== ws.name) continue;
      out.push(file);
    }
    return out;
  }

  private tasksOfProject(ws: Workspace, projectSlug: string): TFile[] {
    return this.filesIn(taskFolders(ws), "task", ws).filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      const link = String(fm?.project ?? "").replace(/^\[\[|\]\]$/g, "").trim();
      return link === projectSlug;
    });
  }

  /** تایم‌انتری‌های یک تسک رو به بایگانی می‌بره یا برمی‌گردونه */
  private async moveTimeEntriesFor(
    ws: Workspace,
    taskSlug: string,
    toArchive: boolean
  ): Promise<number> {
    const target = toArchive
      ? archiveTimeEntriesFolder(ws)
      : normalizePath(ws.timeEntriesFolder);
    const folders = timeEntryFolders(ws);
    let count = 0;

    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!folders.some((f) => file.path.startsWith(`${f}/`))) continue;
      if (isArchivedPath(ws, file.path) === toArchive) continue;

      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const link = String(fm?.task ?? "").replace(/^\[\[|\]\]$/g, "").trim();
      if (link !== taskSlug) continue;

      await this.moveFile(file, target);
      count++;
    }
    return count;
  }

  /**
   * جابه‌جایی با fileManager.renameFile انجام می‌شه نه vault.rename، چون
   * لینک‌های [[...]] توی بقیه‌ی نوت‌ها رو هم به‌روز می‌کنه.
   */
  private async moveFile(file: TFile, targetFolder: string): Promise<void> {
    await this.workspaceManager.ensureFolder(targetFolder);
    let path = normalizePath(`${targetFolder}/${file.name}`);
    if (path === file.path) return;

    let n = 1;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`${targetFolder}/${file.basename} ${n}.${file.extension}`);
      n++;
    }
    await this.app.fileManager.renameFile(file, path);
  }
}
