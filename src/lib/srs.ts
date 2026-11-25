/**
 * 間隔反復（Spaced Repetition）スケジューラ。
 * SM-2 を簡略化したもの。カードごとに「暗記レベル」を持ち、
 * レベルが上がるほど穴埋めで隠す範囲が広がり、最終的に全文暗唱になる。
 *
 *   Lv0 通読（新規カード）
 *   Lv1 穴埋め（重要単語すべて＋ほかの句の40%）
 *   Lv2 穴埋め（重要単語すべて＋ほかの句の70%）
 *   Lv3 頭文字ヒントのみ（全部隠す・各句の1文字目だけ表示）
 *   Lv4 全文暗唱（見出しだけ表示）
 */
import { addDays, diffDays } from "./date";

export type Grade = 0 | 1 | 2 | 3; // もう一度 / 難しい / できた / 簡単

export const GRADE_LABEL: Record<Grade, string> = {
  0: "もう一度",
  1: "あやふや",
  2: "できた",
  3: "楽勝",
};

export const MAX_LEVEL = 4;

export const LEVEL_LABEL = ["通読", "穴埋め（基本）", "穴埋め（多め）", "頭文字ヒント", "全文暗唱"];

/** 「覚えた」とみなす条件: 全文暗唱レベルで、次の復習まで2週間以上空いている */
export const MASTERED_INTERVAL = 14;

export const MAX_INTERVAL = 90;

export interface CardState {
  /** 学習開始日 */
  introduced: string;
  level: number;
  /** 次回までの間隔（日） 0 = 当日中にもう一度 */
  interval: number;
  ease: number;
  due: string;
  reps: number;
  lapses: number;
  lastReviewed?: string;
}

export function newCardState(day: string): CardState {
  return {
    introduced: day,
    level: 0,
    interval: 0,
    ease: 2.5,
    due: day,
    reps: 0,
    lapses: 0,
  };
}

/** 新規カードを通読し終えたとき: Lv1 にして当日中に穴埋めで確認 */
export function afterFirstRead(s: CardState, day: string): CardState {
  return { ...s, level: 1, interval: 0, due: day, lastReviewed: day };
}

export function review(s: CardState, grade: Grade, day: string): CardState {
  let { level, interval, ease, lapses } = s;
  switch (grade) {
    case 0:
      lapses += 1;
      level = Math.max(1, level - 1);
      interval = 0;
      ease = Math.max(1.3, ease - 0.2);
      break;
    case 1:
      interval = interval === 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
      ease = Math.max(1.3, ease - 0.15);
      break;
    case 2:
      level = Math.min(MAX_LEVEL, level + 1);
      interval = interval === 0 ? 1 : interval === 1 ? 3 : Math.round(interval * ease);
      break;
    case 3:
      level = Math.min(MAX_LEVEL, level + 2);
      interval = interval === 0 ? 3 : Math.round(interval * ease * 1.3);
      ease = Math.min(3.0, ease + 0.15);
      break;
  }
  // 暗唱レベルに達するまでは間隔を短めに抑える（段階を踏んで定着させる）
  if (level < MAX_LEVEL) interval = Math.min(interval, 2 + level * 2);
  interval = Math.min(interval, MAX_INTERVAL);
  return {
    ...s,
    level,
    interval,
    ease,
    lapses,
    reps: s.reps + 1,
    due: addDays(day, interval),
    lastReviewed: day,
  };
}

export function isMastered(s: CardState | undefined): boolean {
  return !!s && s.level >= MAX_LEVEL && s.interval >= MASTERED_INTERVAL;
}

export function isDue(s: CardState, day: string): boolean {
  return diffDays(s.due, day) >= 0;
}

/** 次回の間隔のプレビュー（ボタンに表示） */
export function previewInterval(s: CardState, grade: Grade, day: string): number {
  return review(s, grade, day).interval;
}
