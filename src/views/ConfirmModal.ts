import { App, Modal } from "obsidian";

/** A plain confirmation dialog — Obsidian ships nothing for this */
export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private opts: {
      title: string;
      body: string;
      confirmText: string;
      onConfirm: () => void;
    }
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("pm-modal", "pm-confirm");

    contentEl.createEl("h2", { text: this.opts.title });
    contentEl.createEl("p", { cls: "pm-confirm-body", text: this.opts.body });

    const btns = contentEl.createDiv({ cls: "pm-modal-btns" });
    const cancel = btns.createEl("button", { cls: "pm-btn pm-btn-secondary", text: "Cancel" });
    cancel.addEventListener("click", () => this.close());

    const confirm = btns.createEl("button", {
      cls: "pm-btn pm-btn-danger",
      text: this.opts.confirmText,
    });
    confirm.addEventListener("click", () => {
      this.close();
      this.opts.onConfirm();
    });

    // Cancel takes focus so a stray Enter does not destroy anything
    cancel.focus();
    cancel.setAttribute("aria-label", "Cancel");
    confirm.setAttribute("aria-label", this.opts.confirmText);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
