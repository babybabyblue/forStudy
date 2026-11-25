/**
 * 学習計画（ペース配分）。
 * 目標日（既定: 開始から6か月）の「総仕上げ期間」前までに、全カードを
 * 重要度の高い順（S→A→B→C、同じ重要度内は基準の掲載順）で一通り学習開始できるよう、
 * 1日あたりの新規カード量を「文字数」ベースで自動計算する。
 */
import type { Importance, MemoCard } from "../subjects/types";
import { IMPORTANCE_ORDER } from "../subjects/types";
import { addDays, diffDays } from "./date";
import type { CardState } from "./srs";
import { isDue, isMastered } from "./srs";

export interface PlanSettings {
  startDate: string;
  /** 全範囲を覚え終える目標日 */
  targetDate: string;
  /** 目標日前の総仕上げ（新規なし・復習のみ）日数 */
  reviewBufferDays: number;
  /** 1日の新規の上限（文字数）。0 = 制限なし */
  maxNewCharsPerDay: number;
}

export interface CardOverrides {
  importance: Record<string, Importance>;
  suspended: Record<string, boolean>;
}

export function effectiveImportance(card: MemoCard, ov: CardOverrides): Importance {
  return ov.importance[card.id] ?? card.importance;
}

/** 学習順（新規カードを出す順番） */
export function learningOrder(cards: MemoCard[], ov: CardOverrides): MemoCard[] {
  const idx = new Map(cards.map((c, i) => [c.id, i]));
  return cards
    .filter((c) => !ov.suspended[c.id])
    .slice()
    .sort((a, b) => {
      const ia = IMPORTANCE_ORDER.indexOf(effectiveImportance(a, ov));
      const ib = IMPORTANCE_ORDER.indexOf(effectiveImportance(b, ov));
      if (ia !== ib) return ia - ib;
      return idx.get(a.id)! - idx.get(b.id)!;
    });
}

/** 新規学習を締め切る日（目標日 − 総仕上げ期間） */
export function introDeadline(p: PlanSettings): string {
  const d = addDays(p.targetDate, -p.reviewBufferDays);
  return diffDays(p.startDate, d) < 7 ? addDays(p.startDate, 7) : d;
}

const cardChars = (c: MemoCard) => Math.max(c.chars, 40);

export interface DailyQuota {
  /** 今日新しく始めるべきカード（まだ始めていないもの） */
  newCards: MemoCard[];
  /** 今日すでに始めたカード数 */
  introducedToday: number;
  /** 今日のノルマ（文字数） */
  quotaChars: number;
  /** 締切までの残り日数（今日を含む） */
  daysLeft: number;
}

export function dailyQuota(
  cards: MemoCard[],
  states: Record<string, CardState>,
  ov: CardOverrides,
  p: PlanSettings,
  day: string,
): DailyQuota {
  const order = learningOrder(cards, ov);
  const notStarted = order.filter((c) => !states[c.id]);
  const startedToday = order.filter((c) => states[c.id]?.introduced === day);
  const remainingAtDayStart =
    notStarted.reduce((s, c) => s + cardChars(c), 0) +
    startedToday.reduce((s, c) => s + cardChars(c), 0);

  const deadline = introDeadline(p);
  const daysLeft = Math.max(1, diffDays(day, deadline) + 1);
  let quotaChars = Math.ceil(remainingAtDayStart / daysLeft);
  if (p.maxNewCharsPerDay > 0) quotaChars = Math.min(quotaChars, p.maxNewCharsPerDay);

  const doneChars = startedToday.reduce((s, c) => s + cardChars(c), 0);
  const newCards: MemoCard[] = [];
  let acc = doneChars;
  for (const c of notStarted) {
    if (acc >= quotaChars) break;
    // ノルマを大きく超える場合は、少なくとも1枚は出すが2枚目以降は控える
    if (acc > 0 && acc + cardChars(c) > quotaChars * 1.4) break;
    newCards.push(c);
    acc += cardChars(c);
  }
  return { newCards, introducedToday: startedToday.length, quotaChars, daysLeft };
}

/** 前倒し学習用: 次に始めるカード */
export function nextNewCards(
  cards: MemoCard[],
  states: Record<string, CardState>,
  ov: CardOverrides,
  n: number,
): MemoCard[] {
  return learningOrder(cards, ov)
    .filter((c) => !states[c.id])
    .slice(0, n);
}

export function dueCards(
  cards: MemoCard[],
  states: Record<string, CardState>,
  ov: CardOverrides,
  day: string,
): MemoCard[] {
  const order = learningOrder(cards, ov);
  const pos = new Map(order.map((c, i) => [c.id, i]));
  return order
    .filter((c) => states[c.id] && states[c.id].level > 0 && isDue(states[c.id], day))
    .sort((a, b) => {
      const da = states[a.id].due;
      const db = states[b.id].due;
      if (da !== db) return da < db ? -1 : 1;
      return pos.get(a.id)! - pos.get(b.id)!;
    });
}

export interface Progress {
  totalCards: number;
  totalChars: number;
  startedCards: number;
  startedChars: number;
  masteredCards: number;
  masteredChars: number;
  /** 計画上、昨日までに始めているべき文字数 */
  plannedChars: number;
  byImportance: Record<Importance, { total: number; started: number; mastered: number }>;
}

export function progress(
  cards: MemoCard[],
  states: Record<string, CardState>,
  ov: CardOverrides,
  p: PlanSettings,
  day: string,
): Progress {
  const active = cards.filter((c) => !ov.suspended[c.id]);
  const byImportance = Object.fromEntries(
    IMPORTANCE_ORDER.map((k) => [k, { total: 0, started: 0, mastered: 0 }]),
  ) as Progress["byImportance"];
  let totalChars = 0, startedChars = 0, masteredChars = 0, startedCards = 0, masteredCards = 0;
  for (const c of active) {
    const s = states[c.id];
    const imp = byImportance[effectiveImportance(c, ov)];
    imp.total += c.chars;
    totalChars += c.chars;
    if (s) {
      startedCards++;
      startedChars += c.chars;
      imp.started += c.chars;
      if (isMastered(s)) {
        masteredCards++;
        masteredChars += c.chars;
        imp.mastered += c.chars;
      }
    }
  }
  const span = Math.max(1, diffDays(p.startDate, introDeadline(p)) + 1);
  // 昨日までに着手しておきたい量（今日の分はまだやっていなくても遅れ扱いにしない）
  const elapsed = Math.min(span, Math.max(0, diffDays(p.startDate, day)));
  return {
    totalCards: active.length,
    totalChars,
    startedCards,
    startedChars,
    masteredCards,
    masteredChars,
    plannedChars: Math.round((totalChars * elapsed) / span),
    byImportance,
  };
}
