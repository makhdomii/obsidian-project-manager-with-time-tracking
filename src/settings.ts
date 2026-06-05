import { App, PluginSettingTab, Setting, Modal, ButtonComponent } from "obsidian";
import ProjectManagerPlugin from "./main";
import { Workspace, DEFAULT_SETTINGS } from "./types";

export class ProjectManagerSettingTab extends PluginSettingTab {
  plugin: ProjectManagerPlugin;

  constructor(app: App, plugin: ProjectManagerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Project Manager Settings" });

    // Default workspace
    new Setting(containerEl)
      .setName("Default workspace")
      .setDesc("Which workspace to open by default")
      .addDropdown((drop) => {
        this.plugin.settings.workspaces.forEach((ws) => {
          drop.addOption(ws.id, ws.name);
        });
        drop.setValue(this.plugin.settings.defaultWorkspaceId);
        drop.onChange(async (value) => {
          this.plugin.settings.defaultWorkspaceId = value;
          await this.plugin.saveSettings();
        });
      });

    // Date format
    new Setting(containerEl)
      .setName("Date format")
      .setDesc("e.g. YYYY-MM-DD")
      .addText((text) =>
        text
          .setPlaceholder("YYYY-MM-DD")
          .setValue(this.plugin.settings.dateFormat)
          .onChange(async (value) => {
            this.plugin.settings.dateFormat = value;
            await this.plugin.saveSettings();
          })
      );

    // Workspaces
    containerEl.createEl("h3", { text: "Workspaces" });

    this.plugin.settings.workspaces.forEach((ws, index) => {
      const wsContainer = containerEl.createDiv({ cls: "pm-workspace-setting" });
      wsContainer.createEl("h4", { text: ws.name });

      new Setting(wsContainer)
        .setName("Workspace name")
        .addText((text) =>
          text.setValue(ws.name).onChange(async (value) => {
            this.plugin.settings.workspaces[index].name = value;
            await this.plugin.saveSettings();
          })
        );

      new Setting(wsContainer)
        .setName("Root folder")
        .addText((text) =>
          text.setValue(ws.rootFolder).onChange(async (value) => {
            this.plugin.settings.workspaces[index].rootFolder = value;
            await this.plugin.saveSettings();
          })
        );

      new Setting(wsContainer)
        .setName("Projects folder")
        .addText((text) =>
          text.setValue(ws.projectsFolder).onChange(async (value) => {
            this.plugin.settings.workspaces[index].projectsFolder = value;
            await this.plugin.saveSettings();
          })
        );

      new Setting(wsContainer)
        .setName("Tasks folder")
        .addText((text) =>
          text.setValue(ws.tasksFolder).onChange(async (value) => {
            this.plugin.settings.workspaces[index].tasksFolder = value;
            await this.plugin.saveSettings();
          })
        );

      new Setting(wsContainer)
        .setName("Time entries folder")
        .addText((text) =>
          text.setValue(ws.timeEntriesFolder).onChange(async (value) => {
            this.plugin.settings.workspaces[index].timeEntriesFolder = value;
            await this.plugin.saveSettings();
          })
        );

      if (this.plugin.settings.workspaces.length > 1) {
        new Setting(wsContainer).addButton((btn) =>
          btn
            .setButtonText("Remove workspace")
            .setWarning()
            .onClick(async () => {
              this.plugin.settings.workspaces.splice(index, 1);
              await this.plugin.saveSettings();
              this.display();
            })
        );
      }
    });

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText("+ Add workspace")
        .setCta()
        .onClick(async () => {
          const id = `ws_${Date.now()}`;
          const name = "NewWorkspace";
          this.plugin.settings.workspaces.push({
            id,
            name,
            rootFolder: name,
            projectsFolder: `${name}/Projects`,
            tasksFolder: `${name}/Tasks`,
            timeEntriesFolder: `${name}/TimeEntries`,
          });
          await this.plugin.saveSettings();
          this.display();
        })
    );

    // Statuses
    containerEl.createEl("h3", { text: "Task Statuses" });
    new Setting(containerEl)
      .setName("Statuses")
      .setDesc("Comma-separated list")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.statuses.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.statuses = value.split(",").map((s) => s.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    // Priorities
    containerEl.createEl("h3", { text: "Priorities" });
    new Setting(containerEl)
      .setName("Priorities")
      .setDesc("Comma-separated list")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.priorities.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.priorities = value.split(",").map((s) => s.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          })
      );
  }
}
