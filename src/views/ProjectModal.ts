import { App, Modal, TFile, Notice, Setting } from "obsidian";
import ProjectManagerPlugin from "../main";
import { Workspace } from "../types";
import { updateFrontmatterFields } from "../utils/FrontmatterUtils";

export class ProjectModal extends Modal {
  plugin: ProjectManagerPlugin;
  file: TFile | null;
  ws: Workspace;
  isNew: boolean;

  title = "";
  status = "not started";
  priority = "medium";
  due = "";

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
      this.status = fm.status ?? "not started";
      this.priority = fm.priority ?? "medium";
      this.due = fm.due ?? "";
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("pm-modal");

    contentEl.createEl("h2", { text: this.isNew ? "New Project" : `Project: ${this.title}` });

    new Setting(contentEl).setName("Title").addText((t) => {
      t.setValue(this.title).onChange((v) => (this.title = v));
      if (this.isNew) t.inputEl.focus();
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
      await this.plugin.projectManager.createProject(
        this.ws,
        this.title,
        this.status,
        this.priority,
        this.due
      );
      new Notice(`Project created: ${this.title}`);
    } else if (this.file) {
      await updateFrontmatterFields(this.app, this.file, {
        title: this.title,
        status: this.status,
        priority: this.priority,
        due: this.due,
      });
      new Notice(`Project saved: ${this.title}`);
    }
    this.plugin.refreshKanban();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
