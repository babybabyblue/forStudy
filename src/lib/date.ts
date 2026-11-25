/** 日付は "YYYY-MM-DD"（端末のローカル時刻）で扱う。深夜3時までは前日扱い。 */
export const DAY_START_HOUR = 3;

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function today(now: Date = new Date()): string {
  const d = new Date(now.getTime() - DAY_START_HOUR * 3600_000);
  return toDateStr(d);
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** b - a（日数） */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400_000);
}

export function addMonths(s: string, n: number): string {
  const d = parseDate(s);
  d.setMonth(d.getMonth() + n);
  return toDateStr(d);
}

export function formatJa(s: string): string {
  const d = parseDate(s);
  const w = "日月火水木金土"[d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${w})`;
}

export function formatJaLong(s: string): string {
  const d = parseDate(s);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
