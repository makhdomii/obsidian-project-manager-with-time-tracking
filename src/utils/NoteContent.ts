// ╔══════════════════════════════════════════════════════════════════════╗
// ║  NoteContent — «این نوت چیزی جز تمپلیت داره؟»                         ║
// ║  تمپلیتِ تسک/پروژه فقط اینه: frontmatter، یک H1 با عنوان، و (برای     ║
// ║  تسک) سرتیتر «Time Log» با جدولش. هر چیز دیگه‌ای یادداشتِ خودِ کاربره. ║
// ╚══════════════════════════════════════════════════════════════════════╝

import { App, TFile } from "obsidian";

export interface NoteInfo {
  hasNotes: boolean;
  /** چند خط اولِ یادداشت — توی تولتیپ نشون داده می‌شه تا لازم نباشه نوت باز بشه */
  excerpt: string;
}

const NO_NOTES: NoteInfo = { hasNotes: false, excerpt: "" };
const EXCERPT_LINES = 3;
const EXCERPT_CHARS = 160;

export function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/);
  return match ? content.slice(match[0].length) : content;
}

export function readBodyNotes(content: string): NoteInfo {
  const found: string[] = [];
  let seenTitle = false;
  let inTimeLog = false;

  for (const raw of stripFrontmatter(content).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) continue; // خط جداکننده، محتوا حساب نمی‌شه

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const text = heading[2].trim();
      // سرتیتر Time Log و جدولِ زیرش بخشی از تمپلیتن
      if (/^time log$/i.test(text)) { inTimeLog = true; continue; }
      // اولین H1 عنوانِ خودِ نوته. عمداً به «اولین خط» گره نخورده، چون بعضی
      // نوت‌ها یادداشت رو بالای عنوان می‌نویسن.
      if (!seenTitle && heading[1].length === 1) { seenTitle = true; inTimeLog = false; continue; }
      found.push(text);
      if (found.length >= EXCERPT_LINES) break;
      continue;
    }

    if (inTimeLog && line.startsWith("|")) continue;

    found.push(line);
    if (found.length >= EXCERPT_LINES) break;
  }

  if (!found.length) return NO_NOTES;

  let excerpt = found.join(" · ").replace(/\s+/g, " ").trim();
  if (excerpt.length > EXCERPT_CHARS) excerpt = `${excerpt.slice(0, EXCERPT_CHARS - 1).trimEnd()}…`;
  return { hasNotes: true, excerpt };
}

/** خوندن فایل گرونه، پس نتیجه بر اساس mtime کش می‌شه */
export class NoteScanner {
  private cache = new Map<string, { mtime: number; info: NoteInfo }>();

  constructor(private app: App) {}

  async info(file: TFile): Promise<NoteInfo> {
    const hit = this.cache.get(file.path);
    if (hit && hit.mtime === file.stat.mtime) return hit.info;

    let info = NO_NOTES;
    try {
      info = readBodyNotes(await this.app.vault.cachedRead(file));
    } catch {
      // فایل پاک/قفل شده — نبودِ نشانگر بهتر از ترکیدنِ رندره
    }
    this.cache.set(file.path, { mtime: file.stat.mtime, info });
    return info;
  }

  /** فقط فایل‌هایی که یادداشت دارن برمی‌گردن */
  async scan(files: TFile[]): Promise<Map<string, NoteInfo>> {
    const out = new Map<string, NoteInfo>();
    for (const file of files) {
      const info = await this.info(file);
      if (info.hasNotes) out.set(file.path, info);
    }
    return out;
  }
}

/** نشانگر روی کارت — یک جای ثابت، تا اسکنِ ستون با یک نگاه ممکن باشه */
export function renderNoteBadge(parent: HTMLElement, info: NoteInfo): HTMLElement {
  const badge = parent.createSpan({ cls: "pm-note-badge", text: "📝" });
  badge.setAttribute("title", info.excerpt);
  badge.setAttribute("aria-label", `Has notes: ${info.excerpt}`);
  return badge;
}
