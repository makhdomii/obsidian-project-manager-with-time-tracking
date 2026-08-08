// ╔══════════════════════════════════════════════════════════════════════╗
// ║  استایل داشبورد + توکن‌های رنگِ داده                                   ║
// ║  «کروم» (پس‌زمینه، متن، خط‌ها) از متغیرهای خود اوبسیدین میاد تا با هر  ║
// ║  تمی جفت بشه؛ ولی «رنگِ داده» از پالت ثابتِ اعتبارسنجی‌شده میاد، چون   ║
// ║  باید بین چارت‌ها یکی باشه و زیر کوررنگی جدا بمونه.                   ║
// ╚══════════════════════════════════════════════════════════════════════╝

export const DASHBOARD_STYLES = `
/* ===== توکن‌های پالت — تم روشن ===== */
body {
  --pm-cat-1:#2a78d6; --pm-cat-2:#eb6834; --pm-cat-3:#1baf7a; --pm-cat-4:#eda100;
  --pm-cat-5:#e87ba4; --pm-cat-6:#008300; --pm-cat-7:#4a3aa7; --pm-cat-8:#e34948;

  --pm-status-good:#0ca30c; --pm-status-warning:#fab219;
  --pm-status-serious:#ec835a; --pm-status-critical:#d03b3b;

  /* رمپ تک‌رنگ آبی برای شدت — کم‌رنگ‌ترین پله نزدیک سطحه */
  --pm-heat-1:#cde2fb; --pm-heat-2:#9ec5f4; --pm-heat-3:#5598e7;
  --pm-heat-4:#2a78d6; --pm-heat-5:#184f95;
}
/* در تم تاریک همون هشت رنگ برای سطح تیره پله‌گذاری شده — نه معکوسِ خودکار.
   رمپ شدت هم برعکس می‌شه: «نزدیک صفر» باید به سطح نزدیک باشه، که اینجا تیره‌ست. */
body.theme-dark {
  --pm-cat-1:#3987e5; --pm-cat-2:#d95926; --pm-cat-3:#199e70; --pm-cat-4:#c98500;
  --pm-cat-5:#d55181; --pm-cat-6:#008300; --pm-cat-7:#9085e9; --pm-cat-8:#e66767;

  --pm-heat-1:#104281; --pm-heat-2:#1c5cab; --pm-heat-3:#256abf;
  --pm-heat-4:#3987e5; --pm-heat-5:#86b6ef;
}

/* ===== اسکلت داشبورد ===== */
.pm-dashboard-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  background: var(--background-primary);
  font-family: var(--font-interface);
}

.pm-db-tabs {
  display: flex;
  gap: 2px;
  padding: 0 16px;
  background: var(--background-secondary);
  border-bottom: 1px solid var(--background-modifier-border);
}
.pm-db-tab {
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-size: 12.5px;
  font-weight: 600;
  padding: 9px 14px;
  cursor: pointer;
  transition: color .12s ease, border-color .12s ease;
}
.pm-db-tab:hover { color: var(--text-normal); }
.pm-db-tab.is-active { color: var(--text-normal); border-bottom-color: var(--interactive-accent); }

.pm-db-scroll { flex: 1; overflow-y: auto; padding: 18px 16px 28px; }

/* ===== پیمایش دوره ===== */
.pm-db-nav {
  display: flex; align-items: center; gap: 2px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 7px; padding: 1px;
  background: var(--background-primary);
}
.pm-db-navbtn, .pm-db-navtoday {
  appearance: none; background: transparent; border: none; cursor: pointer;
  color: var(--text-muted); border-radius: 5px; padding: 3px 8px;
}
.pm-db-navbtn { font-size: 16px; line-height: 1; min-width: 24px; }
.pm-db-navtoday {
  font-size: 11px; font-weight: 600;
  border-inline-start: 1px solid var(--background-modifier-border);
  border-radius: 0 5px 5px 0; margin-inline-start: 2px;
}
.pm-db-navbtn:hover:not(:disabled), .pm-db-navtoday:hover:not(:disabled) {
  background: var(--background-modifier-hover); color: var(--text-normal);
}
.pm-db-navbtn:disabled, .pm-db-navtoday:disabled { opacity: .35; cursor: default; }
.pm-db-navlabel {
  font-size: 12px; font-weight: 600; color: var(--text-normal);
  min-width: 104px; text-align: center; unicode-bidi: plaintext;
}

.pm-db-more {
  font-size: 11px; color: var(--text-faint); padding: 7px 8px 1px; text-align: center;
}

.pm-db-section { margin-bottom: 20px; }
.pm-db-sectitle {
  font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  color: var(--text-faint); margin: 0 2px 10px;
}

/* ===== عدد قهرمان + کاشی‌ها ===== */
.pm-db-headline {
  display: flex; flex-wrap: wrap; align-items: stretch; gap: 14px; margin-bottom: 18px;
}
.pm-db-hero {
  flex: 1 1 240px;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 12px;
  padding: 16px 18px;
}
.pm-db-hero-label { font-size: 11.5px; color: var(--text-muted); margin-bottom: 4px; }
.pm-db-hero-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
/* ارقام متناسب (نه tabular) — عدد بزرگ با عرض یکسانِ ارقام شل به نظر می‌رسه */
.pm-db-hero-value { font-size: 48px; font-weight: 650; line-height: 1.05; color: var(--text-normal); }
.pm-db-hero-unit { font-size: 15px; color: var(--text-muted); }
.pm-db-hero-sub { font-size: 11.5px; color: var(--text-faint); margin-top: 6px; unicode-bidi: plaintext; }

.pm-db-delta { font-size: 12px; font-weight: 700; margin-inline-start: 4px; }
.pm-db-delta-up { color: var(--pm-status-good); }
.pm-db-delta-down { color: var(--pm-status-critical); }
.pm-db-delta-flat { color: var(--text-faint); }

.pm-db-tiles {
  flex: 2 1 420px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 10px;
}
.pm-db-tile {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex; flex-direction: column; justify-content: center;
}
.pm-db-tile-label { font-size: 11px; color: var(--text-muted); margin-bottom: 3px; }
.pm-db-tile-row { display: flex; align-items: baseline; gap: 5px; }
.pm-db-tile-value { font-size: 22px; font-weight: 650; color: var(--text-normal); line-height: 1.15; }
.pm-db-tile-unit { font-size: 11.5px; color: var(--text-muted); }
.pm-db-tile-sub { font-size: 10.5px; color: var(--text-faint); margin-top: 3px; unicode-bidi: plaintext; }
.pm-db-tone-warn .pm-db-tile-value { color: var(--pm-status-warning); }
.pm-db-tone-critical .pm-db-tile-value { color: var(--pm-status-critical); }

/* ===== کارت چارت ===== */
.pm-db-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
  gap: 14px;
}
.pm-db-card {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 12px;
  padding: 14px 15px 15px;
  min-width: 0;
}
.pm-db-card.pm-db-wide { grid-column: 1 / -1; }
.pm-db-cardhead {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 10px; margin-bottom: 12px;
}
.pm-db-cardtitle { font-size: 13px; font-weight: 650; color: var(--text-normal); }
.pm-db-cardsub { font-size: 11px; color: var(--text-faint); margin-top: 2px; unicode-bidi: plaintext; }
.pm-db-toggle {
  appearance: none; background: transparent; cursor: pointer;
  border: 1px solid var(--background-modifier-border); border-radius: 6px;
  color: var(--text-muted); font-size: 10.5px; font-weight: 600; padding: 3px 9px;
  flex-shrink: 0;
}
.pm-db-toggle:hover { background: var(--background-modifier-hover); color: var(--text-normal); }

.pm-db-tablewrap { overflow-x: auto; }
.pm-db-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.pm-db-table th, .pm-db-table td {
  text-align: start; padding: 5px 8px;
  border-bottom: 1px solid var(--background-modifier-border);
  unicode-bidi: plaintext; white-space: nowrap;
}
.pm-db-table th { color: var(--text-muted); font-weight: 600; }
.pm-db-table td { color: var(--text-normal); font-variant-numeric: tabular-nums; }

/* ===== چارت ستونی ===== */
.pm-db-plot { display: flex; gap: 8px; padding-bottom: 20px; }
.pm-db-yaxis {
  display: flex; flex-direction: column; justify-content: space-between;
  height: 150px; min-width: 26px; text-align: end;
  font-size: 10px; color: var(--text-faint); font-variant-numeric: tabular-nums;
}
.pm-db-ytick { line-height: 1; }
.pm-db-plotarea { position: relative; flex: 1; height: 150px; min-width: 0; }
.pm-db-grid { position: absolute; inset: 0; }
.pm-db-gridline {
  position: absolute; left: 0; right: 0; height: 1px;
  background: var(--background-modifier-border);
}
.pm-db-cols { position: absolute; inset: 0; display: flex; align-items: flex-end; gap: 2px; }
.pm-db-col {
  flex: 1 1 0; min-width: 0; height: 100%;
  display: flex; flex-direction: column; justify-content: flex-end;
  position: relative; border-radius: 4px;
}
.pm-db-col:hover, .pm-db-col:focus-visible {
  background: var(--background-modifier-hover); outline: none;
}
.pm-db-col:focus-visible { box-shadow: 0 0 0 2px var(--interactive-accent); }
.pm-db-bar {
  width: 100%; max-width: 24px; margin: 0 auto;
  background: var(--pm-cat-1);
  border-radius: 4px 4px 0 0;
}
.pm-db-bar-zero { background: var(--background-modifier-border); border-radius: 2px; }
.pm-db-xlabel {
  position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  margin-top: 5px; font-size: 9.5px; color: var(--text-faint);
  white-space: nowrap; pointer-events: none; unicode-bidi: plaintext;
}

/* ===== میله‌های افقی ===== */
.pm-db-bars { display: flex; flex-direction: column; gap: 4px; }
.pm-db-brow {
  display: grid; grid-template-columns: minmax(80px, 32%) 1fr auto;
  gap: 10px; align-items: center; padding: 4px 5px; border-radius: 6px;
}
.pm-db-brow:hover, .pm-db-brow:focus-visible { background: var(--background-modifier-hover); outline: none; }
.pm-db-brow:focus-visible { box-shadow: 0 0 0 2px var(--interactive-accent); }
.pm-db-blabel {
  font-size: 11.5px; color: var(--text-normal);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; unicode-bidi: plaintext;
}
.pm-db-btrack {
  height: 10px; border-radius: 5px; min-width: 0;
  background: var(--background-modifier-border);
}
.pm-db-bfill { height: 10px; background: var(--pm-cat-1); border-radius: 0 5px 5px 0; }
.pm-db-bval {
  font-size: 11px; color: var(--text-muted); font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ===== میله‌ی انباشته + لجند ===== */
.pm-db-stackwrap { display: flex; flex-direction: column; gap: 12px; }
/* جداکننده‌ی قطعه‌ها فاصله‌ی ۲px به رنگ سطحه، نه خط دور مارک */
.pm-db-stack { display: flex; gap: 2px; height: 14px; }
.pm-db-seg { min-width: 3px; }
.pm-db-seg:first-child { border-radius: 4px 0 0 4px; }
.pm-db-seg:last-child { border-radius: 0 4px 4px 0; }
.pm-db-seg:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: 2px; }
.pm-db-stack-empty {
  flex: 1; border-radius: 4px; background: var(--background-modifier-border);
}
.pm-db-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; }
.pm-db-legitem { display: flex; align-items: center; gap: 6px; font-size: 11px; }
.pm-db-legdot { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; }
.pm-db-legname { color: var(--text-muted); text-transform: capitalize; }
.pm-db-legval { color: var(--text-normal); font-weight: 650; font-variant-numeric: tabular-nums; }

/* ===== تقویم شمسی ===== */
.pm-db-cal { direction: rtl; }
.pm-db-cal-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 18px; }
.pm-db-calmtitle {
  font-size: 12px; font-weight: 650; color: var(--text-normal); margin-bottom: 7px; text-align: center;
}
.pm-db-calhdr, .pm-db-calgrid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.pm-db-calhdr { margin-bottom: 3px; }
.pm-db-calwday { font-size: 10px; color: var(--text-faint); text-align: center; }
.pm-db-calcell {
  aspect-ratio: 1; border-radius: 5px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-variant-numeric: tabular-nums;
  transition: transform .08s ease;
}
.pm-db-calcell.is-empty { background: transparent !important; cursor: default; pointer-events: none; }
.pm-db-calcell:hover { transform: scale(1.08); }
.pm-db-calcell.is-today { outline: 2px solid var(--text-accent); outline-offset: -2px; }
.pm-db-calcell.is-selected { outline: 2px solid var(--text-normal); outline-offset: 1px; }
.pm-db-calcell:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: 1px; }

.pm-db-caldays { display: flex; flex-wrap: wrap; gap: 8px; }
.pm-db-calday { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.pm-db-caldn, .pm-db-caldd { font-size: 10px; color: var(--text-faint); }
.pm-db-caldot {
  width: 44px; height: 44px; border-radius: 10px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 11.5px; font-weight: 600;
}
.pm-db-caldot.is-today { outline: 2px solid var(--text-accent); outline-offset: -2px; }
.pm-db-caldot.is-selected { outline: 2px solid var(--text-normal); outline-offset: 1px; }

.pm-db-hmrow { display: flex; align-items: center; gap: 4px; margin-bottom: 3px; }
.pm-db-hmlbl { width: 26px; font-size: 10px; color: var(--text-faint); text-align: left; flex-shrink: 0; }
.pm-db-hmcells { display: flex; gap: 3px; flex-wrap: nowrap; }
.pm-db-hmcell { width: 13px; height: 13px; border-radius: 3px; flex-shrink: 0; cursor: pointer; }
.pm-db-hmcell.is-empty { background: transparent !important; cursor: default; pointer-events: none; }
.pm-db-hmcell.is-today { outline: 2px solid var(--text-accent); outline-offset: -2px; }
.pm-db-hmcell.is-selected { outline: 2px solid var(--text-normal); outline-offset: 1px; }

/* پله‌های شدت — هم برای سلول تقویم، هم برای راهنمای مقیاس */
.pm-dashboard-container [data-heat="0"] { background: var(--background-modifier-border); color: var(--text-faint); }
.pm-dashboard-container [data-heat="1"] { background: var(--pm-heat-1); }
.pm-dashboard-container [data-heat="2"] { background: var(--pm-heat-2); }
.pm-dashboard-container [data-heat="3"] { background: var(--pm-heat-3); }
.pm-dashboard-container [data-heat="4"] { background: var(--pm-heat-4); }
.pm-dashboard-container [data-heat="5"] { background: var(--pm-heat-5); }
/* متنِ داخل سلولِ رنگی بر اساس روشناییِ همون پله انتخاب می‌شه */
.pm-db-calcell[data-heat="1"], .pm-db-calcell[data-heat="2"],
.pm-db-caldot[data-heat="1"], .pm-db-caldot[data-heat="2"] { color: #0b0b0b; }
.pm-db-calcell[data-heat="3"], .pm-db-calcell[data-heat="4"], .pm-db-calcell[data-heat="5"],
.pm-db-caldot[data-heat="3"], .pm-db-caldot[data-heat="4"], .pm-db-caldot[data-heat="5"] { color: #ffffff; }
body.theme-dark .pm-db-calcell[data-heat="1"], body.theme-dark .pm-db-calcell[data-heat="2"],
body.theme-dark .pm-db-calcell[data-heat="3"], body.theme-dark .pm-db-calcell[data-heat="4"],
body.theme-dark .pm-db-caldot[data-heat="1"], body.theme-dark .pm-db-caldot[data-heat="2"],
body.theme-dark .pm-db-caldot[data-heat="3"], body.theme-dark .pm-db-caldot[data-heat="4"] { color: #ffffff; }
body.theme-dark .pm-db-calcell[data-heat="5"], body.theme-dark .pm-db-caldot[data-heat="5"] { color: #0b0b0b; }

.pm-db-heatlegend { display: flex; align-items: center; gap: 7px; margin-top: 12px; }
.pm-db-heatlabel { font-size: 10.5px; color: var(--text-faint); }
.pm-db-heatscale { display: flex; gap: 3px; }
.pm-db-heatswatch { width: 13px; height: 13px; border-radius: 3px; }

/* ===== پنل جزئیات روز ===== */
.pm-db-daypanel {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 12px; padding: 14px 15px; margin-top: 14px;
}
.pm-db-dayhead {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  flex-wrap: wrap; margin-bottom: 10px;
}
.pm-db-daytitle { font-size: 14px; font-weight: 650; color: var(--text-normal); unicode-bidi: plaintext; }
.pm-db-daysub { font-size: 11px; color: var(--text-faint); font-variant-numeric: tabular-nums; }
.pm-db-daytotal { font-size: 15px; font-weight: 700; color: var(--text-normal); }

/* ===== لیست‌ها ===== */
.pm-db-list { display: flex; flex-direction: column; gap: 2px; }
.pm-db-item {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 8px; border-radius: 7px; cursor: pointer;
}
.pm-db-item:hover, .pm-db-item:focus-visible { background: var(--background-modifier-hover); outline: none; }
.pm-db-item:focus-visible { box-shadow: 0 0 0 2px var(--interactive-accent); }
.pm-db-item-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.pm-db-item-main { flex: 1; min-width: 0; }
.pm-db-item-title {
  font-size: 12px; color: var(--text-normal);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; unicode-bidi: plaintext;
}
.pm-db-item-meta {
  font-size: 10.5px; color: var(--text-faint); margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; unicode-bidi: plaintext;
}
.pm-db-item-val {
  font-size: 11px; color: var(--text-muted); font-variant-numeric: tabular-nums;
  white-space: nowrap; flex-shrink: 0;
}
.pm-db-item-val.is-overdue { color: var(--pm-status-critical); font-weight: 700; }

.pm-db-empty {
  padding: 18px 10px; text-align: center; font-size: 11.5px; color: var(--text-faint);
  border: 1.5px dashed var(--background-modifier-border); border-radius: 9px;
}

/* ===== تولتیپ ===== */
.pm-db-tip {
  position: absolute; z-index: 60; pointer-events: none; max-width: 260px;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px; padding: 7px 10px;
  box-shadow: 0 8px 22px rgba(0,0,0,0.24);
}
.pm-db-tip-head {
  font-size: 11.5px; font-weight: 650; color: var(--text-normal);
  margin-bottom: 3px; unicode-bidi: plaintext;
}
.pm-db-tip-row { font-size: 11px; color: var(--text-muted); unicode-bidi: plaintext; line-height: 1.5; }

.pm-db-clickable { cursor: pointer; }

@media (prefers-reduced-motion: reduce) {
  .pm-db-calcell, .pm-db-tab { transition: none; }
  .pm-db-calcell:hover { transform: none; }
}
`;
