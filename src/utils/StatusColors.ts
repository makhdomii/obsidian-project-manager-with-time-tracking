// رنگ هر ستون کانبان بر اساس status — از پالت رنگی خودِ اوبسیدین (با هر تم سازگاره)،
// نه رنگ ثابت، چون این‌ها با تم روشن/تاریک و تم‌های شخص ثالث هم درست کار می‌کنن.
const STATUS_COLORS: Record<string, string> = {
  "not started": "var(--color-blue)",
  "in progress": "var(--interactive-accent)",
  done: "var(--color-green)",
  cancel: "var(--color-red)",
  quite: "var(--color-purple)",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "var(--color-green)",
  medium: "var(--color-yellow)",
  high: "var(--color-orange)",
  critical: "var(--color-red)",
};

export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? "var(--text-faint)";
}

export function priorityColor(priority: string): string {
  return PRIORITY_COLORS[priority?.toLowerCase()] ?? "var(--text-faint)";
}

// این وضعیت‌ها دیگه کاری نیستن که لازم باشه هر بار توجه بگیرن — کم‌رنگ نشون داده می‌شن
const MUTED_STATUSES = new Set(["done", "cancel", "quite"]);

export function isMutedStatus(status: string): boolean {
  return MUTED_STATUSES.has(status);
}
