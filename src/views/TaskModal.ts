import { App, Modal, TFile, TFolder, Notice, Setting } from "obsidian";
import ProjectManagerPlugin from "../main";
import { Workspace } from "../types";
import { updateFrontmatterFields } from "../utils/FrontmatterUtils";
import { todayString } from "../utils/DateUtils";

export class TaskModal extends Modal {
  plugin: ProjectManagerPlugin;
  file: TFile | null;
  ws: Workspace;
  isNew: boolean;
  timerInterval: number | null = null;

  // Form fields
  title = "";
  projectSlug = "";
  status = "not started";
  priority = "medium";
  due = "";
  manualHours = "";
  manualDate = "";

  constructor(
    app: App,
    plugin: ProjectManagerPlugin,
    ws: Workspace,
    file: TFile | null = null
  ) {
    super(app);
    this.plugin = plugin;
    this.ws = ws;
    this.file = file;
    this.isNew = file === null;

    if (file) {
      const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      this.title = fm.title ?? file.basename;
      this.projectSlug = (fm.project ?? "").replace(/^\[\[|\]\]$/g, "");
      this.status = fm.status ?? "not started";
      this.priority = fm.priority ?? "medium";
      this.due = fm.due ?? "";
    }
  }

  private getProjectSlugs(): string[] {
      const projectsPath = `${this.ws.rootFolder}/Projects`;
      const folder = this.app.vault.getAbstractFileByPath(projectsPath);
      if (!folder) return [];

      const children = (folder as any).children;
      if (!Array.isArray(children)) return [];

      return children
          .filter((f: any) => !Array.isArray(f.children) && f.name?.endsWith(".md"))
          .map((f: any) => (f.name as string).replace(/\.md$/, ""))
          .sort();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("pm-modal");

    contentEl.createEl("h2", { text: this.isNew ? "New Task" : `Task: ${this.title}` });

    new Setting(contentEl).setName("Title").addText((t) => {
      t.setValue(this.title).onChange((v) => (this.title = v));
      if (this.isNew) t.inputEl.focus();
    });

    const projects = this.getProjectSlugs();
    new Setting(contentEl)
        .setName("Project")
        .addDropdown((d) => {
            if (projects.length === 0) {
                d.addOption("", "— no projects found —");
            } else {
                d.addOption("", "— select —");
                projects.forEach((p) => d.addOption(p, p));
                if (this.projectSlug && projects.includes(this.projectSlug)) {
                    d.setValue(this.projectSlug);
                } else if (projects.length > 0) {
                    this.projectSlug = projects[0];
                    d.setValue(projects[0]);
                }
            }
            d.onChange((v) => (this.projectSlug = v));
        });

    new Setting(contentEl).setName("Status").addDropdown((d) => {
      this.plugin.settings.statuses.forEach((s) => d.addOption(s, s));
      d.setValue(this.status).onChange((v) => (this.status = v));
    });

    new Setting(contentEl).setName("Priority").addDropdown((d) => {
      this.plugin.settings.priorities.forEach((p) => d.addOption(p, p));
      d.setValue(this.priority).onChange((v) => (this.priority = v));
    });

    new Setting(contentEl).setName("Due date").addText((t) =>
      t.setPlaceholder("YYYY-MM-DD").setValue(this.due).onChange((v) => (this.due = v))
    );

    // Time tracking section
    if (!this.isNew && this.file) {
      contentEl.createEl("h3", { text: "Time Tracking" });
      const file = this.file;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};

      const statsDiv = contentEl.createDiv({ cls: "pm-time-stats" });
      statsDiv.createDiv({ text: `Total hours: ${fm.total_hours ?? 0}` });
      statsDiv.createDiv({ text: `Days tracked: ${fm.days_count ?? 0}` });

      // Timer controls
      const timerDiv = contentEl.createDiv({ cls: "pm-timer-controls" });
      const isThisTaskRunning = this.plugin.timeTracker.getActiveTaskPath() === file.path;

      if (isThisTaskRunning) {
        const elapsed = timerDiv.createDiv({ cls: "pm-elapsed-display" });
        elapsed.textContent = this.plugin.timeTracker.getElapsed();
        this.timerInterval = window.setInterval(() => {
          elapsed.textContent = this.plugin.timeTracker.getElapsed();
        }, 1000);

        const stopBtn = timerDiv.createEl("button", { cls: "pm-btn pm-btn-danger", text: "⏹ Stop Timer" });
        stopBtn.addEventListener("click", async () => {
          try {
            const hours = await this.plugin.timeTracker.stopTimer(this.ws);
            new Notice(`Stopped. Logged ${hours}h`);
            this.close();
            // Refresh kanban if open
            this.plugin.refreshKanban();
          } catch (err: any) {
            new Notice(err.message);
          }
        });
      } else {
        const startBtn = timerDiv.createEl("button", {
          cls: "pm-btn pm-btn-primary",
          text: "▶ Start Timer",
        });
        startBtn.addEventListener("click", () => {
          try {
            this.plugin.timeTracker.startTimer(file.path, this.title, this.ws.id);
            new Notice(`Timer started: ${this.title}`);
            this.close();
            this.plugin.refreshKanban();
          } catch (err: any) {
            new Notice(err.message);
          }
        });
      }

      // Manual entry
      contentEl.createEl("h4", { text: "Add Manual Entry" });
      const manualDiv = contentEl.createDiv({ cls: "pm-manual-entry" });

      new Setting(manualDiv)
        .setName("Hours")
        .addText((t) =>
          t.setPlaceholder("e.g. 4.5").setValue(this.manualHours).onChange((v) => (this.manualHours = v))
        );

      new Setting(manualDiv)
        .setName("Date")
        .addText((t) =>
          t.setPlaceholder("YYYY-MM-DD").setValue(todayString()).onChange((v) => (this.manualDate = v))
        );

      manualDiv
        .createEl("button", { cls: "pm-btn pm-btn-secondary", text: "Add Entry" })
        .addEventListener("click", async () => {
          const h = parseFloat(this.manualHours);
          if (isNaN(h) || h <= 0) {
            new Notice("Enter a valid number of hours");
            return;
          }
          const date = this.manualDate || todayString();
          await this.plugin.timeTracker.addManualEntry(this.ws, file, h, date);
          new Notice(`Added ${h}h for ${date}`);
          this.plugin.refreshKanban();
          this.close();
        });
    }

    // Buttons
    const btnRow = contentEl.createDiv({ cls: "pm-modal-btns" });

    btnRow.createEl("button", { cls: "pm-btn pm-btn-primary", text: this.isNew ? "Create" : "Save" })
      .addEventListener("click", async () => {
        if (!this.title.trim()) { new Notice("Title is required"); return; }
        await this.save();
        this.close();
      });

    if (!this.isNew && this.file) {
      const f = this.file;
      btnRow.createEl("button", { cls: "pm-btn", text: "Open note" })
        .addEventListener("click", () => {
          this.app.workspace.getLeaf(false).openFile(f);
          this.close();
        });
    }

    btnRow.createEl("button", { cls: "pm-btn", text: "Cancel" })
      .addEventListener("click", () => this.close());
  }

  async save(): Promise<void> {
    if (this.isNew) {
      await this.plugin.taskManager.createTask(
        this.ws,
        this.title,
        this.projectSlug,
        this.status,
        this.priority,
        this.due
      );
      new Notice(`Task created: ${this.title}`);
    } else if (this.file) {
      await updateFrontmatterFields(this.app, this.file, {
        title: this.title,
        project: `[[${this.projectSlug}]]`,
        status: this.status,
        priority: this.priority,
        due: this.due,
      });
      new Notice(`Task saved: ${this.title}`);
    }
    this.plugin.refreshKanban();
  }

  onClose(): void {
    if (this.timerInterval !== null) clearInterval(this.timerInterval);
    this.contentEl.empty();
  }
}
