/**
 * 科目（Subject）の共通定義。
 * 鑑定評価理論（暗記カード型）に加え、今後「行政法規（短答・択一型）」を追加できるよう
 * 科目ごとに学習形式（kind）を持たせている。
 */

export type Importance = "S" | "A" | "B" | "C";

export const IMPORTANCE_ORDER: Importance[] = ["S", "A", "B", "C"];

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  S: "S 最重要",
  A: "A 重要",
  B: "B 標準",
  C: "C 低頻度",
};

/** 暗記カード（条文・基準本文の一区切り） */
export interface MemoCard {
  id: string;
  /** 出典の区分（例: kijun=基準本文, ryuui=運用上の留意事項） */
  source: string;
  /** 総論 / 各論 */
  part: string;
  /** 第n章 */
  chapter: string;
  title: string;
  /** 段落。"[[FIG]]{json}" は図表（画像）を表す */
  body: string[];
  importance: Importance;
  /** 本文の文字数（図表を除く） */
  chars: number;
}

/** 択一問題（行政法規などの短答式向け。今後追加予定） */
export interface QuizQuestion {
  id: string;
  /** 法令名（例: 国土利用計画法） */
  law: string;
  /** 条文番号など */
  article?: string;
  /** 問題文 */
  question: string;
  /** 選択肢。○×問題の場合は省略し answer に boolean を入れる */
  choices?: string[];
  /** 正解（選択肢のインデックス、または ○×） */
  answer: number | boolean;
  explanation?: string;
  importance: Importance;
}

interface SubjectBase {
  id: string;
  name: string;
  shortName: string;
  description: string;
  /** 出典表示 */
  sourceNote?: string;
  sourceUrls?: Record<string, string>;
  /** 出典区分の表示名 */
  sourceLabels?: Record<string, string>;
}

export interface MemoSubject extends SubjectBase {
  kind: "memo";
  cards: MemoCard[];
}

export interface QuizSubject extends SubjectBase {
  kind: "quiz";
  questions: QuizQuestion[];
  /** 準備中の科目 */
  comingSoon?: boolean;
}

export type Subject = MemoSubject | QuizSubject;
