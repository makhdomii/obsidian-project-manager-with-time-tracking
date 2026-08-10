// ╔══════════════════════════════════════════════════════════════════════╗
// ║  AnalyticsManager — همه‌ی داده‌ی خامِ داشبورد از این‌جا میاد            ║
// ║  منبع اصلیِ زمان‌ها پوشه‌ی TimeEntries ـه؛ ردیف‌های جدول «Time Log»    ║
// ║  داخل خود تسک‌ها هم خونده می‌شن (برای تسک‌های قدیمی) و با کلید         ║
// ║  task|start|end دیدوپلیکیت می‌شن تا هیچ ساعتی دوبار حساب نشه.         ║
// ╚══════════════════════════════════════════════════════════════════════╝

import { App, TFile } from "obsidian";
import { Workspace } from "../types";
import { toISODate, todayISO, addDays, daysBetween } from "../utils/Jalali";
import { normalizeStatus } from "../utils/StatusColors";

export interface TimeRecord {
  iso: string;          // روزِ محلی که این زمان روش ثبت شده
  hours: number;
  taskSlug: string;
  taskTitle: string;
  taskPath: string;
  projectSlug: string;
  start: string;
  end: string;
}

export interface TaskInfo {
  file: TFile;
  slug: string;
  title: string;
  status: string;
  priority: string;
  projectSlug: string;
  due: string;
  created: string;
  totalHours: number;
  daysCount: number;
}

export interface ProjectInfo {
  file: TFile;
  slug: string;
  title: string;
  status: string;
  priority: string;
  due: string;
  created: string;
  taskCount: number;
  doneCount: number;
  hours: number;
}

export interface AnalyticsData {
  records: TimeRecord[];
  tasks: TaskInfo[];
  projects: ProjectInfo[];
  tasksBySlug: Map<string, TaskInfo>;
  projectsBySlug: Map<string, ProjectInfo>;
  /** iso → رکوردهای همون روز، مرتب‌شده بر اساس ساعت (نزولی) */
  byDay: Map<string, TimeRecord[]>;
  firstISO: string | null;
  lastISO: string | null;
}

const DONE_STATUSES = new Set(["done"]);
const CLOSED_STATUSES = new Set(["done", "cancel", "quite"]);

export function isDoneStatus(status: string): boolean { return DONE_STATUSES.has(status); }
export function isClosedStatus(status: string): boolean { return CLOSED_STATUSES.has(status); }

function unlink(value: unknown): string {
  return String(value ?? "").replace(/^\[\[|\]\]$/g, "").trim();
}

export class AnalyticsManager {
  // پارس جدول‌های Time Log گرون‌تره (لازمه فایل خونده بشه) — پس بر اساس mtime کش می‌شه
  private tableCache = new Map<string, { mtime: number; rows: TimeRecord[] }>();

  constructor(private app: App) {}

  async collect(ws: Workspace): Promise<AnalyticsData> {
    const tasks = this.collectTasks(ws);
    const tasksBySlug = new Map(tasks.map((t) => [t.slug, t]));
    const projects = this.collectProjects(ws, tasks);
    const projectsBySlug = new Map(projects.map((p) => [p.slug, p]));

    const records: TimeRecord[] = [];
    const seen = new Set<string>();

    for (const rec of this.collectTimeEntryFiles(ws, tasksBySlug)) {
      const key = `${rec.taskSlug}|${rec.start}|${rec.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      records.push(rec);
    }

    for (const task of tasks) {
      for (const rec of await this.collectTaskTableRows(task)) {
        const key = `${rec.taskSlug}|${rec.start}|${rec.end}`;
        if (seen.has(key)) continue;
        seen.add(key);
        records.push(rec);
      }
    }

    records.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));

    const byDay = new Map<string, TimeRecord[]>();
    for (const rec of records) {
      const list = byDay.get(rec.iso);
      if (list) list.push(rec);
      else byDay.set(rec.iso, [rec]);
    }
    for (const list of byDay.values()) list.sort((a, b) => b.hours - a.hours);

    return {
      records,
      tasks,
      projects,
      tasksBySlug,
      projectsBySlug,
      byDay,
      firstISO: records.length ? records[0].iso : null,
      lastISO: records.length ? records[records.length - 1].iso : null,
    };
  }

  // ── تسک‌ها و پروژه‌ها ────────────────────────────────────────────────
  private collectTasks(ws: Workspace): TaskInfo[] {
    const out: TaskInfo[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(`${ws.tasksFolder}/`)) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm?.type !== "task" || unlink(fm.workspace) !== ws.name) continue;
      out.push({
        file,
        slug: file.basename,
        title: String(fm.title ?? file.basename),
        status: normalizeStatus(fm.status ?? "todo"),
        priority: String(fm.priority ?? "medium"),
        projectSlug: unlink(fm.project),
        due: String(fm.due ?? ""),
        created: String(fm.created ?? ""),
        totalHours: Number(fm.total_hours ?? 0) || 0,
        daysCount: Number(fm.days_count ?? 0) || 0,
      });
    }
    return out;
  }

  private collectProjects(ws: Workspace, tasks: TaskInfo[]): ProjectInfo[] {
    const out: ProjectInfo[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(`${ws.projectsFolder}/`)) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm?.type !== "project" || unlink(fm.workspace) !== ws.name) continue;

      const slug = file.basename;
      const mine = tasks.filter((t) => t.projectSlug === slug);
      out.push({
        file,
        slug,
        title: String(fm.title ?? file.basename),
        status: normalizeStatus(fm.status ?? "todo"),
        priority: String(fm.priority ?? "medium"),
        due: String(fm.due ?? ""),
        created: String(fm.created ?? ""),
        taskCount: mine.length,
        doneCount: mine.filter((t) => isDoneStatus(t.status)).length,
        hours: Math.round(mine.reduce((s, t) => s + t.totalHours, 0) * 100) / 100,
      });
    }
    return out;
  }

  // ── منبع ۱: فایل‌های پوشه‌ی TimeEntries (فقط frontmatter، بدون خوندن فایل) ──
  private collectTimeEntryFiles(ws: Workspace, tasksBySlug: Map<string, TaskInfo>): TimeRecord[] {
    const out: TimeRecord[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(`${ws.timeEntriesFolder}/`)) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm || fm.hours === undefined) continue;

      const taskSlug = unlink(fm.task);
      const start = String(fm.start_time ?? "");
      const end = String(fm.end_time ?? "");
      const iso = this.resolveISO(start, String(fm.created ?? ""));
      if (!iso) continue;

      const task = tasksBySlug.get(taskSlug);
      out.push({
        iso,
        hours: Number(fm.hours ?? 0) || 0,
        taskSlug,
        taskTitle: task?.title ?? taskSlug,
        taskPath: task?.file.path ?? "",
        projectSlug: task?.projectSlug ?? "",
        start,
        end,
      });
    }
    return out;
  }

  // ── منبع ۲: جدول Time Log داخل خودِ تسک (پشتیبان تسک‌های قدیمی) ──────
  private async collectTaskTableRows(task: TaskInfo): Promise<TimeRecord[]> {
    const cached = this.tableCache.get(task.file.path);
    if (cached && cached.mtime === task.file.stat.mtime) return cached.rows;

    const rows: TimeRecord[] = [];
    let content: string;
    try {
      content = await this.app.vault.cachedRead(task.file);
    } catch {
      return rows;
    }

    for (const line of content.split("\n")) {
      if (!line.startsWith("|")) continue;
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.length < 2) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) continue;

      const hours = Number(cells[1]);
      if (!Number.isFinite(hours)) continue;
      const start = cells[2] ?? "";
      const end = cells[3] ?? "";
      // ستون Date موقع ثبت «امروز» نوشته می‌شه، پس تاریخ واقعی از start_time میاد
      const iso = this.resolveISO(start, cells[0]);
      if (!iso) continue;

      rows.push({
        iso,
        hours,
        taskSlug: task.slug,
        taskTitle: task.title,
        taskPath: task.file.path,
        projectSlug: task.projectSlug,
        start,
        end,
      });
    }

    this.tableCache.set(task.file.path, { mtime: task.file.stat.mtime, rows });
    return rows;
  }

  private resolveISO(startTime: string, fallback: string): string | null {
    if (startTime) {
      const d = new Date(startTime);
      if (!Number.isNaN(d.getTime())) return toISODate(d);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(fallback)) return fallback;
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  تجمیع‌هایی که ویو ازشون استفاده می‌کنه
// ══════════════════════════════════════════════════════════════════════

export function sumHours(records: TimeRecord[]): number {
  return Math.round(records.reduce((s, r) => s + r.hours, 0) * 100) / 100;
}

export function recordsInRange(records: TimeRecord[], fromISO: string, toISO: string): TimeRecord[] {
  return records.filter((r) => r.iso >= fromISO && r.iso <= toISO);
}

/** ساعت هر روزِ بازه — روزهای خالی هم با صفر میان (مخرجِ درست برای heatmap) */
export function hoursPerDay(records: TimeRecord[], days: string[]): Map<string, number> {
  const map = new Map<string, number>(days.map((d) => [d, 0]));
  for (const r of records) {
    if (map.has(r.iso)) map.set(r.iso, (map.get(r.iso) ?? 0) + r.hours);
  }
  for (const [k, v] of map) map.set(k, Math.round(v * 100) / 100);
  return map;
}

export function groupHoursBy<T>(
  records: TimeRecord[],
  key: (r: TimeRecord) => string,
  label: (slug: string) => string
): { slug: string; label: string; hours: number }[] {
  const map = new Map<string, number>();
  for (const r of records) {
    const k = key(r);
    map.set(k, (map.get(k) ?? 0) + r.hours);
  }
  return Array.from(map.entries())
    .map(([slug, hours]) => ({ slug, label: label(slug), hours: Math.round(hours * 100) / 100 }))
    .sort((a, b) => b.hours - a.hours);
}

/** روزهای پشت‌سرهمی که تا امروز (یا دیروز) کار ثبت شده */
export function currentStreak(byDay: Map<string, TimeRecord[]>): number {
  const today = todayISO();
  let cursor = hasWork(byDay, today) ? today : addDays(today, -1);
  let streak = 0;
  while (hasWork(byDay, cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(byDay: Map<string, TimeRecord[]>): number {
  const days = Array.from(byDay.keys())
    .filter((iso) => hasWork(byDay, iso))
    .sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const iso of days) {
    run = prev && daysBetween(prev, iso) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = iso;
  }
  return best;
}

function hasWork(byDay: Map<string, TimeRecord[]>, iso: string): boolean {
  const list = byDay.get(iso);
  return !!list && list.some((r) => r.hours > 0);
}
