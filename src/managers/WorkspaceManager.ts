import { App, TFolder, normalizePath } from "obsidian";
import { Workspace } from "../types";

export class WorkspaceManager {
  constructor(private app: App) {}

  async ensureWorkspace(ws: Workspace): Promise<void> {
    await this.ensureFolder(ws.rootFolder);
    await this.ensureFolder(ws.projectsFolder);
    await this.ensureFolder(ws.tasksFolder);
    await this.ensureFolder(ws.timeEntriesFolder);
  }

  async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!this.app.vault.getAbstractFileByPath(normalized)) {
      await this.app.vault.createFolder(normalized);
    }
  }

  getWorkspaceById(workspaces: Workspace[], id: string): Workspace | undefined {
    return workspaces.find((ws) => ws.id === id);
  }
}
