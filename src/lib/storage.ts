/**
 * 学習データの保存（端末の localStorage）。
 * 科目ごとに独立して保存するので、行政法規を追加しても干渉しない。
 */
import type { CardOverrides, PlanSettings } from "./plan";
import type { CardState } from "./srs";
import { addMonths, today } from "./date";

export const STORAGE_KEY = "kantei-study:v1";

export interface DayLog {
  reviews: number;
  newCards: number;
  /** 学習時間（秒） */
  seconds: number;
}

export interface SubjectProgress {
  cards: Record<string, CardState>;
  overrides: CardOverrides;
  log: Record<string, DayLog>;
}

export interface AppData {
  version: 1;
  plan: PlanSettings;
  subjects: Record<string, SubjectProgress>;
  ui: { fontSize: number };
}

export function defaultPlan(day = today()): PlanSettings {
  return {
    startDate: day,
    targetDate: addMonths(day, 6),
    reviewBufferDays: 30,
    maxNewCharsPerDay: 0,
  };
}

export function emptySubject(): SubjectProgress {
  return { cards: {}, overrides: { importance: {}, suspended: {} }, log: {} };
}

export function defaultData(): AppData {
  return { version: 1, plan: defaultPlan(), subjects: {}, ui: { fontSize: 17 } };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    return migrate(JSON.parse(raw));
  } catch {
    return defaultData();
  }
}

export function saveData(d: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function migrate(d: unknown): AppData {
  const base = defaultData();
  if (!d || typeof d !== "object") return base;
  const x = d as Partial<AppData>;
  return {
    version: 1,
    plan: { ...base.plan, ...(x.plan ?? {}) },
    subjects: Object.fromEntries(
      Object.entries(x.subjects ?? {}).map(([k, v]) => [
        k,
        {
          ...emptySubject(),
          ...v,
          overrides: { ...emptySubject().overrides, ...(v?.overrides ?? {}) },
        },
      ]),
    ),
    ui: { ...base.ui, ...(x.ui ?? {}) },
  };
}

export function exportJson(d: AppData): string {
  return JSON.stringify({ ...d, exportedAt: new Date().toISOString() }, null, 1);
}

export function importJson(text: string): AppData {
  const parsed = JSON.parse(text);
  if (!parsed || parsed.version !== 1 || typeof parsed.subjects !== "object") {
    throw new Error("このアプリのバックアップファイルではないようです");
  }
  return migrate(parsed);
}
