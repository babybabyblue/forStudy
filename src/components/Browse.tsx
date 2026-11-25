import { useMemo, useState } from "react";
import type { Importance, MemoCard, MemoSubject } from "../subjects/types";
import { IMPORTANCE_LABEL, IMPORTANCE_ORDER } from "../subjects/types";
import type { SubjectProgress } from "../lib/storage";
import { isMastered, LEVEL_LABEL } from "../lib/srs";
import { formatJa } from "../lib/date";
import { PlainBody } from "./CardBody";
import { ImportanceChip } from "./common";
import type { QueueItem } from "./Study";

interface Props {
  subject: MemoSubject;
  progress: SubjectProgress;
  onUpdate: (fn: (s: SubjectProgress) => SubjectProgress) => void;
  onStart: (q: QueueItem[]) => void;
  fontSize: number;
}

interface Group {
  key: string;
  label: string;
  cards: MemoCard[];
}

/** 出典・編・章ごとにグループ化（基準の各章のすぐ後に対応する留意事項を並べる） */
function groupCards(cards: MemoCard[], labels: Record<string, string>): Group[] {
  const groups = new Map<string, Group>();
  for (const c of cards) {
    const key = `${c.part}|${c.chapter}|${c.source}`;
    if (!groups.has(key)) {
      const head = c.title.split(" ＞ ")[0].replace(/（\d+\/\d+）$/, "");
      const label =
        c.source === "kijun"
          ? `${c.part} ${head}`
          : `${labels[c.source] ?? c.source}：${c.part}${c.chapter}`;
      groups.set(key, { key, label, cards: [] });
    }
    groups.get(key)!.cards.push(c);
  }
  const partOrder = (p: string) => (p === "総論" ? 0 : 1);
  const chapNo = (ch: string) => Number(ch.replace(/\D/g, "")) || 0;
  return [...groups.values()].sort((a, b) => {
    const [pa, ca, sa] = a.key.split("|");
    const [pb, cb, sb] = b.key.split("|");
    return partOrder(pa) - partOrder(pb) || chapNo(ca) - chapNo(cb) || (sa === "kijun" ? 0 : 1) - (sb === "kijun" ? 0 : 1);
  });
}

function status(sp: SubjectProgress, id: string) {
  const s = sp.cards[id];
  if (sp.overrides.suspended[id]) return { label: "除外", cls: "st-sus" };
  if (!s) return { label: "未着手", cls: "st-new" };
  if (isMastered(s)) return { label: "定着", cls: "st-done" };
  return { label: `Lv${s.level}`, cls: `st-lv` };
}

export function Browse({ subject, progress: sp, onUpdate, onStart, fontSize }: Props) {
  const [query, setQuery] = useState("");
  const [impFilter, setImpFilter] = useState<Importance | "">("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<MemoCard | null>(null);
  const groups = useMemo(() => groupCards(subject.cards, subject.sourceLabels ?? {}), [subject]);

  const imp = (c: MemoCard) => sp.overrides.importance[c.id] ?? c.importance;
  const matches = (c: MemoCard) =>
    (!impFilter || imp(c) === impFilter) &&
    (!query || c.title.includes(query) || c.body.some((p) => !p.startsWith("[[FIG]]") && p.includes(query)));
  const filtering = !!query || !!impFilter;

  if (detail) {
    const st = sp.cards[detail.id];
    return (
      <div className="screen" style={{ fontSize }}>
        <button className="btn ghost small" onClick={() => setDetail(null)}>
          ← 一覧へ
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
          <PlainBody body={detail.body} />
        </article>
        <section className="panel">
          {st && (
            <p className="muted small">
              暗記レベル: Lv{st.level}（{LEVEL_LABEL[st.level]}）／ 次回復習: {formatJa(st.due)} ／ 復習回数 {st.reps}・忘れた回数 {st.lapses}
            </p>
          )}
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
          <div className="row-btns">
            <button className="btn primary" onClick={() => onStart([{ id: detail.id, mode: st ? "recall" : "read" }])}>
              {st ? "このカードを今すぐ復習" : "このカードを今すぐ学習"}
            </button>
          </div>
        </section>
      </div>
    );
  }

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
      {groups.map((g) => {
        const list = g.cards.filter(matches);
        if (!list.length) return null;
        const started = g.cards.filter((c) => sp.cards[c.id]).length;
        const mastered = g.cards.filter((c) => isMastered(sp.cards[c.id])).length;
        const isOpen = filtering || open[g.key];
        return (
          <section className="panel group" key={g.key}>
            <button className="group-head" onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}>
              <span className="group-label">{g.label}</span>
              <span className="muted small">
                {mastered}/{started}/{g.cards.length}
              </span>
              <span className="caret">{isOpen ? "▲" : "▼"}</span>
            </button>
            {isOpen && (
              <ul className="card-list">
                {list.map((c) => {
                  const st = status(sp, c.id);
                  return (
                    <li key={c.id}>
                      <button onClick={() => setDetail(c)}>
                        <ImportanceChip value={imp(c)} />
                        <span className="cl-title">{c.title.split(" ＞ ").slice(1).join(" ＞ ") || `（${c.title.replace(/（\d+\/\d+）$/, "")} の前文）`}</span>
                        <span className={`chip ${st.cls}`}>{st.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      <p className="muted small center-text">数字は「定着 / 着手 / 全体」の枚数</p>
    </div>
  );
}
