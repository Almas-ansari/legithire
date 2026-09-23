const UNIT_HOURS: Record<string, number> = {
  s: 1 / 3600,
  sec: 1 / 3600,
  second: 1 / 3600,
  m: 1 / 60,
  min: 1 / 60,
  minute: 1 / 60,
  h: 1,
  hr: 1,
  hour: 1,
  d: 24,
  day: 24,
  w: 24 * 7,
  wk: 24 * 7,
  week: 24 * 7,
  mo: 24 * 30,
  month: 24 * 30,
  y: 24 * 365,
  yr: 24 * 365,
  year: 24 * 365,
};

/**
 * Parse LinkedIn's relative age ("5h", "2d", "1w", "3mo", "1yr", "30m",
 * "5 hours ago • Edited", "Just now") into hours. Note LinkedIn uses "m" for
 * minutes and "mo" for months. Returns null when nothing parses.
 */
export function parseAgeHours(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = raw.toLowerCase().trim();
  if (/^(just\s+)?now\b/.test(text) || text.startsWith('just now')) return 0;

  const m = text.match(/(\d+)\s*(mo|months?|yrs?|years?|y|wks?|weeks?|w|days?|d|hrs?|hours?|h|mins?|minutes?|m|secs?|seconds?|s)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  const rawUnit = m[2]!;
  const unit = rawUnit.length > 2 && rawUnit.endsWith('s') ? rawUnit.slice(0, -1) : rawUnit;
  const hours = UNIT_HOURS[unit];
  return hours === undefined ? null : n * hours;
}

/** Short display form: "just now", "40m", "5h", "3d", "2w", "4mo". */
export function formatAge(hours: number): string {
  if (hours < 1 / 60) return 'just now';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  if (hours < 24 * 7) return `${Math.round(hours / 24)}d`;
  if (hours < 24 * 30) return `${Math.round(hours / (24 * 7))}w`;
  if (hours < 24 * 365) return `${Math.round(hours / (24 * 30))}mo`;
  return `${Math.round(hours / (24 * 365))}y`;
}

/** "1,234" / "1.2K" / "3M" / "12 comments" -> number. Null when absent. */
export function parseCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([km])?/i);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = m[2]?.toLowerCase() === 'k' ? 1_000 : m[2]?.toLowerCase() === 'm' ? 1_000_000 : 1;
  return Math.round(n * mult);
}
