import { useMemo, useState } from "react";
import type { Importance, MemoCard, MemoSubject } from "../subjects/types";
import { IMPORTANCE_LABEL, IMPORTANCE_ORDER } from "../subjects/types";
import type { SubjectProgress } from "../lib/storage";
import { isDue, isMastered, LEVEL_LABEL } from "../lib/srs";
import { formatJa, today } from "../lib/date";
import { effectiveImportance } from "../lib/plan";
import { compileTerms } from "../lib/cloze";
import { PlainBody } from "./CardBody";
import { Bar, ImportanceChip, pct } from "./common";
import type { QueueItem } from "./Study";

interface Props {
  subject: MemoSubject;
  progress: SubjectProgress;
  onUpdate: (fn: (s: SubjectProgress) => SubjectProgress) => void;
  onStart: (q: QueueItem[]) => void;
  fontSize: number;
}

interface Section {
  key: string;
  label: string;
  cards: MemoCard[];
}

interface Chapter {
  key: string;
  part: string;
  label: string;
  sections: Section[];
  cards: MemoCard[];
}

const stripPart = (t: string) => t.replace(/（\d+\/\d+）$/, "");

/**
 * 目次（編 → 章 → 節）を作る。カードの並び順（基準の各箇所の直後に対応する留意事項）を保つ。
 * 留意事項は、直前の基準カード（anchor）と同じ章・節に入れる。
 */
function buildToc(cards: MemoCard[]): Chapter[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const chapters: Chapter[] = [];
  const chIndex = new Map<string, Chapter>();
  for (const c of cards) {
    const base = c.anchor ? byId.get(c.anchor) ?? c : c;
    const segs = base.title.split(" ＞ ").map(stripPart);
    const chKey = `${base.part}|${base.chapter}`;
    let ch = chIndex.get(chKey);
    if (!ch) {
      const label = base.chapter ? segs[0] : `${base.part}（前文）`;
      ch = { key: chKey, part: base.part, label, sections: [], cards: [] };
      chIndex.set(chKey, ch);
      chapters.push(ch);
    }
    const secLabel = segs[1] && /^第\d+節/.test(segs[1]) ? segs[1] : "前文";
    const secKey = `${chKey}|${secLabel}`;
    let sec = ch.sections.find((s) => s.key === secKey);
    if (!sec) {
      sec = { key: secKey, label: secLabel, cards: [] };
      ch.sections.push(sec);
    }
    sec.cards.push(c);
    ch.cards.push(c);
  }
  return chapters;
}

function status(sp: SubjectProgress, id: string) {
  const s = sp.cards[id];
  if (sp.overrides.suspended[id]) return { label: "除外", cls: "st-sus" };
  if (!s) return { label: "未着手", cls: "st-new" };
  if (isMastered(s)) return { label: "定着", cls: "st-done" };
  return { label: `Lv${s.level}`, cls: `st-lv` };
}

function stats(cards: MemoCard[], sp: SubjectProgress) {
  const active = cards.filter((c) => !sp.overrides.suspended[c.id]);
  const total = active.reduce((s, c) => s + c.chars, 0);
  let started = 0, mastered = 0, nStarted = 0, nMastered = 0;
  for (const c of active) {
    const st = sp.cards[c.id];
    if (!st) continue;
    started += c.chars;
    nStarted++;
    if (isMastered(st)) {
      mastered += c.chars;
      nMastered++;
    }
  }
  return { total, started, mastered, n: active.length, nStarted, nMastered };
}

function Progress({ cards, sp }: { cards: MemoCard[]; sp: SubjectProgress }) {
  const s = stats(cards, sp);
  return (
    <div className="toc-progress">
      <div className="stack">
        <Bar value={s.started} max={s.total} label="着手" />
        <Bar value={s.mastered} max={s.total} label="定着" />
      </div>
      <span className="muted small toc-nums">
        定着{pct(s.mastered, s.total)}%・着手{pct(s.started, s.total)}%（{s.nMastered}/{s.nStarted}/{s.n}枚）
      </span>
    </div>
  );
}

type View = { v: "toc" } | { v: "section"; key: string } | { v: "detail"; id: string; from: View };

export function Browse({ subject, progress: sp, onUpdate, onStart, fontSize }: Props) {
  const [query, setQuery] = useState("");
  const [impFilter, setImpFilter] = useState<Importance | "">("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<View>({ v: "toc" });
  const toc = useMemo(() => buildToc(subject.cards), [subject]);
  const termsRe = useMemo(() => compileTerms(subject.keyTerms), [subject]);
  const day = today();

  const imp = (c: MemoCard) => effectiveImportance(c, sp.overrides);
  const cardTitle = (c: MemoCard) => {
    const segs = c.title.split(" ＞ ");
    const hasSec = /^第\d+節/.test(segs[1] ?? "");
    const rest = c.source === "kijun" ? segs.slice(hasSec ? 2 : 1) : segs;
    if (rest.length) return rest.join(" ＞ ");
    const suf = c.title.match(/（\d+\/\d+）$/)?.[0] ?? "";
    return (hasSec ? "本文" : "前文") + suf;
  };

  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };

  const CardRow = ({ c, from }: { c: MemoCard; from: View }) => {
    const st = status(sp, c.id);
    return (
      <li className={c.source === "ryuui" ? "ryuui" : ""}>
        <button onClick={() => go({ v: "detail", id: c.id, from })}>
          <ImportanceChip value={imp(c)} />
          {c.source === "ryuui" && <span className="chip src">留意</span>}
          <span className="cl-title">{cardTitle(c)}</span>
          <span className={`chip ${st.cls}`}>{st.label}</span>
        </button>
      </li>
    );
  };

  // ---- カード詳細
  if (view.v === "detail") {
    const detail = subject.cards.find((c) => c.id === view.id)!;
    const st = sp.cards[detail.id];
    const siblings =
      view.from.v === "section"
        ? toc.flatMap((ch) => ch.sections).find((s) => s.key === (view.from as { key: string }).key)?.cards ?? []
        : [];
    const idx = siblings.findIndex((c) => c.id === detail.id);
    return (
      <div className="screen" style={{ fontSize }}>
        <button className="btn ghost small" onClick={() => go(view.from)}>
          ← 戻る
        </button>
        <article className="card">
          <div className="card-head">
            <div className="chips">
              <ImportanceChip value={imp(detail)} />
              <span className="chip src">{subject.sourceLabels?.[detail.source]}</span>
              <span className={`chip ${status(sp, detail.id).cls}`}>{status(sp, detail.id).label}</span>
            </div>
            <h2 className="card-title">{detail.title}</h2>
          </div>
          <PlainBody body={detail.body} termsRe={termsRe} />
        </article>
        {siblings.length > 1 && (
          <div className="row-btns spread">
            <button className="btn small" disabled={idx <= 0} onClick={() => go({ ...view, id: siblings[idx - 1].id })}>
              ← 前のカード
            </button>
            <span className="muted small">
              {idx + 1}/{siblings.length}
            </span>
            <button
              className="btn small"
              disabled={idx >= siblings.length - 1}
              onClick={() => go({ ...view, id: siblings[idx + 1].id })}
            >
              次のカード →
            </button>
          </div>
        )}
        <section className="panel">
          {st && (
            <p className="muted small">
              暗記レベル: Lv{st.level}（{LEVEL_LABEL[st.level]}）／ 次回復習: {formatJa(st.due)} ／ 復習回数 {st.reps}・忘れた回数 {st.lapses}
            </p>
          )}
          <div className="row-btns">
            {!st ? (
              <button className="btn primary" onClick={() => onStart([{ id: detail.id, mode: "read" }])}>
                このカードを今すぐ学習
              </button>
            ) : isDue(st, day) ? (
              <button className="btn primary" onClick={() => onStart([{ id: detail.id, mode: "recall" }])}>
                このカードを復習
              </button>
            ) : (
              <button className="btn" onClick={() => onStart([{ id: detail.id, mode: "practice" }])}>
                練習する（記録には影響なし）
              </button>
            )}
          </div>
          <label className="field">
            <span>重要度（自分用に変更可）</span>
            <select
              value={imp(detail)}
              onChange={(e) =>
                onUpdate((s) => ({
                  ...s,
                  overrides: {
                    ...s.overrides,
                    importance: { ...s.overrides.importance, [detail.id]: e.target.value as Importance },
                  },
                }))
              }
            >
              {IMPORTANCE_ORDER.map((k) => (
                <option key={k} value={k}>
                  {IMPORTANCE_LABEL[k]}
                  {k === detail.importance ? "（初期値）" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field check">
            <input
              type="checkbox"
              checked={!!sp.overrides.suspended[detail.id]}
              onChange={(e) =>
                onUpdate((s) => ({
                  ...s,
                  overrides: {
                    ...s.overrides,
                    suspended: { ...s.overrides.suspended, [detail.id]: e.target.checked },
                  },
                }))
              }
            />
            <span>学習対象から外す（計画・出題に含めない）</span>
          </label>
        </section>
      </div>
    );
  }

  // ---- 節（カード一覧）
  if (view.v === "section") {
    const ch = toc.find((c) => c.sections.some((s) => s.key === view.key))!;
    const sec = ch.sections.find((s) => s.key === view.key)!;
    const active = sec.cards.filter((c) => !sp.overrides.suspended[c.id]);
    const newOnes = active.filter((c) => !sp.cards[c.id]);
    const due = active.filter((c) => sp.cards[c.id] && sp.cards[c.id].level > 0 && isDue(sp.cards[c.id], day));
    const notDue = active.filter((c) => sp.cards[c.id] && !due.includes(c));
    const studyQueue: QueueItem[] = [
      ...due.map((c) => ({ id: c.id, mode: "recall" as const })),
      ...newOnes.map((c) => ({ id: c.id, mode: "read" as const })),
    ];
    return (
      <div className="screen">
        <button className="btn ghost small" onClick={() => go({ v: "toc" })}>
          ← 目次
        </button>
        <section className="panel">
          <div className="muted small">
            {ch.part} {ch.label}
          </div>
          <h2 className="sec-title">{sec.label}</h2>
          <Progress cards={sec.cards} sp={sp} />
          <div className="row-btns">
            <button className="btn primary" disabled={!studyQueue.length} onClick={() => onStart(studyQueue)}>
              この節を学習する（新規{newOnes.length}・復習{due.length}）
            </button>
            {notDue.length > 0 && (
              <button className="btn" onClick={() => onStart(notDue.map((c) => ({ id: c.id, mode: "practice" })))}>
                復習日前のカードを練習（{notDue.length}枚・記録に影響なし）
              </button>
            )}
          </div>
          <p className="muted small">
            新規は計画より前倒しで始めることになります（その分、今後の1日のノルマが減ります）。
          </p>
        </section>
        <section className="panel group">
          <ul className="card-list">
            {sec.cards.map((c) => (
              <CardRow key={c.id} c={c} from={view} />
            ))}
          </ul>
        </section>
      </div>
    );
  }

  // ---- 目次 / 検索
  const filtering = !!query || !!impFilter;
  const matches = (c: MemoCard) =>
    (!impFilter || imp(c) === impFilter) &&
    (!query || c.title.includes(query) || c.body.some((p) => !p.startsWith("[[FIG]]") && p.includes(query)));

  return (
    <div className="screen">
      <div className="search">
        <input type="search" placeholder="キーワードで検索（例: 最有効使用）" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={impFilter} onChange={(e) => setImpFilter(e.target.value as Importance | "")}>
          <option value="">全重要度</option>
          {IMPORTANCE_ORDER.map((k) => (
            <option key={k} value={k}>
              {IMPORTANCE_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      {filtering ? (
        <section className="panel group">
          <ul className="card-list">
            {subject.cards.filter(matches).map((c) => (
              <CardRow key={c.id} c={c} from={{ v: "toc" }} />
            ))}
          </ul>
          {!subject.cards.some(matches) && <p className="muted small center-text">見つかりませんでした</p>}
        </section>
      ) : (
        ["総論", "各論"].map((part) => (
          <div key={part}>
            <h3 className="part-title">{part}</h3>
            {toc
              .filter((ch) => ch.part === part)
              .map((ch) => {
                const isOpen = open[ch.key];
                return (
                  <section className="panel group" key={ch.key}>
                    <button className="group-head toc-head" onClick={() => setOpen((o) => ({ ...o, [ch.key]: !o[ch.key] }))}>
                      <span className="toc-main">
                        <span className="group-label">{ch.label}</span>
                        <Progress cards={ch.cards} sp={sp} />
                      </span>
                      <span className="caret">{isOpen ? "▲" : "▼"}</span>
                    </button>
                    {isOpen && (
                      <ul className="card-list sec-list">
                        {ch.sections.map((s) => (
                          <li key={s.key}>
                            <button onClick={() => go({ v: "section", key: s.key })}>
                              <span className="toc-main">
                                <span className="cl-title">{s.label}</span>
                                <Progress cards={s.cards} sp={sp} />
                              </span>
                              <span className="caret">›</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
          </div>
        ))
      )}
      <p className="muted small center-text">枚数は「定着 / 着手 / 全体」。バーは上が着手、下が定着（文字数ベース）</p>
    </div>
  );
}
