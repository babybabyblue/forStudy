/**
 * 書いて覚えるモード用の文字単位の差分（LCS）。
 * 本文（正解）を基準に、書けた文字・書けなかった文字を判定する。
 */
export interface DiffSeg {
  text: string;
  /** ok: 一致, miss: 正解にあるが書けていない, extra: 余計に書いた */
  type: "ok" | "miss" | "extra";
}

const norm = (s: string) => s.replace(/[\s　]/g, "");

export function diffText(answer: string, written: string): { segs: DiffSeg[]; score: number } {
  const a = Array.from(norm(answer));
  const b = Array.from(norm(written));
  const n = a.length, m = b.length;
  // dp[i][j] = a[i:], b[j:] の LCS 長
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const segs: DiffSeg[] = [];
  const push = (text: string, type: DiffSeg["type"]) => {
    const last = segs[segs.length - 1];
    if (last && last.type === type) last.text += text;
    else segs.push({ text, type });
  };
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      push(a[i], "ok"); i++; j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      push(b[j], "extra"); j++;
    } else {
      push(a[i], "miss"); i++;
    }
  }
  const score = n === 0 ? 1 : dp[0][0] / n;
  return { segs, score };
}
