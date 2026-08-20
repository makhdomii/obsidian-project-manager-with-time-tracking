import { App, TFile } from "obsidian";
import { formatDate } from "./DateUtils";

export interface TaskUpdate {
  stamp: string;
  text: string;
}

const UPDATES_HEADING = /^##\s+updates\s*$/i;
const UPDATE_STAMP = /^###\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*$/;
const ANY_H2 = /^##\s+/;

/** Returns trimmed text, or null when the update should be rejected. */
export function validateUpdateText(text: unknown): string | null {
  const trimmed = String(text ?? "").trim();
  return trimmed ? trimmed : null;
}

export function formatUpdateStamp(date: Date = new Date()): string {
  return formatDate(date, "YYYY-MM-DD HH:mm");
}

/**
 * Reads `## Updates` entries. Newest first for the modal.
 * Stops at the next `##` heading so Time Log (or freeform sections) stay alone.
 */
export function parseTaskUpdates(content: string): TaskUpdate[] {
  const lines = content.split("\n");
  const updates: TaskUpdate[] = [];
  let inUpdates = false;
  let currentStamp: string | null = null;
  let body: string[] = [];

  const flush = () => {
    if (!currentStamp) return;
    const text = body.join("\n").replace(/\s+$/, "").replace(/^\s+/, "");
    if (text) updates.push({ stamp: currentStamp, text });
    currentStamp = null;
    body = [];
  };

  for (const line of lines) {
    if (UPDATES_HEADING.test(line.trim())) {
      flush();
      inUpdates = true;
      continue;
    }
    if (!inUpdates) continue;

    if (ANY_H2.test(line) && !UPDATES_HEADING.test(line.trim())) {
      flush();
      inUpdates = false;
      continue;
    }

    const stampMatch = line.trim().match(UPDATE_STAMP);
    if (stampMatch) {
      flush();
      currentStamp = stampMatch[1];
      continue;
    }

    if (currentStamp) body.push(line);
  }
  flush();

  return updates.reverse();
}

/**
 * Appends one update under `## Updates`, creating the section when missing.
 * Prefer placing the section after Time Log when inserting for the first time,
 * matching the new-task template; if Time Log is absent, append at the end.
 */
export function appendUpdateToContent(
  content: string,
  text: string,
  stamp: string
): string {
  const body = validateUpdateText(text);
  if (!body) return content;

  const block = `### ${stamp}\n${body}\n`;
  const lines = content.split("\n");
  let updatesIdx = -1;
  let timeLogIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (UPDATES_HEADING.test(trimmed)) updatesIdx = i;
    if (/^##\s+time log\s*$/i.test(trimmed)) timeLogIdx = i;
  }

  if (updatesIdx >= 0) {
    // Insert right after the Updates heading (and one blank line if present)
    let insertAt = updatesIdx + 1;
    if (insertAt < lines.length && lines[insertAt].trim() === "") insertAt++;
    const next = [...lines];
    next.splice(insertAt, 0, block.trimEnd(), "");
    return next.join("\n");
  }

  const section = `\n## Updates\n\n${block}`;
  if (timeLogIdx >= 0) {
    // Find end of Time Log table / section (next H2 or EOF)
    let end = lines.length;
    for (let i = timeLogIdx + 1; i < lines.length; i++) {
      if (ANY_H2.test(lines[i])) {
        end = i;
        break;
      }
    }
    const before = lines.slice(0, end).join("\n").replace(/\s*$/, "");
    const after = lines.slice(end).join("\n");
    return after
      ? `${before}\n${section}${after.startsWith("\n") ? after : `\n${after}`}`
      : `${before}\n${section}`;
  }

  return content.replace(/\s*$/, "") + section;
}

/** Vault write — appends a validated update with the current local stamp. */
export async function appendTaskUpdate(
  app: App,
  file: TFile,
  text: string,
  at: Date = new Date()
): Promise<TaskUpdate | null> {
  const body = validateUpdateText(text);
  if (!body) return null;
  const stamp = formatUpdateStamp(at);

  await app.vault.process(file, (content) =>
    appendUpdateToContent(content, body, stamp)
  );

  return { stamp, text: body };
}
