import kijun from "../data/kijun.json";
import type { MemoCard, MemoSubject, QuizSubject, Subject } from "./types";

const kanteiTheory: MemoSubject = {
  id: "kantei",
  kind: "memo",
  name: "鑑定評価理論（不動産鑑定評価基準・留意事項）",
  shortName: "鑑定評価理論",
  description: "論文式試験に向けて、基準本文と運用上の留意事項を重要度の高い順に暗記します。",
  sourceNote: `国土交通省「不動産鑑定評価基準」「不動産鑑定評価基準運用上の留意事項」（${kijun.meta.version}）`,
  sourceUrls: kijun.meta.sourceUrls,
  sourceLabels: { kijun: "基準", ryuui: "留意事項" },
  cards: kijun.cards as MemoCard[],
  keyTerms: kijun.keyTerms,
};

/** 行政法規（短答式）。問題データは今後 src/data/gyosei.json として追加予定 */
const gyosei: QuizSubject = {
  id: "gyosei",
  kind: "quiz",
  name: "行政法規（短答式）",
  shortName: "行政法規",
  description: "短答式試験の行政法規を一問一答・択一で学習する機能（準備中）。",
  questions: [],
  comingSoon: true,
};

export const SUBJECTS: Subject[] = [kanteiTheory, gyosei];

export function getSubject(id: string): Subject | undefined {
  return SUBJECTS.find((s) => s.id === id);
}
