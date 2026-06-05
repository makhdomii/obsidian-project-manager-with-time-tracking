export function formatDate(date: Date, format: string): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const sec = String(date.getSeconds()).padStart(2, "0");

  return format
    .replace("YYYY", String(y))
    .replace("MM", m)
    .replace("DD", d)
    .replace("HH", h)
    .replace("mm", min)
    .replace("ss", sec);
}

export function toISOFileStamp(date: Date): string {
  // e.g. 2026-06-04T12-41-52-595Z
  return date.toISOString().replace(/:/g, "-").replace(/\./g, "-");
}

export function now(): Date {
  return new Date();
}

export function diffHours(start: Date, end: Date): number {
  return Math.round(((end.getTime() - start.getTime()) / 3600000) * 100) / 100;
}

export function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
