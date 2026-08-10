// رنگ‌های status/priority از پالتِ اعتبارسنجی‌شده‌ی داشبورد میان (توکن‌های
// --pm-cat-* و --pm-status-*, تعریف‌شده در styles/dashboardStyles.ts) نه از
// متغیرهای تم. دلیلش اینه که این رنگ‌ها «داده» رمزگذاری می‌کنن: باید بین
// کانبان و چارت‌ها یکی باشن و جداشدنی‌بودنشون زیر کوررنگی تضمین‌شده بمونه.
// خودِ توکن‌ها برای تم روشن و تاریک دو مقدار جدا دارن، پس با تم عوض می‌شن.

// ترتیب اسلات‌ها اتفاقی نیست: همین ترتیب (آبی، نارنجی، فیروزه‌ای، قرمز، بنفش)
// با validate_palette تست شده — بدترین جفتِ همسایه ΔE ۶٫۹ زیر دوتان، که فقط
// همراه رمزگذاری دوم مجازه؛ برای همین همه‌جا لجند/برچسب/فاصله‌ی ۲px داریم.
const STATUS_SLOT: Record<string, number> = {
  todo: 1,    // آبی
  active: 2,  // نارنجی
  done: 3,    // فیروزه‌ای
  cancel: 8,  // قرمز
  quite: 7,   // بنفش
};

// نام‌های قدیمی. نوت‌هایی که مهاجرت نکردن (مثلاً از یه بکاپ برگشتن) نباید از
// تخته غیب بشن، پس موقع خوندن به نام جدید ترجمه می‌شن.
const LEGACY_STATUS: Record<string, string> = {
  "not started": "todo",
  "in progress": "active",
};

/** status فرontmatter → نامِ متعارف: lowercase و بدون نام‌های قدیمی */
export function normalizeStatus(status: unknown): string {
  const key = String(status ?? "").trim().toLowerCase();
  return LEGACY_STATUS[key] ?? key;
}

// اسلات‌های باقی‌مانده‌ی پالت برای وضعیت‌های دلخواهِ کاربر — هیچ‌وقت رنگ جدید
// «ساخته» نمی‌شه، فقط از همین هشت‌تا انتخاب می‌شه.
const FALLBACK_SLOTS = [4, 5, 6];

const PRIORITY_TOKENS: Record<string, string> = {
  low: "var(--pm-status-good)",
  medium: "var(--pm-status-warning)",
  high: "var(--pm-status-serious)",
  critical: "var(--pm-status-critical)",
};

/** هش پایدار — تا یک وضعیت با فیلترشدن بقیه رنگش عوض نشه */
function stableIndex(key: string, buckets: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % buckets;
}

export function statusSlot(status: string): number {
  const key = normalizeStatus(status);
  return STATUS_SLOT[key] ?? FALLBACK_SLOTS[stableIndex(key, FALLBACK_SLOTS.length)];
}

export function statusColor(status: string): string {
  return `var(--pm-cat-${statusSlot(status)})`;
}

export function priorityColor(priority: string): string {
  return PRIORITY_TOKENS[(priority ?? "").toLowerCase()] ?? "var(--text-faint)";
}

// این وضعیت‌ها دیگه کاری نیستن که لازم باشه هر بار توجه بگیرن — کم‌رنگ نشون داده می‌شن
const MUTED_STATUSES = new Set(["done", "cancel", "quite"]);

export function isMutedStatus(status: string): boolean {
  return MUTED_STATUSES.has(normalizeStatus(status));
}
