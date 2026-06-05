import { App, TFile, normalizePath } from "obsidian";
import { Workspace, ProjectFrontmatter } from "../types";
import { slugify } from "../utils/FrontmatterUtils";
import { todayString } from "../utils/DateUtils";

export class ProjectManager {
  constructor(private app: App) {}

  async createProject(
    ws: Workspace,
    title: string,
    status: string,
    priority: string,
    due: string
  ): Promise<TFile> {
    const slug = slugify(title);
    const path = normalizePath(`${ws.projectsFolder}/${slug}.md`);

    const frontmatter = `---
type: project
title: "${title}"
status: "${status}"
priority: "${priority}"
start: ""
end: ""
created: "${todayString()}"
due: "${due}"
tags: [project]
hours: 0
task_count: 0
workspace: "[[${ws.name}]]"
---

# ${title}

`;

    const file = await this.app.vault.create(path, frontmatter);
    return file;
  }

  async getProjects(ws: Workspace): Promise<TFile[]> {
    const files = this.app.vault.getMarkdownFiles();
    const result: TFile[] = [];
    for (const file of files) {
      if (!file.path.startsWith(ws.projectsFolder)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.frontmatter?.type === "project" && cache?.frontmatter?.workspace === `[[${ws.name}]]`) {
        result.push(file);
      }
    }
    return result;
  }

  async updateProjectStats(app: App, ws: Workspace, projectSlug: string): Promise<void> {
    const projectPath = normalizePath(`${ws.projectsFolder}/${projectSlug}.md`);
    const projectFile = app.vault.getAbstractFileByPath(projectPath) as TFile | null;
    if (!projectFile) return;

    const tasks = app.vault.getMarkdownFiles().filter((f) => {
      if (!f.path.startsWith(ws.tasksFolder)) return false;
      const cache = app.metadataCache.getFileCache(f);
      const fm = cache?.frontmatter;
      return fm?.type === "task" && fm?.project === `[[${projectSlug}]]`;
    });

    let totalHours = 0;
    for (const t of tasks) {
      const fm = app.metadataCache.getFileCache(t)?.frontmatter;
      totalHours += Number(fm?.total_hours ?? 0);
    }

    await app.fileManager.processFrontMatter(projectFile, (fm) => {
      fm.task_count = tasks.length;
      fm.hours = Math.round(totalHours * 100) / 100;
    });
  }
}
