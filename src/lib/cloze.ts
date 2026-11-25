/**
 * 穴埋め用の文の分割と、隠す箇所の選択。
 * 句読点・括弧で区切った「句」を単位に隠す。
 */

export interface Chunk {
  text: string;
  /** 隠す対象になりうるか（記号だけの句は対象外） */
  hideable: boolean;
}

/** 段落を句に分割（区切り記号は前の句に含める） */
export function splitChunks(text: string): Chunk[] {
  const out: Chunk[] = [];
  // 「、」「。」の後、「（」「「」の前で区切る（文字は一切落とさない）
  const pieces = text.split(/(?<=[、。，])|(?=[（「])/u).filter((s) => s.length > 0);
  let buf = "";
  for (const p of pieces) {
    buf += p;
    // 極端に短い句（2文字以下）は次とまとめる
    if (stripMarks(buf).length <= 2 && !/[。]$/.test(buf)) continue;
    out.push(makeChunk(buf));
    buf = "";
  }
  if (buf) out.push(makeChunk(buf));
  // 長すぎる句（25字超）は助詞の後ろでさらに分割
  return out.flatMap((c) => (c.text.length > 25 ? splitLong(c.text) : [c]));
}

function stripMarks(s: string) {
  return s.replace(/[、。，「」（）\s]/g, "");
}

function makeChunk(text: string): Chunk {
  const core = stripMarks(text).replace(/^(（[０-９0-9ア-ン]+）|[①-⑳]|[０-９]+．)/, "");
  return { text, hideable: core.length >= 2 };
}

function splitLong(text: string): Chunk[] {
  const res: Chunk[] = [];
  let rest = text;
  while (rest.length > 25) {
    // 12〜22文字目付近の「の」「を」「に」「は」「が」「及び」「並びに」の後で切る
    const window = rest.slice(10, 22);
    const m = window.match(/(及び|並びに|又は|若しくは|において|における|により|による|として|ので|[をにはがでと])/u);
    if (!m || m.index === undefined) break;
    const cut = 10 + m.index + m[0].length;
    res.push(makeChunk(rest.slice(0, cut)));
    rest = rest.slice(cut);
  }
  res.push(makeChunk(rest));
  return res;
}

/** 決定的な疑似乱数（同じ日・同じカードなら同じ穴になる） */
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

export const HIDE_RATIO = [0, 0.3, 0.6, 1, 1];

/**
 * 各句を隠すかどうかを決める。
 * 返り値の配列は chunks と同じ長さで、true の句を隠す。
 */
export function chooseHidden(chunks: Chunk[], level: number, seed: string): boolean[] {
  const ratio = HIDE_RATIO[Math.min(level, HIDE_RATIO.length - 1)];
  const cand = chunks.map((c, i) => (c.hideable ? i : -1)).filter((i) => i >= 0);
  const n = Math.round(cand.length * ratio);
  const rnd = seededRandom(seed);
  // シャッフルして先頭 n 個
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
