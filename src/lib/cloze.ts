/**
 * 穴埋めの作成。
 *
 * 記憶の定着を優先した設計:
 *  - 重要単語（キーワード）は、穴埋めの段階（Lv1〜）では毎回すべて隠す。
 *  - それ以外は句読点・括弧で区切った「句」単位で、レベルに応じた割合を隠す。
 *    隠す句はカード・日付・復習回数で変わるので、毎回ちがう箇所を思い出す練習になる。
 *  - Lv3 は全部の句を隠して頭文字だけ、Lv4 は全文暗唱。
 */

export interface Seg {
  text: string;
  /** 重要単語か */
  term: boolean;
}

export interface Chunk {
  text: string;
  segs: Seg[];
  /** 句ごと隠す対象になりうるか（記号だけの句は対象外） */
  hideable: boolean;
  /** 重要単語を含むか */
  hasTerm: boolean;
}

/** 重要単語の照合用の正規表現（長い語を優先） */
export function compileTerms(terms: string[]): RegExp | null {
  const list = [...new Set(terms)].filter((t) => t.length >= 2).sort((a, b) => b.length - a.length);
  if (!list.length) return null;
  const esc = list.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(esc.join("|"), "gu");
}

/** 段落中の重要単語の位置 [開始, 終了) */
export function termSpans(text: string, re: RegExp | null): [number, number][] {
  if (!re) return [];
  const spans: [number, number][] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    spans.push([m.index, m.index + m[0].length]);
    if (m[0].length === 0) re.lastIndex++;
  }
  return spans;
}

function stripMarks(s: string) {
  return s.replace(/[、。，「」（）\s]/g, "");
}

/** 段落を句に分ける（重要単語の途中では切らない）。文字は一切落とさない。 */
export function splitChunks(text: string, re: RegExp | null = null): Chunk[] {
  const spans = termSpans(text, re);
  const insideTerm = (pos: number) => spans.some(([s, e]) => pos > s && pos < e);

  // 区切り位置: 「、。，」の直後、「（「」の直前
  const cuts: number[] = [];
  for (let i = 1; i < text.length; i++) {
    const prev = text[i - 1];
    const cur = text[i];
    if ((/[、。，]/.test(prev) || /[（「]/.test(cur)) && !insideTerm(i)) cuts.push(i);
  }
  const pieces: [number, number][] = [];
  let start = 0;
  for (const c of cuts) {
    pieces.push([start, c]);
    start = c;
  }
  pieces.push([start, text.length]);

  // 短すぎる句（2文字以下）は次とまとめる
  const merged: [number, number][] = [];
  let buf: [number, number] | null = null;
  for (const p of pieces) {
    buf = buf ? [buf[0], p[1]] : p;
    const t = text.slice(buf[0], buf[1]);
    if (stripMarks(t).length <= 2 && !/。$/.test(t)) continue;
    merged.push(buf);
    buf = null;
  }
  if (buf) merged.push(buf);

  // 長すぎる句（25字超）は助詞の後ろで分ける（重要単語の途中は避ける）
  const finalPieces: [number, number][] = [];
  for (const [s, e] of merged) {
    let cur = s;
    while (e - cur > 25) {
      const win = text.slice(cur + 10, cur + 22);
      const re2 = /(及び|並びに|又は|若しくは|において|における|により|による|として|ので|[をにはがでと])/gu;
      let cut = -1;
      let mm: RegExpExecArray | null;
      while ((mm = re2.exec(win))) {
        const pos = cur + 10 + mm.index + mm[0].length;
        if (!insideTerm(pos)) {
          cut = pos;
          break;
        }
      }
      if (cut < 0) break;
      finalPieces.push([cur, cut]);
      cur = cut;
    }
    finalPieces.push([cur, e]);
  }

  return finalPieces.map(([s, e]) => makeChunk(text, s, e, spans));
}

function makeChunk(text: string, s: number, e: number, spans: [number, number][]): Chunk {
  const segs: Seg[] = [];
  let pos = s;
  for (const [ts, te] of spans) {
    if (te <= s || ts >= e) continue;
    const a = Math.max(ts, s);
    const b = Math.min(te, e);
    if (a > pos) segs.push({ text: text.slice(pos, a), term: false });
    segs.push({ text: text.slice(a, b), term: true });
    pos = b;
  }
  if (pos < e) segs.push({ text: text.slice(pos, e), term: false });
  const t = text.slice(s, e);
  const core = stripMarks(t).replace(/^(（[０-９0-9ア-ン]+）|[①-⑳]|[０-９]+．)/, "");
  return { text: t, segs, hideable: core.length >= 2, hasTerm: segs.some((x) => x.term) };
}

/** 決定的な疑似乱数（同じ日・同じカード・同じ復習回数なら同じ穴になる） */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** レベルごとの「重要単語以外の句」を隠す割合 */
export const HIDE_RATIO = [0, 0.4, 0.7, 1, 1];

/** 重要単語を毎回すべて隠すか */
export const hideAllTerms = (level: number) => level >= 1;

/**
 * 句ごと隠すかどうか（true の句は句全体を隠す）。
 * 重要単語は、句が隠れていなくても hideAllTerms(level) なら個別に隠す。
 */
export function chooseHidden(chunks: Chunk[], level: number, seed: string): boolean[] {
  const ratio = HIDE_RATIO[Math.min(level, HIDE_RATIO.length - 1)];
  const cand = chunks.map((c, i) => (c.hideable ? i : -1)).filter((i) => i >= 0);
  const n = Math.round(cand.length * ratio);
  const rnd = seededRandom(seed);
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cand[i], cand[j]] = [cand[j], cand[i]];
  }
  const hide = new Set(cand.slice(0, n));
  return chunks.map((_, i) => hide.has(i));
}

/** 頭文字ヒント: 先頭の記号・番号＋1文字だけ残す */
export function hintOf(text: string): { shown: string; hidden: string } {
  const m = text.match(/^((?:（[０-９0-9ア-ン]+）|[①-⑳]|[０-９]+．|[「（])*)(.)/u);
  if (!m) return { shown: "", hidden: text };
  const shown = m[0];
  return { shown, hidden: text.slice(shown.length) };
}
