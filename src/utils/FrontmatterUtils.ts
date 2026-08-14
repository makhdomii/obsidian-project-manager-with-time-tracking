import { App, TFile } from "obsidian";

export async function getFrontmatter(app: App, file: TFile): Promise<Record<string, any>> {
  const cache = app.metadataCache.getFileCache(file);
  return cache?.frontmatter ?? {};
}

export async function updateFrontmatterField(
  app: App,
  file: TFile,
  key: string,
  value: any
): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm) => {
    fm[key] = value;
  });
}

export async function updateFrontmatterFields(
  app: App,
  file: TFile,
  fields: Record<string, any>
): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm) => {
    for (const [k, v] of Object.entries(fields)) {
      fm[k] = v;
    }
  });
}

/**
 * The note a `[[wikilink]]` frontmatter value points at, as a bare slug.
 *
 * Stripping the brackets is not enough. When archiving moves a file, Obsidian
 * rewrites links to it — that is the whole reason moves go through
 * fileManager.renameFile — and a link that has become ambiguous is rewritten as
 * a full vault path. So `[[backup]]` becomes
 * `[[ProjectManager/Work/Archive/Tasks/backup]]`, and every comparison against
 * `[[backup]]` silently stops matching: a task drops out of its project, the
 * project's hours fall to zero, and the board shows a path where a name should be.
 *
 * Aliases and heading anchors are dropped for the same reason — the target is
 * what matters, not how a link happens to be written.
 */
export function linkSlug(value: unknown): string {
  let s = String(value ?? "").trim();
  s = s.replace(/^\[\[/, "").replace(/\]\]$/, "");
  s = s.split("|")[0];
  s = s.split("#")[0];
  const slash = s.lastIndexOf("/");
  if (slash >= 0) s = s.slice(slash + 1);
  return s.replace(/\.md$/i, "").trim();
}

/**
 * Renders a value as a quoted YAML string.
 *
 * Titles used to be injected straight into "...", where a single quote in the
 * title was enough to break the whole frontmatter — hardly unlikely for titles
 * arriving from outside, such as Codecks cards.
 */
export function yamlString(value: string): string {
  return `"${String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;
}

export function slugify(title: string): string {
  return title.toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u0600-\u06FF\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
