import { App, TFile, normalizePath } from "obsidian";
import { Workspace, TaskFrontmatter } from "../types";
import { slugify } from "../utils/FrontmatterUtils";
import { todayString } from "../utils/DateUtils";

export class TaskManager {
  constructor(private app: App) {}

  async createTask(
    ws: Workspace,
    title: string,
    projectSlug: string,
    status: string,
    priority: string,
    due: string
  ): Promise<TFile> {
    const slug = slugify(title);
    const path = normalizePath(`${ws.tasksFolder}/${slug}.md`);

    const frontmatter = `---
type: task
title: "${title}"
project: "[[${projectSlug}]]"
status: "${status}"
priority: "${priority}"
start: ""
end: ""
created: "${todayString()}"
due: "${due}"
total_hours: 0
days_count: 0
workspace: "${ws.id}"
---

# ${title}

## Time Log

| Date | Hours | Start | End |
|------|-------|-------|-----|

`;

    const file = await this.app.vault.create(path, frontmatter);
    return file;
  }

  async getTasks(ws: Workspace): Promise<TFile[]> {
    const files = this.app.vault.getMarkdownFiles();
    const result: TFile[] = [];
    for (const file of files) {
      if (!file.path.startsWith(ws.tasksFolder)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.frontmatter?.type === "task" && cache?.frontmatter?.workspace === ws.id) {
        result.push(file);
      }
    }
    return result;
  }

  async updateTaskHours(app: App, file: TFile, newHours: number, startTime: Date, endTime: Date): Promise<void> {
    const cache = app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter ?? {};
    const currentHours = Number(fm.total_hours ?? 0);
    const updatedHours = Math.round((currentHours + newHours) * 100) / 100;

    // Parse existing days
    const existingDays = new Set<string>();
    const dateStr = todayString();
    const startStr = startTime.toISOString();
    const endStr = endTime.toISOString();

    await app.fileManager.processFrontMatter(file, (fmatter) => {
      fmatter.total_hours = updatedHours;
    });

    // Append row to time log table in content
    await app.vault.process(file, (content) => {
      const row = `| ${dateStr} | ${newHours} | ${startStr} | ${endStr} |`;
      if (content.includes("| Date | Hours | Start | End |")) {
        return content + row + "\n";
      }
      return content + `\n## Time Log\n\n| Date | Hours | Start | End |\n|------|-------|-------|-----|\n${row}\n`;
    });

    // Recount days
    await this.recalculateDaysCount(app, file);
  }

  async recalculateDaysCount(app: App, file: TFile): Promise<void> {
    const content = await app.vault.read(file);
    const lines = content.split("\n");
    const days = new Set<string>();
    let inTable = false;
    for (const line of lines) {
      if (line.startsWith("| Date")) { inTable = true; continue; }
      if (inTable && line.startsWith("|---")) continue;
      if (inTable && line.startsWith("|")) {
        const parts = line.split("|").map((s) => s.trim()).filter(Boolean);
        if (parts[0] && parts[0].match(/^\d{4}-\d{2}-\d{2}$/)) {
          days.add(parts[0]);
        }
      } else if (inTable) {
        inTable = false;
      }
    }
    await app.fileManager.processFrontMatter(file, (fm) => {
      fm.days_count = days.size;
    });
  }
}
