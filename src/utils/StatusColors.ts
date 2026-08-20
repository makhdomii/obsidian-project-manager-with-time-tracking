// status and priority colours come from the dashboard's validated palette (the
// --pm-cat-* and --pm-status-* tokens defined in styles/dashboardStyles.ts) rather
// than theme variables. These colours encode *data*: they have to agree between
// the kanban and the charts, and stay distinguishable under colour blindness.
// The tokens themselves carry separate light and dark values, so they follow the theme.

// The slot order is not arbitrary: this sequence (blue, orange, teal, red, purple)
// was checked with validate_palette — the worst neighbouring pair is ΔE 6.9, below
// the threshold, which is only allowed alongside a second encoding — hence the
// legends, labels and 2px gaps everywhere.
const STATUS_SLOT: Record<string, number> = {
  todo: 1,    // blue
  active: 2,  // orange
  done: 3,    // teal
  cancel: 8,  // red
  quite: 7,   // purple
};

/**
 * frontmatter status → canonical name. Lowercase and trim only; there is no
 * mapping from old names, because an old name means unmigrated data, not a synonym.
 */
export function normalizeStatus(status: unknown): string {
  return String(status ?? "").trim().toLowerCase();
}

/** Same rules as status — priorities are compared case-insensitively everywhere. */
export function normalizePriority(priority: unknown): string {
  return String(priority ?? "").trim().toLowerCase();
}

/** Deduped, canonical list for settings / columns / filters. */
export function normalizeList(values: string[], normalize: (v: unknown) => string): string[] {
  return [...new Set(values.map(normalize).filter(Boolean))];
}

// The palette's remaining slots serve user-defined statuses — a new colour is never
// invented, one of these eight is chosen.
const FALLBACK_SLOTS = [4, 5, 6];

const PRIORITY_TOKENS: Record<string, string> = {
  low: "var(--pm-status-good)",
  medium: "var(--pm-status-warning)",
  high: "var(--pm-status-serious)",
  critical: "var(--pm-status-critical)",
};

/** Stable hash — so a status does not change colour when others are filtered out */
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
  return PRIORITY_TOKENS[normalizePriority(priority)] ?? "var(--text-faint)";
}

// These statuses no longer need attention every time — they are shown muted
const MUTED_STATUSES = new Set(["done", "cancel", "quite"]);

export function isMutedStatus(status: string): boolean {
  return MUTED_STATUSES.has(normalizeStatus(status));
}
