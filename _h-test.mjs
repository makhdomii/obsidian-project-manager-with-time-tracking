import assert from "node:assert/strict";
import { renameHeading } from "./_fm.mjs";

const run = async (content, from, to) => {
  let out = content;
  const app = { vault: { process: async (_f, fn) => { out = fn(out); } } };
  await renameHeading(app, {}, from, to);
  return out;
};
let pass=0, fail=0;
const t = async (name, fn) => { try { await fn(); console.log("  ok    "+name); pass++; }
  catch(e){ console.log("  FAIL  "+name+"\n        "+e.message); fail++; } };

const NOTE = `---
type: task
title: "Old name"
---

# Old name

## Time Log

| Date | Hours |
|------|-------|
`;

await t("renames the heading", async () => {
  const out = await run(NOTE, "Old name", "New name");
  assert.ok(out.includes("# New name"));
  assert.ok(!out.includes("# Old name"));
});

await t("leaves the rest of the note alone", async () => {
  const out = await run(NOTE, "Old name", "New name");
  assert.ok(out.includes("## Time Log"));
  assert.ok(out.includes('title: "Old name"'), "frontmatter is not this function's job");
});

await t("only touches the first match", async () => {
  const two = "# Dup\n\ntext\n\n# Dup\n";
  const out = await run(two, "Dup", "Once");
  assert.equal(out.split("# Once").length - 1, 1);
  assert.equal(out.split("# Dup").length - 1, 1);
});

await t("does not touch a heading the user rewrote", async () => {
  const edited = "# Something else entirely\n\nbody\n";
  assert.equal(await run(edited, "Old name", "New name"), edited);
});

await t("does not touch a deeper heading of the same text", async () => {
  const deep = "## Old name\n";
  assert.equal(await run(deep, "Old name", "New"), deep);
});

await t("no-ops when the title did not change", async () => {
  assert.equal(await run(NOTE, "Old name", "Old name"), NOTE);
});

await t("no-ops on empty titles", async () => {
  assert.equal(await run(NOTE, "", "New"), NOTE);
  assert.equal(await run(NOTE, "Old name", "   "), NOTE);
});

await t("survives a heading with trailing spaces", async () => {
  const out = await run("#  Old name  \n", " Old name ", "New");
  assert.ok(out.includes("# New"));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
