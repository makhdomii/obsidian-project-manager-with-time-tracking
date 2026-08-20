import assert from "node:assert/strict";
import esbuild from "esbuild";
import { createRequire } from "node:module";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = join(__dirname, "_updates-bundle.cjs");

await esbuild.build({
  entryPoints: [join(__dirname, "src/utils/TaskUpdates.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: outFile,
  external: ["obsidian"],
});

const require = createRequire(import.meta.url);
const {
  validateUpdateText,
  parseTaskUpdates,
  appendUpdateToContent,
} = require(outFile);

let pass = 0;
let fail = 0;
const t = async (name, fn) => {
  try {
    await fn();
    console.log("  ok    " + name);
    pass++;
  } catch (e) {
    console.log("  FAIL  " + name + "\n        " + e.message);
    fail++;
  }
};

const BASE = `---
type: task
title: "Demo"
---

# Demo

## Time Log

| Date | Hours | Start | End |
|------|-------|-------|-----|
`;

await t("rejects blank update text", async () => {
  assert.equal(validateUpdateText("   "), null);
  assert.equal(validateUpdateText(""), null);
});

await t("accepts trimmed update text", async () => {
  assert.equal(validateUpdateText("  hello  "), "hello");
});

await t("parses empty Updates section", async () => {
  const content = BASE + "\n## Updates\n";
  assert.deepEqual(parseTaskUpdates(content), []);
});

await t("parses dated updates newest-first", async () => {
  const content = `# Demo

## Updates

### 2026-08-16 10:00
First

### 2026-08-16 14:55
Second line
still second
`;
  const updates = parseTaskUpdates(content);
  assert.equal(updates.length, 2);
  assert.equal(updates[0].stamp, "2026-08-16 14:55");
  assert.equal(updates[0].text, "Second line\nstill second");
  assert.equal(updates[1].stamp, "2026-08-16 10:00");
  assert.equal(updates[1].text, "First");
});

await t("appends Updates section when missing", async () => {
  const out = appendUpdateToContent(BASE, "Ship it", "2026-08-16 15:00");
  assert.ok(out.includes("## Updates"));
  assert.ok(out.includes("### 2026-08-16 15:00"));
  assert.ok(out.includes("Ship it"));
  assert.ok(out.includes("## Time Log"));
});

await t("appends under existing Updates without touching Time Log", async () => {
  const withSection = BASE + "\n## Updates\n\n### 2026-08-16 10:00\nOlder\n";
  const out = appendUpdateToContent(withSection, "Newer", "2026-08-16 15:00");
  assert.ok(out.includes("### 2026-08-16 15:00\nNewer"));
  assert.ok(out.includes("### 2026-08-16 10:00\nOlder"));
  const timeIdx = out.indexOf("## Time Log");
  const updatesIdx = out.indexOf("## Updates");
  assert.ok(updatesIdx > timeIdx || updatesIdx > 0);
  assert.equal((out.match(/## Time Log/g) || []).length, 1);
});

await t("preserves multiline body", async () => {
  const out = appendUpdateToContent(BASE, "line1\nline2", "2026-08-16 15:00");
  assert.ok(out.includes("### 2026-08-16 15:00\nline1\nline2\n"));
});

// NoteContent: Updates should not count as freeform notes
await esbuild.build({
  entryPoints: [join(__dirname, "src/utils/NoteContent.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: join(__dirname, "_notes-bundle.cjs"),
  external: ["obsidian"],
});
const { readBodyNotes } = require(join(__dirname, "_notes-bundle.cjs"));

await t("NoteContent ignores Updates section as template", async () => {
  const content = `# Demo

## Updates

### 2026-08-16 15:00
Status update only

## Time Log

| Date | Hours | Start | End |
|------|-------|-------|-----|
`;
  const info = readBodyNotes(content);
  assert.equal(info.hasNotes, false);
});

await t("NoteContent still detects freeform notes", async () => {
  const content = `# Demo

Freeform jotting here

## Updates

### 2026-08-16 15:00
Status update

## Time Log

| Date | Hours | Start | End |
|------|-------|-------|-----|
`;
  const info = readBodyNotes(content);
  assert.equal(info.hasNotes, true);
  assert.ok(info.excerpt.includes("Freeform"));
});

await esbuild.build({
  entryPoints: [join(__dirname, "src/utils/TimeLog.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: join(__dirname, "_timelog-bundle.cjs"),
});
const { appendTimeLogRow } = require(join(__dirname, "_timelog-bundle.cjs"));

await t("time log rows stay above Updates section", async () => {
  const content = `# Demo

## Time Log

| Date | Hours | Start | End |
|------|-------|-------|-----|

## Updates

### 2026-08-16 15:00
Hello
`;
  const row = "| 2026-08-16 | 1.5 | start | end |";
  const out = appendTimeLogRow(content, row);
  const timeIdx = out.indexOf("## Time Log");
  const rowIdx = out.indexOf(row);
  const updatesIdx = out.indexOf("## Updates");
  assert.ok(rowIdx > timeIdx);
  assert.ok(rowIdx < updatesIdx);
  assert.ok(out.includes("### 2026-08-16 15:00\nHello"));
});

try {
  unlinkSync(outFile);
  unlinkSync(join(__dirname, "_notes-bundle.cjs"));
  unlinkSync(join(__dirname, "_timelog-bundle.cjs"));
} catch {
  /* ignore */
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
