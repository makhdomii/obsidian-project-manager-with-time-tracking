// ╔══════════════════════════════════════════════════════════════════════╗
// ║  DashboardCharts — قطعه‌های تصویریِ داشبورد                            ║
// ║  هر چارت اینجا سه قانون رو رعایت می‌کنه: رنگ فقط از توکن‌های           ║
// ║  اعتبارسنجی‌شده‌ی pm-cat/pm-heat میاد، هر چارت نسخه‌ی جدولی داره        ║
// ║  (برای وقتی رنگ کافی نیست)، و تولتیپ هیچ‌وقت تنها راهِ دیدن عدد نیست.  ║
// ╚══════════════════════════════════════════════════════════════════════╝

import {
  MONTHS_SHORT_FA, WEEKDAYS_FA, groupByJalaliMonth, isoToJalali,
  jalaliFirstWeekdayCol, jalaliLabel, jalaliMonthLabel, toPersianDigits,
  weekdayCol, weekdayLabel,
} from "../utils/Jalali";

// ── قالب‌بندی عدد ────────────────────────────────────────────────────────

export function formatHours(h: number): string {
  const totalMin = Math.round((h || 0) * 60);
  if (totalMin <= 0) return "0h";
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (hh && mm) return `${hh}h ${mm}m`;
  if (hh) return `${hh}h`;
  return `${mm}m`;
}

export function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

// ── تولتیپ مشترک ─────────────────────────────────────────────────────────
// تولتیپ فقط «تکمیل‌کننده»‌ست؛ همون عددها توی نمای جدولیِ هر کارت هم هستن.

export class ChartTooltip {
  private el: HTMLElement;

  constructor(private host: HTMLElement) {
    this.el = host.createDiv({ cls: "pm-db-tip" });
    this.el.style.display = "none";
  }

  /** تولتیپ رو به یک مارک وصل می‌کنه — هم با ماوس، هم با فوکوس کیبورد */
  attach(mark: HTMLElement, lines: () => string[]): void {
    const show = () => this.show(mark, lines());
    mark.addEventListener("mouseenter", show);
    mark.addEventListener("focus", show);
    mark.addEventListener("mousemove", show);
    mark.addEventListener("mouseleave", () => this.hide());
    mark.addEventListener("blur", () => this.hide());
    mark.setAttribute("tabindex", "0");
    mark.setAttribute("aria-label", lines().join(" — "));
  }

  private show(mark: HTMLElement, lines: string[]): void {
    this.el.empty();
    lines.forEach((line, i) => {
      this.el.createDiv({ cls: i === 0 ? "pm-db-tip-head" : "pm-db-tip-row", text: line });
    });
    this.el.style.display = "block";

    const hostBox = this.host.getBoundingClientRect();
    const markBox = mark.getBoundingClientRect();
    const tipBox = this.el.getBoundingClientRect();

    let left = markBox.left - hostBox.left + markBox.width / 2 - tipBox.width / 2;
    left = Math.max(6, Math.min(left, hostBox.width - tipBox.width - 6));
    let top = markBox.top - hostBox.top - tipBox.height - 8;
    if (top < 4) top = markBox.bottom - hostBox.top + 8;

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  hide(): void { this.el.style.display = "none"; }
}

// ── کارت چارت + کلید نمای جدولی ──────────────────────────────────────────

export interface ChartCard {
  root: HTMLElement;
  body: HTMLElement;
  /** جدولِ معادلِ همین چارت — با کلید «Table» جای چارت رو می‌گیره */
  setTable(columns: string[], rows: (string | number)[][]): void;
}

export function chartCard(parent: HTMLElement, title: string, subtitle?: string): ChartCard {
  const root = parent.createDiv({ cls: "pm-db-card" });
  const head = root.createDiv({ cls: "pm-db-cardhead" });
  const titles = head.createDiv({ cls: "pm-db-titles" });
  titles.createDiv({ cls: "pm-db-cardtitle", text: title });
  if (subtitle) titles.createDiv({ cls: "pm-db-cardsub", text: subtitle });

  const body = root.createDiv({ cls: "pm-db-cardbody" });
  const tableWrap = root.createDiv({ cls: "pm-db-tablewrap" });
  tableWrap.style.display = "none";

  const toggle = head.createEl("button", { cls: "pm-db-toggle", text: "Table" });
  toggle.setAttribute("aria-pressed", "false");
  toggle.style.display = "none";
  toggle.addEventListener("click", () => {
    const showTable = tableWrap.style.display === "none";
    tableWrap.style.display = showTable ? "block" : "none";
    body.style.display = showTable ? "none" : "";
    toggle.textContent = showTable ? "Chart" : "Table";
    toggle.setAttribute("aria-pressed", String(showTable));
  });

  return {
    root,
    body,
    setTable(columns, rows) {
      tableWrap.empty();
      const table = tableWrap.createEl("table", { cls: "pm-db-table" });
      const thead = table.createEl("thead").createEl("tr");
      columns.forEach((c) => thead.createEl("th", { text: c }));
      const tbody = table.createEl("tbody");
      rows.forEach((r) => {
        const tr = tbody.createEl("tr");
        r.forEach((cell) => tr.createEl("td", { text: String(cell) }));
      });
      toggle.style.display = "";
    },
  };
}

// ── عدد قهرمان و کاشی‌های آماری ──────────────────────────────────────────

export interface StatTileOptions {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  /** مثبت/منفی نسبت به دوره‌ی قبل — جهت رنگ رو تعیین می‌کنه */
  delta?: { text: string; direction: "up" | "down" | "flat" };
  tone?: "default" | "warn" | "critical";
}

export function heroFigure(parent: HTMLElement, opts: StatTileOptions): HTMLElement {
  const el = parent.createDiv({ cls: "pm-db-hero" });
  el.createDiv({ cls: "pm-db-hero-label", text: opts.label });
  const row = el.createDiv({ cls: "pm-db-hero-row" });
  row.createSpan({ cls: "pm-db-hero-value", text: opts.value });
  if (opts.unit) row.createSpan({ cls: "pm-db-hero-unit", text: opts.unit });
  if (opts.delta) {
    const arrow = opts.delta.direction === "up" ? "↑" : opts.delta.direction === "down" ? "↓" : "→";
    row.createSpan({ cls: `pm-db-delta pm-db-delta-${opts.delta.direction}`, text: `${arrow} ${opts.delta.text}` });
  }
  if (opts.sub) el.createDiv({ cls: "pm-db-hero-sub", text: opts.sub });
  return el;
}

export function statTile(parent: HTMLElement, opts: StatTileOptions): HTMLElement {
  const el = parent.createDiv({ cls: `pm-db-tile pm-db-tone-${opts.tone ?? "default"}` });
  el.createDiv({ cls: "pm-db-tile-label", text: opts.label });
  const row = el.createDiv({ cls: "pm-db-tile-row" });
  row.createSpan({ cls: "pm-db-tile-value", text: opts.value });
  if (opts.unit) row.createSpan({ cls: "pm-db-tile-unit", text: opts.unit });
  if (opts.sub) el.createDiv({ cls: "pm-db-tile-sub", text: opts.sub });
  return el;
}

// ── چارت ستونی: یک سری، پس بدون لجند (عنوان کارت خودش گویاست) ────────────

export interface ColumnPoint {
  key: string;
  axisLabel: string;
  tipLines: string[];
  value: number;
}

export function columnChart(
  parent: HTMLElement,
  points: ColumnPoint[],
  tooltip: ChartTooltip,
  onSelect?: (p: ColumnPoint) => void
): void {
  const max = Math.max(1, ...points.map((p) => p.value));
  const top = niceCeil(max);

  const plot = parent.createDiv({ cls: "pm-db-plot" });
  const yAxis = plot.createDiv({ cls: "pm-db-yaxis" });
  [top, top / 2, 0].forEach((v) => yAxis.createDiv({ cls: "pm-db-ytick", text: formatNumber(v) }));

  const area = plot.createDiv({ cls: "pm-db-plotarea" });
  const grid = area.createDiv({ cls: "pm-db-grid" });
  [0, 50, 100].forEach((pct) => {
    const line = grid.createDiv({ cls: "pm-db-gridline" });
    line.style.bottom = `${pct}%`;
  });

  const cols = area.createDiv({ cls: "pm-db-cols" });
  // فاصله‌ی برچسب‌های محور x طوری انتخاب می‌شه که روی هم نیفتن
  const step = Math.max(1, Math.ceil(points.length / 12));

  points.forEach((p, i) => {
    const col = cols.createDiv({ cls: "pm-db-col" });
    const bar = col.createDiv({ cls: "pm-db-bar" });
    if (p.value <= 0) {
      // روزِ بدون ثبت هم یک رد نازک می‌ذاره تا ستون خالی با «داده‌ی نداشته» اشتباه نشه
      bar.addClass("pm-db-bar-zero");
      bar.style.height = "2px";
    } else {
      bar.style.height = `${Math.max(2, (p.value / top) * 100)}%`;
    }
    tooltip.attach(col, () => p.tipLines);
    if (onSelect) {
      col.addClass("pm-db-clickable");
      col.addEventListener("click", () => onSelect(p));
      col.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(p); }
      });
    }
    const lbl = col.createDiv({ cls: "pm-db-xlabel" });
    if (i % step === 0 || i === points.length - 1) lbl.textContent = p.axisLabel;
  });
}

/** سقف محور رو به نزدیک‌ترین عددِ گردِ بالاتر می‌بره — پله‌ها ریزن تا یک روزِ
 *  ۶ ساعته محور رو تا ۱۰ نکشه و نصف ارتفاعِ چارت هدر نره */
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const stepped = NICE_STEPS.find((s) => n <= s + 1e-9) ?? 10;
  return stepped * mag;
}

// ── چارت میله‌ای افقی: یک سری، رنگِ اسلات ۱، عدد سرِ میله ─────────────────

export interface BarRow {
  label: string;
  value: number;
  valueText: string;
  tipLines: string[];
  onClick?: () => void;
}

export function barListChart(parent: HTMLElement, rows: BarRow[], tooltip: ChartTooltip): void {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const wrap = parent.createDiv({ cls: "pm-db-bars" });

  for (const row of rows) {
    const line = wrap.createDiv({ cls: "pm-db-brow" });
    line.createDiv({ cls: "pm-db-blabel", text: row.label });
    const track = line.createDiv({ cls: "pm-db-btrack" });
    const fill = track.createDiv({ cls: "pm-db-bfill" });
    fill.style.width = `${Math.max(1.5, (row.value / max) * 100)}%`;
    line.createDiv({ cls: "pm-db-bval", text: row.valueText });

    tooltip.attach(line, () => row.tipLines);
    if (row.onClick) {
      line.addClass("pm-db-clickable");
      line.addEventListener("click", row.onClick);
      line.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.onClick?.(); }
      });
    }
  }
}

// ── میله‌ی انباشته + لجند (لجند همیشه هست، چون بیش از یک سری داریم) ───────

export interface StackSegment {
  label: string;
  value: number;
  color: string;
  tipLines: string[];
}

export function stackedBar(parent: HTMLElement, segments: StackSegment[], tooltip: ChartTooltip): void {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const wrap = parent.createDiv({ cls: "pm-db-stackwrap" });
  const bar = wrap.createDiv({ cls: "pm-db-stack" });

  if (total === 0) {
    bar.createDiv({ cls: "pm-db-stack-empty" });
  } else {
    for (const seg of segments) {
      if (seg.value <= 0) continue;
      const el = bar.createDiv({ cls: "pm-db-seg" });
      el.style.flexGrow = String(seg.value);
      el.style.background = seg.color;
      tooltip.attach(el, () => seg.tipLines);
    }
  }

  // برچسب داخل قطعه نمی‌ذاریم (قطعه‌های کوچک متن رو می‌برن) — لجند حاملِ هویته
  const legend = wrap.createDiv({ cls: "pm-db-legend" });
  for (const seg of segments) {
    const item = legend.createDiv({ cls: "pm-db-legitem" });
    const dot = item.createSpan({ cls: "pm-db-legdot" });
    dot.style.background = seg.color;
    item.createSpan({ cls: "pm-db-legname", text: seg.label });
    item.createSpan({ cls: "pm-db-legval", text: String(seg.value) });
  }
}

// ── تقویم شمسی ───────────────────────────────────────────────────────────
// سه حالت، دقیقاً مثل HabitCalendar والت: هفتگی (dots)، ماهانه/فصلی (grid)،
// سالانه (heatmap). رنگ = شدت، از رمپ تک‌رنگِ pm-heat.

export type CalendarMode = "dots" | "grid" | "heatmap";

/** آستانه‌های ثابت به ساعت — عمداً وابسته به max بازه نیستن تا رنگ یک روز
 *  با عوض‌شدن فیلتر تغییر نکنه. */
const HEAT_STOPS = [1, 2.5, 4, 6];

export function heatBin(hours: number): number {
  if (hours <= 0) return 0;
  for (let i = 0; i < HEAT_STOPS.length; i++) if (hours <= HEAT_STOPS[i]) return i + 1;
  return HEAT_STOPS.length + 1;
}

export interface CalendarOptions {
  days: string[];
  hoursByDay: Map<string, number>;
  todayISO: string;
  selectedISO: string | null;
  mode: CalendarMode;
  tooltip: ChartTooltip;
  tipFor: (iso: string) => string[];
  onSelect: (iso: string) => void;
}

export function renderCalendar(parent: HTMLElement, opts: CalendarOptions): void {
  const wrap = parent.createDiv({ cls: `pm-db-cal pm-db-cal-${opts.mode}` });
  if (opts.mode === "dots") renderCalDots(wrap, opts);
  else if (opts.mode === "heatmap") renderCalHeatmap(wrap, opts);
  else renderCalGrid(wrap, opts);
}

function applyCell(cell: HTMLElement, iso: string, opts: CalendarOptions): void {
  const hours = opts.hoursByDay.get(iso) ?? 0;
  cell.setAttribute("data-heat", String(heatBin(hours)));
  if (iso === opts.todayISO) cell.addClass("is-today");
  if (iso === opts.selectedISO) cell.addClass("is-selected");
  opts.tooltip.attach(cell, () => opts.tipFor(iso));
  cell.addEventListener("click", () => opts.onSelect(iso));
  cell.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opts.onSelect(iso); }
  });
}

function renderCalDots(wrap: HTMLElement, opts: CalendarOptions): void {
  const row = wrap.createDiv({ cls: "pm-db-caldays" });
  for (const iso of opts.days) {
    const day = row.createDiv({ cls: "pm-db-calday" });
    day.createDiv({ cls: "pm-db-caldn", text: WEEKDAYS_FA[weekdayCol(iso)] });
    const dot = day.createDiv({ cls: "pm-db-caldot" });
    const hours = opts.hoursByDay.get(iso) ?? 0;
    dot.textContent = hours > 0 ? formatHours(hours).replace(/\s.*/, "") : "–";
    applyCell(dot, iso, opts);
    day.createDiv({ cls: "pm-db-caldd", text: toPersianDigits(isoToJalali(iso).jd) });
  }
}

function renderCalGrid(wrap: HTMLElement, opts: CalendarOptions): void {
  for (const group of groupByJalaliMonth(opts.days)) {
    const section = wrap.createDiv({ cls: "pm-db-calmonth" });
    section.createDiv({ cls: "pm-db-calmtitle", text: jalaliMonthLabel(group.jy, group.jm) });

    const hdr = section.createDiv({ cls: "pm-db-calhdr" });
    WEEKDAYS_FA.forEach((d) => hdr.createDiv({ cls: "pm-db-calwday", text: d }));

    const grid = section.createDiv({ cls: "pm-db-calgrid" });
    const startCol = jalaliFirstWeekdayCol(group.jy, group.jm);
    // اگر بازه از وسط ماه شروع شده، فقط تا اولین روزِ موجود جلو می‌ریم
    const firstJd = isoToJalali(group.isos[0]).jd;
    const lead = (startCol + firstJd - 1) % 7;
    for (let i = 0; i < lead; i++) grid.createDiv({ cls: "pm-db-calcell is-empty" });

    for (const iso of group.isos) {
      const cell = grid.createDiv({ cls: "pm-db-calcell" });
      cell.textContent = toPersianDigits(isoToJalali(iso).jd);
      applyCell(cell, iso, opts);
    }
  }
}

function renderCalHeatmap(wrap: HTMLElement, opts: CalendarOptions): void {
  for (const group of groupByJalaliMonth(opts.days)) {
    const row = wrap.createDiv({ cls: "pm-db-hmrow" });
    row.createDiv({ cls: "pm-db-hmlbl", text: MONTHS_SHORT_FA[group.jm - 1] });
    const cells = row.createDiv({ cls: "pm-db-hmcells" });

    const startCol = jalaliFirstWeekdayCol(group.jy, group.jm);
    const firstJd = isoToJalali(group.isos[0]).jd;
    const lead = (startCol + firstJd - 1) % 7;
    for (let i = 0; i < lead; i++) cells.createDiv({ cls: "pm-db-hmcell is-empty" });

    for (const iso of group.isos) {
      const cell = cells.createDiv({ cls: "pm-db-hmcell" });
      applyCell(cell, iso, opts);
    }
  }
}

/** راهنمای مقیاسِ رمپ — برای رمزگذاری پیوسته اجباریه */
export function heatLegend(parent: HTMLElement): void {
  const legend = parent.createDiv({ cls: "pm-db-heatlegend" });
  legend.createSpan({ cls: "pm-db-heatlabel", text: "Less" });
  const scale = legend.createDiv({ cls: "pm-db-heatscale" });
  const titles = ["No time logged", "up to 1h", "1–2.5h", "2.5–4h", "4–6h", "over 6h"];
  for (let bin = 0; bin <= 5; bin++) {
    const swatch = scale.createDiv({ cls: "pm-db-heatswatch" });
    swatch.setAttribute("data-heat", String(bin));
    swatch.setAttribute("title", titles[bin]);
    swatch.setAttribute("aria-label", titles[bin]);
  }
  legend.createSpan({ cls: "pm-db-heatlabel", text: "More" });
}

export function jalaliDayTitle(iso: string): string {
  return `${weekdayLabel(iso)}، ${jalaliLabel(iso)}`;
}
