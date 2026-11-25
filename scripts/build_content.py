#!/usr/bin/env python3
"""
不動産鑑定評価基準・運用上の留意事項の原文PDFから、暗記カード用 JSON を生成する。

使い方:
  python3 scripts/build_content.py          # 生成
  python3 scripts/build_content.py --check  # 生成 + 抜け漏れ・分割異常の検査結果を表示

必要: poppler-utils（pdftotext）
入力: data/raw/kijun_h26.pdf, data/raw/ryuui_h26.pdf
出力: src/data/kijun.json

原文: 国土交通省「不動産鑑定評価基準」「不動産鑑定評価基準運用上の留意事項」
      （平成26年5月1日一部改正）
      https://www.mlit.go.jp/common/001043585.pdf
      https://www.mlit.go.jp/common/001083211.pdf

方式:
  pdftotext -bbox で単語ごとの座標を取得し、
   - 行の右端が本文の右端に届いているか（＝折り返し行か）
   - 行の字下げ位置
   - 同じ行内の大きな空白（表・数式）
  から段落を復元する。
"""
from __future__ import annotations

import html
import json
import re
import subprocess
import sys
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "src" / "data" / "kijun.json"

PRE_MARK = "\u0000PRE\u0000"  # 表・数式ブロック（PDFから画像で切り出し、暗記の穴埋め対象外）

# ---- 見出し・段落マーカー -------------------------------------------------
RE_PART = re.compile(r"^(総|各)\s*論$")
RE_CHAPTER = re.compile(r"^第\s*([０-９0-9]+)\s*章\s*(.*)$")
RE_SECTION = re.compile(r"^第\s*([０-９0-9]+)\s*節\s*(.*)$")
RE_ROMAN = re.compile(r"^([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)\s*(\S.*)$")
RE_NUM = re.compile(r"^([０-９]+)\s*．\s*(.*)$")
RE_PAREN = re.compile(r"^（([０-９0-9]+)）\s*(.*)$")
RE_CIRCLE = re.compile(r"^([①-⑳])\s*(.*)$")
RE_KANA_PAREN = re.compile(r"^（([ア-ン])）\s*(.*)$")
RE_ALPHA = re.compile(r"^[（(]([a-zａ-ｚ])[）)]\s*(.*)$")
# 「（ア）から（キ）までに掲げる事項」のような参照表現は段落マーカーではない
RE_REFERENCE = re.compile(
    r"^(（[^）]{1,3}）|[０-９]+．|[①-⑳]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|第[０-９0-9]+[章節])\s*"
    r"(から|まで|及び|又は|並びに|若しくは|に|の|を|は|が|と|で|、)"
)
RE_MARKER_WORD = re.compile(
    r"^(第\s*[０-９0-9]+\s*[章節]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|[０-９]+．|（[^）]{1,3}）|[①-⑳]|[ア-ン]|[総各])$"
)


def to_int(s: str) -> int:
    return int(unicodedata.normalize("NFKC", s))


def is_marker_text(t: str, kana_word: bool = False) -> bool:
    if RE_REFERENCE.match(t):
        return False
    return bool(
        RE_PART.match(t)
        or RE_CHAPTER.match(t)
        or RE_SECTION.match(t)
        or RE_ROMAN.match(t)
        or RE_NUM.match(t)
        or RE_PAREN.match(t)
        or RE_CIRCLE.match(t)
        or RE_KANA_PAREN.match(t)
        or RE_ALPHA.match(t)
        or kana_word
    )


# ---- PDF → 行 ---------------------------------------------------------------
@dataclass
class Word:
    x0: float
    y0: float
    x1: float
    y1: float
    text: str


@dataclass
class Line:
    words: list[Word] = field(default_factory=list)
    page: int = 0

    @property
    def x0(self):
        return self.words[0].x0

    @property
    def x1(self):
        return self.words[-1].x1

    @property
    def y0(self):
        return min(w.y0 for w in self.words)

    @property
    def text(self) -> str:
        return "".join(w.text for w in self.words)

    def max_gap(self, skip_marker=True) -> float:
        ws = self.words
        start = 1 if (skip_marker and len(ws) > 1 and RE_MARKER_WORD.match(ws[0].text)) else 0
        gaps = [ws[i + 1].x0 - ws[i].x1 for i in range(start, len(ws) - 1)]
        return max(gaps) if gaps else 0.0


def read_pdf_lines(pdf: Path) -> list[list[Line]]:
    out = subprocess.run(
        ["pdftotext", "-bbox", str(pdf), "-"], capture_output=True, text=True, check=True
    ).stdout
    pages = []
    for pno, page in enumerate(re.findall(r"<page [^>]*>(.*?)</page>", out, re.S)):
        words = []
        for m in re.finditer(
            r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>',
            page,
        ):
            x0, y0, x1, y1 = map(float, m.groups()[:4])
            words.append(Word(x0, y0, x1, y1, html.unescape(m.group(5))))
        # 同じ高さの単語を1行にまとめる（上付き・下付き文字のずれを許容）
        words.sort(key=lambda w: (w.y0, w.x0))
        lines: list[Line] = []
        for w in words:
            placed = False
            for ln in lines[-3:]:
                ref = ln.words[0]
                if abs(ref.y0 - w.y0) < 4 or (w.y0 > ref.y0 - 3 and w.y1 < ref.y1 + 6 and (w.y1 - w.y0) < 9):
                    ln.words.append(w)
                    placed = True
                    break
            if not placed:
                lines.append(Line([w], pno))
        for ln in lines:
            ln.words.sort(key=lambda w: w.x0)
        lines.sort(key=lambda l: l.y0)
        # ページ番号（下部の数字のみの行）を除去
        lines = [
            l
            for l in lines
            if not (re.fullmatch(r"[0-9０-９\-－ ]+", l.text) and l.y0 > 740)
        ]
        pages.append(lines)
    return pages


# ---- 行 → 段落 --------------------------------------------------------------
CH = 11.0  # 1文字幅（pt）の目安


def is_tabular(ln: Line) -> bool:
    t = ln.text
    if re.match(r"^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+「", t) or RE_PART.match(t) or re.search(r"\.{5,}", t):
        return False
    if ln.max_gap() > CH * 1.2:
        return True
    # 数式の断片（「ａ'」「Ｒ」「(ａ'ｄ)」のような英字だけの短い行）
    if len(t) <= 10 and not re.search(r"[ぁ-ん一-龥：:]", t) and re.search(r"[A-Za-zＡ-Ｚａ-ｚ]", t) and not RE_MARKER_WORD.match(t):
        return True
    # 数式の断片（ひらがなを含まない短い行で、演算子や英字を含む）
    if len(t) <= 30 and not re.search(r"[ぁ-ん]", t) and re.search(r"[＝=＋+－−×/／]|[(（]１", t) and re.search(r"[A-Za-zＡ-Ｚａ-ｚ]", t):
        return True
    # 半角英字の数式行
    if re.search(r"[A-Za-z]", t) and re.search(r"[=+\-×/()]", t) and not re.search(r"[ぁ-ん]", t):
        return True
    return False


def join_words(ln: Line) -> str:
    """行テキスト。マーカー直後の空白は詰め、それ以外の大きな空白は1スペース。"""
    parts = []
    for i, w in enumerate(ln.words):
        if i > 0:
            gap = w.x0 - ln.words[i - 1].x1
            prev = ln.words[i - 1].text
            if gap > CH * 0.6 and not RE_MARKER_WORD.match(prev):
                # 半角英数字の間など
                parts.append(" " if re.search(r"[\x00-\x7f]$", prev) or re.match(r"[\x00-\x7f]", w.text) else "")
        parts.append(w.text)
    return "".join(parts)


def pre_text(lines: list[Line]) -> str:
    """表・数式を等幅風テキストに再構成（x座標を文字数換算）"""
    base = min(l.x0 for l in lines)
    rows = []
    for ln in lines:
        s = ""
        for w in ln.words:
            col = int(round((w.x0 - base) / (CH / 2)))  # 半角単位
            cur = sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in s)
            if col > cur:
                s += " " * (col - cur)
            elif s and not s.endswith(" "):
                s += " " if re.match(r"[A-Za-z0-9]", w.text) else ""
            s += w.text
        rows.append(s.rstrip())
    return "\n".join(rows)


def to_paragraphs(pages: list[list[Line]]) -> list[str]:
    paras: list[str] = []
    cur: str = ""
    prev: Line | None = None
    prev_full = False
    prev_first = False

    def push():
        nonlocal cur
        if cur:
            paras.append(cur)
        cur = ""

    # 本文の右端: 文書全体で最も多い行末位置（＝満行の右端）
    ends = Counter(round(l.x1) for ls in pages for l in ls if not is_tabular(l))
    doc_right = ends.most_common(1)[0][0]
    doc_right = max(e for e in ends if doc_right - 2 <= e <= doc_right + 2)

    for lines in pages:
        if not lines:
            continue
        right = doc_right

        i = 0
        while i < len(lines):
            ln = lines[i]
            # --- 表・数式ブロック
            if is_tabular(ln):
                block = [ln]
                j = i + 1
                while j < len(lines):
                    nx = lines[j]
                    t = nx.text
                    if is_tabular(nx):
                        block.append(nx)
                        j += 1
                        continue
                    # 表のセル内の折り返し（句点で終わらない短い行で、直後にまだ表が続く）
                    ahead = lines[j + 1 : j + 3]
                    if (
                        nx.x1 < right - CH * 0.8 or nx.x0 > block[0].x0 + CH * 4
                    ) and not t.endswith("。") and any(is_tabular(a) for a in ahead):
                        block.append(nx)
                        j += 1
                        continue
                    # セルの第2列に揃った継続行
                    col2 = [w.x0 for w in block[-1].words[1:2]]
                    if col2 and nx.x0 >= col2[0] - 2 and len(nx.words) <= 2 and not t.endswith("。"):
                        block.append(nx)
                        j += 1
                        continue
                    break
                push()
                by0 = min(l.y0 for l in block)
                by1 = max(max(w.y1 for w in l.words) for l in block)
                above = max((max(w.y1 for w in l.words) for l in lines[:i]), default=by0 - 16)
                below = min((l.y0 for l in lines[j:]), default=by1 + 16)
                paras.append(PRE_MARK + json.dumps(
                    {"page": block[0].page,
                     "x0": min(70.0, min(l.x0 for l in block)), "x1": max(doc_right + 12, max(l.x1 for l in block)),
                     "y0": (above + by0) / 2, "y1": (by1 + below) / 2,
                     "text": pre_text(block)}, ensure_ascii=False))
                prev, prev_full, prev_first = None, False, False
                i = j
                continue

            t = join_words(ln)
            kana_word = bool(re.fullmatch(r"[ア-ン]", ln.words[0].text)) and len(ln.words) > 1
            marker = is_marker_text(t, kana_word)
            full = ln.x1 >= right - CH * 0.8

            if not cur or prev is None:
                new = True
            elif re.match(r"^[のをにがはでともへや、。）」]", t):
                new = False
            elif not prev_full:
                # 前の行が満行でない → 段落の終わり
                new = True
            else:
                ptxt = prev_text
                ends_sentence = bool(re.search(r"(。|：|。）|。」)$", ptxt))
                if not ends_sentence:
                    new = False  # 文の途中で折り返し
                elif marker:
                    new = True
                elif ln.x0 > prev.x0 + CH * 0.5 and not prev_first:
                    new = True  # 字下げ（段落頭）
                else:
                    new = False
            if new:
                push()
                cur = t
                prev_first = True
            else:
                cur += t
                prev_first = False
            prev = ln
            prev_text = t
            prev_full = full
            i += 1
    push()
    return [p for p in paras if not re.search(r"\.{5,}|…{3,}", p)]


# ---- 見出し判定 -------------------------------------------------------------
def heading_of(p: str):
    """(level, key, title) を返す。見出しでなければ None。
    level: 0=編 1=章 2=節 3=Ⅰ 4=１． 5=（１）
    """
    if p.startswith(PRE_MARK):
        return None
    m = RE_PART.match(p)
    if m:
        return (0, m.group(1) + "論", m.group(1) + "論")
    m = RE_CHAPTER.match(p)
    if m and len(m.group(2)) <= 40 and "。" not in m.group(2):
        return (1, f"第{to_int(m.group(1))}章", m.group(2))
    m = RE_SECTION.match(p)
    if m and len(m.group(2)) <= 70 and "。" not in m.group(2):
        return (2, f"第{to_int(m.group(1))}節", m.group(2))
    m = RE_ROMAN.match(p)
    if m and "。" not in m.group(2):
        return (3, m.group(1), m.group(2))
    m = RE_NUM.match(p)
    if m and "。" not in m.group(2) and len(m.group(2)) <= 60:
        return (4, f"{to_int(m.group(1))}．", m.group(2))
    m = RE_PAREN.match(p)
    if m and "。" not in m.group(2) and len(m.group(2)) <= 40 and not re.search(r"[、，]$", m.group(2)):
        return (5, f"（{to_int(m.group(1))}）", m.group(2))
    return None


def classify_headings(paras: list[str], max_level: int):
    """見出し候補のうち、同レベルの候補が連続するもの（箇条書き）は本文扱い。"""
    cands = [heading_of(p) for p in paras]
    result = [None] * len(paras)
    is_list = [False] * len(paras)
    for i, h in enumerate(cands):
        if not h or h[0] > max_level:
            continue
        lvl = h[0]
        if lvl >= 3:
            nxt = cands[i + 1] if i + 1 < len(cands) else None
            prv_list = i > 0 and is_list[i - 1] and cands[i - 1] and cands[i - 1][0] == lvl
            if (nxt and nxt[0] <= lvl) or prv_list:
                is_list[i] = True
                continue
        result[i] = h
    return result


def normalize_paras(paras: list[str]) -> list[str]:
    """・折り返された見出しの残り（例:「ついて」）を見出しに戻す
    ・連続する表・数式ブロックを1つにまとめる"""
    out: list[str] = []
    for p in paras:
        if out and not p.startswith(PRE_MARK) and len(p) <= 8 and "。" not in p and heading_of(out[-1]) and not heading_of(p):
            out[-1] += p
            continue
        if out and p.startswith(PRE_MARK) and out[-1].startswith(PRE_MARK):
            a = json.loads(out[-1][len(PRE_MARK):])
            b = json.loads(p[len(PRE_MARK):])
            if a["page"] == b["page"]:
                a["x0"], a["x1"] = min(a["x0"], b["x0"]), max(a["x1"], b["x1"])
                a["y0"], a["y1"] = min(a["y0"], b["y0"]), max(a["y1"], b["y1"])
                a["text"] += "\n" + b["text"]
                out[-1] = PRE_MARK + json.dumps(a, ensure_ascii=False)
                continue
        out.append(p)
    return out


FIG_DIR = ROOT / "public" / "figures"
DPI = 200


def render_figures(paras: list[str], pdf: Path, prefix: str) -> list[str]:
    """表・数式ブロックをPDFから画像として切り出し、[[FIG]] 参照に置換"""
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    out = []
    n = 0
    for p in paras:
        if not p.startswith(PRE_MARK):
            out.append(p)
            continue
        info = json.loads(p[len(PRE_MARK):])
        n += 1
        name = f"{prefix}-{n:02d}.png"
        sc = DPI / 72
        x, y = max(0, info["x0"]), max(0, info["y0"])
        w, h = info["x1"] - info["x0"], info["y1"] - info["y0"]
        subprocess.run(
            ["pdftoppm", "-png", "-r", str(DPI), "-f", str(info["page"] + 1), "-l", str(info["page"] + 1),
             "-x", str(int(x * sc)), "-y", str(int(y * sc)), "-W", str(int(w * sc)), "-H", str(int(h * sc)),
             "-singlefile", str(pdf), str(FIG_DIR / name[:-4])],
            check=True,
        )
        out.append(PRE_MARK + json.dumps({"src": f"figures/{name}", "alt": info["text"]}, ensure_ascii=False))
    return out


def build_cards(paras: list[str], source: str, max_level: int):
    cards = []
    path: list[tuple[int, str, str]] = []
    body: list[str] = []
    heads = classify_headings(paras, max_level)

    def flush():
        nonlocal body
        if body and path:
            cards.append(
                {
                    "source": source,
                    "part": next((k for l, k, _ in path if l == 0), ""),
                    "chapter": next((k for l, k, _ in path if l == 1), ""),
                    "pathKeys": [k for _, k, _ in path],
                    "pathTitles": [t for _, _, t in path],
                    "body": body,
                }
            )
        body = []

    for p, h in zip(paras, heads):
        if h:
            flush()
            path = [x for x in path if x[0] < h[0]]
            path.append(h)
        else:
            body.append(p)
    flush()
    return cards


def text_len(b: str) -> int:
    return 0 if b.startswith(PRE_MARK) else len(b)


def chunk_cards(cards, limit=420):
    """長いカードは段落境界で分割（暗記しやすい粒度にする）"""
    out = []
    for c in cards:
        body = c["body"]
        total = sum(text_len(b) for b in body)
        if total <= limit * 1.3:
            out.append(c)
            continue
        groups, cur, size = [], [], 0
        for b in body:
            if cur and size + text_len(b) > limit and not b.startswith(PRE_MARK):
                groups.append(cur)
                cur, size = [], 0
            cur.append(b)
            size += text_len(b)
        if cur:
            if groups and size < limit * 0.3:
                groups[-1].extend(cur)
            else:
                groups.append(cur)
        for i, g in enumerate(groups):
            nc = dict(c)
            nc["body"] = g
            nc["part_no"] = i + 1
            nc["part_total"] = len(groups)
            out.append(nc)
    return out


def ryuui_chapter(title: str):
    m = re.search(r"(総論|各論)第([０-９0-9]+)章", title)
    if not m:
        return "", ""
    return m.group(1), f"第{to_int(m.group(2))}章"


# ---- 重要度 -----------------------------------------------------------------
# ※ 論文式試験の出題傾向・受験界で一般的とされる重要度からの「推定」。
#   アプリ側で利用者が変更できる。
#   S: 最重要（頻出・一字一句レベルで暗記）A: 重要 B: 標準 C: 出題頻度低め
IMPORTANCE_CHAPTER = {
    ("総論", "第1章"): "S",
    ("総論", "第2章"): "A",
    ("総論", "第3章"): "A",
    ("総論", "第4章"): "S",
    ("総論", "第5章"): "S",
    ("総論", "第6章"): "S",
    ("総論", "第7章"): "S",
    ("総論", "第8章"): "B",
    ("総論", "第9章"): "C",
    ("各論", "第1章"): "A",
    ("各論", "第2章"): "A",
    ("各論", "第3章"): "B",
}
# (章, タイトルに含まれる語, 重要度)。後に書いたものが優先。
IMPORTANCE_OVERRIDE = [
    (("総論", "第3章"), "一般的要因", "B"),
    (("総論", "第5章"), "価格時点", "A"),
    (("総論", "第7章"), "賃料を求める鑑定評価の手法", "A"),
    (("総論", "第8章"), "試算価格又は試算賃料の調整", "A"),
    (("総論", "第8章"), "鑑定評価額の決定", "A"),
    (("総論", "第9章"), "鑑定評価報告書の作成指針", "B"),
    (("各論", "第1章"), "宅地", "S"),
    (("各論", "第1章"), "特定価格を求める場合", "B"),
    (("各論", "第2章"), "継続賃料", "S"),
    (("各論", "第3章"), "基本的姿勢", "A"),
    (("各論", "第3章"), "ＤＣＦ法の適用等", "A"),
]


def importance(card) -> str:
    key = (card["part"], card["chapter"])
    rank = IMPORTANCE_CHAPTER.get(key, "B")
    titles = "".join(card["pathTitles"])
    for k, word, r in IMPORTANCE_OVERRIDE:
        if k == key and word in titles:
            rank = r
    if card["source"] == "ryuui":
        rank = {"S": "A", "A": "B", "B": "B", "C": "C"}[rank]
    return rank


def strip_appendix(paras: list[str]) -> list[str]:
    """末尾の附則（施行日）を除去"""
    for i, p in enumerate(paras):
        if "附則（平成１４" in re.sub(r"\s", "", p)[:40]:
            return paras[:i]
    return paras


def build():
    k_paras = to_paragraphs(read_pdf_lines(RAW / "kijun_h26.pdf"))
    r_paras = to_paragraphs(read_pdf_lines(RAW / "ryuui_h26.pdf"))

    k0 = next(i for i, p in enumerate(k_paras) if p.startswith("第１章不動産の鑑定評価に関する基本的考察"))
    k_body = render_figures(normalize_paras(strip_appendix(k_paras[k0:])), RAW / "kijun_h26.pdf", "kijun")
    k_cards = build_cards(["総論"] + k_body, "kijun", max_level=4)

    r0 = next(i for i, p in enumerate(r_paras) if p.startswith("Ⅰ「総論第"))
    r_body = render_figures(normalize_paras(strip_appendix(r_paras[r0:])), RAW / "ryuui_h26.pdf", "ryuui")
    r_cards = []
    for c in build_cards(["総論"] + r_body, "ryuui", max_level=5):
        roman_title = c["pathTitles"][1] if len(c["pathTitles"]) > 1 else ""
        part, chap = ryuui_chapter(roman_title)
        if not part:
            continue
        c["part"], c["chapter"] = part, chap
        c["pathKeys"] = c["pathKeys"][1:]
        c["pathTitles"] = c["pathTitles"][1:]
        r_cards.append(c)

    cards = chunk_cards(k_cards) + chunk_cards(r_cards)
    result = []
    counters = Counter()
    for c in cards:
        counters[c["source"]] += 1
        cid = f'{c["source"]}-{counters[c["source"]]:03d}'
        title_parts = []
        for k, t in zip(c["pathKeys"], c["pathTitles"]):
            if k in ("総論", "各論"):
                continue
            if k.startswith("（"):
                title_parts.append(f"{k}{t}")
            elif re.match(r"^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+$", k):
                title_parts.append(f"{k} {t}")
            else:
                title_parts.append(f"{k} {t}".strip())
        title = " ＞ ".join(title_parts) or f'{c["part"]}（前文）'
        if c.get("part_total"):
            title += f'（{c["part_no"]}/{c["part_total"]}）'
        result.append(
            {
                "id": cid,
                "source": c["source"],
                "part": c["part"],
                "chapter": c["chapter"],
                "title": title,
                "body": [b.replace(PRE_MARK, "[[FIG]]") for b in c["body"]],
                "importance": importance(c),
                "chars": sum(text_len(b) for b in c["body"]),
            }
        )
    return result, k_body, r_body


def check(result, k_body, r_body):
    """抜け漏れ・分割異常の検査"""
    ok = True
    for src, paras in (("kijun", k_body), ("ryuui", r_body)):
        allb = set(b for c in result if c["source"] == src for b in c["body"])
        miss = [
            p
            for p in paras
            if p.replace(PRE_MARK, "[[FIG]]") not in allb
            and not heading_of(p)
            and not RE_PART.match(p)
        ]
        # 見出し扱いされなかった Ⅰ 等は本文に入るはず
        if miss:
            ok = False
            print(f"[{src}] 未収録の段落 {len(miss)} 件", file=sys.stderr)
            for m in miss[:10]:
                print("   ", m[:60], file=sys.stderr)
    sus = 0
    for c in result:
        for b in c["body"]:
            if b.startswith("[[FIG]]"):
                continue
            if re.search(r"。(（[０-９0-9]+）|[①-⑳]|第[０-９]+[章節])", b):
                sus += 1
                print("  [結合疑い]", c["id"], b[:50], file=sys.stderr)
    print(f"結合疑い: {sus} 件", file=sys.stderr)
    return ok


ORDER_FILE = ROOT / "data" / "card_order.json"


def apply_study_order(result):
    """学習・表示の並び順を適用する。
    data/card_order.json（カードIDの並び）がある場合、その順に並べ替える。
    この並びでは、運用上の留意事項の各項目が、対応する基準本文の箇所の直後に置かれている。
    留意事項カードには直前の基準カード（anchor）を記録し、重要度もその基準カードに合わせる。
    """
    if ORDER_FILE.exists():
        order = json.loads(ORDER_FILE.read_text(encoding="utf-8"))
        rank = {cid: i for i, cid in enumerate(order)}
        missing = [c["id"] for c in result if c["id"] not in rank]
        if missing:
            print(f"警告: 並び順ファイルに無いカード {len(missing)} 件（末尾に配置）: {missing[:5]}", file=sys.stderr)
        result.sort(key=lambda c: rank.get(c["id"], len(rank)))
    anchor = None
    for c in result:
        if c["source"] == "kijun":
            anchor = c
        elif anchor is not None:
            c["anchor"] = anchor["id"]
            c["importance"] = anchor["importance"]
    return result


def main():
    result, k_body, r_body = build()
    result = apply_study_order(result)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    meta = {
        "name": "不動産鑑定評価基準・運用上の留意事項",
        "version": "平成26年5月1日一部改正",
        "sourceUrls": {
            "kijun": "https://www.mlit.go.jp/common/001043585.pdf",
            "ryuui": "https://www.mlit.go.jp/common/001083211.pdf",
        },
    }
    OUT.write_text(
        json.dumps({"meta": meta, "cards": result}, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    print(f"cards: {len(result)}", file=sys.stderr)
    print(" ", dict(Counter(r["source"] for r in result)), file=sys.stderr)
    print(" ", dict(sorted(Counter(r["importance"] for r in result).items())), file=sys.stderr)
    print(f"  chars: {sum(r['chars'] for r in result)}", file=sys.stderr)
    if "--check" in sys.argv:
        check(result, k_body, r_body)


if __name__ == "__main__":
    main()
