// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Jalali — تبدیل و کار با تقویم شمسی، کاملاً خودکفا                    ║
// ║  عمداً به پلاگین persian-calendar وابسته نیست تا داشبورد روی هر        ║
// ║  والتی بدون پیش‌نیاز کار کنه. الگوریتم همون jalaali-js استاندارده.    ║
// ╚══════════════════════════════════════════════════════════════════════╝

export const MONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

export const MONTHS_SHORT_FA = ["فر", "ار", "خر", "تی", "مر", "شه", "مه", "آب", "آذ", "دی", "به", "اس"];

// هفته‌ی شنبه‌محور — ستون ۰ شنبه‌ست
export const WEEKDAYS_FA = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
export const WEEKDAYS_FULL_FA = ["شنبه", "یک‌شنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه"];

export const SEASONS_FA = ["بهار", "تابستان", "پاییز", "زمستان"];

// Date.getDay() (۰ = یک‌شنبه) → ستون هفته‌ی شنبه‌محور
const JS_COL = [1, 2, 3, 4, 5, 6, 0];

export interface JalaliDate { jy: number; jm: number; jd: number; }
export interface GregorianDate { gy: number; gm: number; gd: number; }

function div(a: number, b: number): number { return ~~(a / b); }
function mod(a: number, b: number): number { return a - ~~(a / b) * b; }

// سال‌های شکست در چرخه‌ی کبیسه‌ی جلالی (الگوریتم بورکارد/خیام)
const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181,
  1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
];

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];

  if (jy < jp || jy >= BREAKS[bl - 1]) {
    // خارج از بازه‌ی معتبر — به‌جای throw، مقدار امن برمی‌گردونیم تا داشبورد نترکه
    return { leap: 0, gy, march: 20 };
  }

  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): GregorianDate {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

export function gregorianToJalali(gy: number, gm: number, gd: number): JalaliDate {
  return d2j(g2d(gy, gm, gd));
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): GregorianDate {
  return d2g(j2d(jy, jm, jd));
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): JalaliDate {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;

  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }

  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export function isLeapJalaliYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

// ── کار با رشته‌ی ISO محلی (YYYY-MM-DD) ───────────────────────────────────
// همه‌جای داشبورد «روز» با همین رشته نمایندگی می‌شه — نه با Date، تا مسئله‌ی
// تایم‌زون فقط یک بار، همین‌جا، حل بشه.

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ظهر محلی می‌سازیم تا جابه‌جایی ساعت تابستانی هیچ‌وقت روز رو یکی جلو/عقب نبره
export function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((isoToDate(toISO).getTime() - isoToDate(fromISO).getTime()) / 86400000);
}

// همه‌ی روزهای یک بازه (شامل هر دو سر)
export function rangeDays(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const total = daysBetween(fromISO, toISO);
  if (total < 0) return out;
  for (let i = 0; i <= total; i++) out.push(addDays(fromISO, i));
  return out;
}

export function isoToJalali(iso: string): JalaliDate {
  const d = isoToDate(iso);
  return gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function jalaliToISO(jy: number, jm: number, jd: number): string {
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
  return toISODate(new Date(gy, gm - 1, gd, 12));
}

// ── نمایش ────────────────────────────────────────────────────────────────

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** «۱۷ مرداد ۱۴۰۵» */
export function jalaliLabel(iso: string): string {
  const { jy, jm, jd } = isoToJalali(iso);
  return `${toPersianDigits(jd)} ${MONTHS_FA[jm - 1]} ${toPersianDigits(jy)}`;
}

/** «مرداد ۱۴۰۵» */
export function jalaliMonthLabel(jy: number, jm: number): string {
  return `${MONTHS_FA[jm - 1]} ${toPersianDigits(jy)}`;
}

/** «شنبه» */
export function weekdayLabel(iso: string): string {
  return WEEKDAYS_FULL_FA[weekdayCol(iso)];
}

export function seasonName(jm: number): string {
  return SEASONS_FA[Math.floor((jm - 1) / 3)];
}

// ── چیدمان تقویم ─────────────────────────────────────────────────────────

/** ستون هفته‌ی شنبه‌محور برای یک روز */
export function weekdayCol(iso: string): number {
  return JS_COL[isoToDate(iso).getDay()];
}

/** ستون شروع اولین روز یک ماه جلالی — برای خالی‌گذاشتن ابتدای گرید */
export function jalaliFirstWeekdayCol(jy: number, jm: number): number {
  return weekdayCol(jalaliToISO(jy, jm, 1));
}

export interface JalaliMonthGroup { jy: number; jm: number; isos: string[]; }

/** روزهای یک بازه رو بر اساس ماه جلالی گروه می‌کنه */
export function groupByJalaliMonth(isos: string[]): JalaliMonthGroup[] {
  const groups = new Map<string, JalaliMonthGroup>();
  for (const iso of isos) {
    const { jy, jm } = isoToJalali(iso);
    const key = `${jy}-${jm}`;
    let g = groups.get(key);
    if (!g) { g = { jy, jm, isos: [] }; groups.set(key, g); }
    g.isos.push(iso);
  }
  return Array.from(groups.values()).sort((a, b) => (a.jy !== b.jy ? a.jy - b.jy : a.jm - b.jm));
}

/** شنبه‌ی هفته‌ای که این روز توش قرار داره */
export function startOfJalaliWeek(iso: string): string {
  return addDays(iso, -weekdayCol(iso));
}

/** اول ماه جلالیِ همین روز */
export function startOfJalaliMonth(iso: string): string {
  const { jy, jm } = isoToJalali(iso);
  return jalaliToISO(jy, jm, 1);
}

/** اول فصل جلالیِ همین روز */
export function startOfJalaliSeason(iso: string): string {
  const { jy, jm } = isoToJalali(iso);
  return jalaliToISO(jy, Math.floor((jm - 1) / 3) * 3 + 1, 1);
}

/** اول سال جلالیِ همین روز */
export function startOfJalaliYear(iso: string): string {
  const { jy } = isoToJalali(iso);
  return jalaliToISO(jy, 1, 1);
}
