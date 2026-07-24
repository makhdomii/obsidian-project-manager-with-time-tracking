import { App, TFile, normalizePath } from "obsidian";
import { ActiveTimer, Workspace } from "../types";
import { toISOFileStamp, todayString, diffHours } from "../utils/DateUtils";
import { TaskManager } from "./TaskManager";

export class TimeTracker {
  private activeTimer: ActiveTimer | null = null;
  private tickInterval: number | null = null;
  private onTick: ((elapsed: string) => void) | null = null;

  constructor(private app: App, private taskManager: TaskManager) {}

  startTimer(taskPath: string, taskTitle: string, workspaceId: string): void {
    if (this.activeTimer) {
      throw new Error(`Timer already running for: ${this.activeTimer.taskTitle}`);
    }
    this.activeTimer = {
      taskPath,
      taskTitle,
      startTime: new Date(),
      workspaceId,
    };
  }

  async stopTimer(ws: Workspace): Promise<number> {
    if (!this.activeTimer) throw new Error("No active timer");

    const end = new Date();
    const hours = diffHours(this.activeTimer.startTime, end);
    const taskFile = this.app.vault.getAbstractFileByPath(
      normalizePath(this.activeTimer.taskPath)
    ) as TFile | null;

    if (taskFile) {
      await this.taskManager.updateTaskHours(
        this.app,
        taskFile,
        hours,
        this.activeTimer.startTime,
        end
      );
      await this.writeTimeEntry(ws, taskFile, hours, this.activeTimer.startTime, end);
    }

    this.activeTimer = null;
    return hours;
  }

  async addManualEntry(
    ws: Workspace,
    taskFile: TFile,
    hours: number,
    date: string
  ): Promise<void> {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start.getTime() + hours * 3600000);
    await this.taskManager.updateTaskHours(this.app, taskFile, hours, start, end);
    await this.writeTimeEntry(ws, taskFile, hours, start, end);
  }

  private async writeTimeEntry(
    ws: Workspace,
    taskFile: TFile,
    hours: number,
    startTime: Date,
    endTime: Date
  ): Promise<void> {
    const stamp = toISOFileStamp(endTime);
    const taskSlug = taskFile.basename;
    let path = normalizePath(`${ws.timeEntriesFolder}/time_entry_${taskSlug}_${stamp}.md`);
    
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`${ws.timeEntriesFolder}/time_entry_${taskSlug}_${stamp}_${counter}.md`);
      counter++;
    }

    const content = `---
time_entry: "${toISOFileStamp(endTime)}"
task: "[[${taskSlug}]]"
hours: ${hours}
start_time: "${startTime.toISOString()}"
end_time: "${endTime.toISOString()}"
created: "${todayString()}"
---
`;
    await this.app.vault.create(path, content);
  }

  getActiveTimer(): ActiveTimer | null {
    return this.activeTimer;
  }

  getElapsed(): string {
    if (!this.activeTimer) return "0:00:00";
    const ms = Date.now() - this.activeTimer.startTime.getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  isRunning(): boolean {
    return this.activeTimer !== null;
  }

  getActiveTaskPath(): string | null {
    return this.activeTimer?.taskPath ?? null;
  }
}
