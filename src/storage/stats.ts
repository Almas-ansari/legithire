/** "Labels seen today" counters for the popup. Stores counts only. */
import type { Label } from '../types';

export interface DayStats {
  date: string;
  counts: Partial<Record<Label, number>>;
}

export function today(now = new Date()): string {
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 10);
}

export function addSeen(stats: DayStats | undefined, label: Label, date = today()): DayStats {
  const base = stats?.date === date ? stats : { date, counts: {} };
  return { date, counts: { ...base.counts, [label]: (base.counts[label] ?? 0) + 1 } };
}

export async function loadStats(): Promise<DayStats> {
  const { stats } = (await chrome.storage.local.get('stats')) as { stats?: DayStats };
  return stats?.date === today() ? stats : { date: today(), counts: {} };
}
