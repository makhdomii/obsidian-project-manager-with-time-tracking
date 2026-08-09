import { Notice } from "obsidian";
import type ProjectManagerPlugin from "../main";
import { Workspace } from "../types";

/**
 * نوارِ تایمرِ فعال — یک پیاده‌سازی، مشترک بین کانبان و داشبورد، تا دکمه‌ی
 * پاز فقط توی یکی‌شون نباشه.
 *
 * onChange بعد از هر عملیات صدا زده می‌شه تا نمای میزبان دوباره رندر بشه.
 */
export function renderTimerBar(
  parent: HTMLElement,
  plugin: ProjectManagerPlugin,
  ws: Workspace,
  onChange: () => void
): void {
  const tracker = plugin.timeTracker;
  if (!tracker.isRunning()) return;

  const paused = tracker.isPaused();
  const bar = parent.createDiv({ cls: `pm-timer-bar${paused ? " paused" : ""}` });

  bar.createSpan({ cls: "pm-timer-dot", attr: { "aria-hidden": "true" } });
  bar.createSpan({ cls: "pm-timer-task", text: tracker.getActiveTimer()?.taskTitle ?? "" });
  bar.createSpan({ cls: "pm-timer-elapsed", text: tracker.getElapsed() });
  if (paused) bar.createSpan({ cls: "pm-timer-badge", text: "paused" });

  const pauseBtn = bar.createEl("button", {
    cls: "pm-btn pm-btn-secondary",
    text: paused ? "▶ Resume" : "⏸ Pause",
  });
  pauseBtn.addEventListener("click", () => {
    tracker.togglePause();
    onChange();
  });

  const stopBtn = bar.createEl("button", { cls: "pm-btn pm-btn-danger", text: "⏹ Stop" });
  stopBtn.addEventListener("click", async () => {
    try {
      const hours = await tracker.stopTimer(ws);
      new Notice(`Stopped. Logged ${hours}h`);
      onChange();
    } catch (err: any) {
      new Notice(err.message);
    }
  });
}

/**
 * همه‌ی نمایشگرهای زمان توی این کانتینر رو نو می‌کنه.
 *
 * قبلاً این‌جا querySelector تکی بود، برای همین فقط اولین المان (نوار بالای
 * صفحه) تیک می‌خورد و تایمرِ روی کارتِ تسک تا ابد روی همون مقدارِ لحظه‌ی رندر
 * — یعنی 0:00:00 — می‌موند.
 */
export function tickTimerDisplays(container: HTMLElement, plugin: ProjectManagerPlugin): void {
  const text = plugin.timeTracker.getElapsed();
  container.querySelectorAll(".pm-timer-elapsed").forEach((el) => {
    el.textContent = text;
  });
}
