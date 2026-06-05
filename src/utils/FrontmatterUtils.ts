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

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
