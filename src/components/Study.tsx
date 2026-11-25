import { useEffect, useMemo, useRef, useState } from "react";
import type { MemoCard, MemoSubject } from "../subjects/types";
import type { SubjectProgress } from "../lib/storage";
import { today } from "../lib/date";
import { diffText } from "../lib/diff";
import {
  GRADE_LABEL,
  LEVEL_LABEL,
  afterFirstRead,
  newCardState,
  previewInterval,
  review,
  type Grade,
} from "../lib/srs";
import { ClozeBody, PlainBody, bodyText } from "./CardBody";
import { effectiveImportance } from "../lib/plan";
import { ImportanceChip } from "./common";

export interface QueueItem {
  id: string;
  mode: "read" | "recall";
}

interface Props {
  subject: MemoSubject;
  progress: SubjectProgress;
  initialQueue: QueueItem[];
  onUpdate: (fn: (s: SubjectProgress) => SubjectProgress) => void;
  onExit: () => void;
  fontSize: number;
}

function fmtInterval(d: number) {
  if (d === 0) return "今日";
  if (d < 30) return `${d}日後`;
  return `${Math.round(d / 30)}か月後`;
}

export function Study({ subject, progress, initialQueue, onUpdate, onExit, fontSize }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue);
  const [revealed, setRevealed] = useState(false);
  const [writing, setWriting] = useState(false);
  const [written, setWritten] = useState("");
  const [done, setDone] = useState(0);
  const startedAt = useRef(Date.now());
  const cardMap = useMemo(() => new Map(subject.cards.map((c) => [c.id, c])), [subject]);
  const day = today();

  const item = queue[0];
  const card: MemoCard | undefined = item ? cardMap.get(item.id) : undefined;
  const state = card ? progress.cards[card.id] : undefined;

  useEffect(() => {
    setRevealed(false);
    setWriting(false);
    setWritten("");
    startedAt.current = Date.now();
    window.scrollTo({ top: 0 });
  }, [item?.id, item?.mode, done]);

  const logTime = (s: SubjectProgress, isNew: boolean, isReview: boolean): SubjectProgress => {
    const secs = Math.min(600, Math.round((Date.now() - startedAt.current) / 1000));
    const cur = s.log[day] ?? { reviews: 0, newCards: 0, seconds: 0 };
    return {
      ...s,
      log: {
        ...s.log,
        [day]: {
          reviews: cur.reviews + (isReview ? 1 : 0),
          newCards: cur.newCards + (isNew ? 1 : 0),
          seconds: cur.seconds + secs,
        },
      },
    };
  };

  if (!item || !card) {
    return (
      <div className="screen center">
        <div className="done-box">
          <div className="big">🎉</div>
          <h2>今日の分は終わりや！</h2>
          <p>{done}枚 学習しました。おつかれさん。</p>
          <button className="btn primary" onClick={onExit}>
            ホームへ戻る
          </button>
        </div>
      </div>
    );
  }

  const finishRead = () => {
    onUpdate((s) => {
      const base = s.cards[card.id] ?? newCardState(day);
      return logTime({ ...s, cards: { ...s.cards, [card.id]: afterFirstRead(base, day) } }, true, false);
    });
    // 他のカードを挟んでから穴埋めで再確認
    setQueue((q) => {
      const rest = q.slice(1);
      const pos = Math.min(rest.length, 3);
      return [...rest.slice(0, pos), { id: card.id, mode: "recall" }, ...rest.slice(pos)];
    });
    setDone((d) => d + 1);
  };

  const grade = (g: Grade) => {
    const cur = progress.cards[card.id] ?? afterFirstRead(newCardState(day), day);
    const next = review(cur, g, day);
    onUpdate((s) => logTime({ ...s, cards: { ...s.cards, [card.id]: next } }, false, true));
    setQueue((q) => {
      const rest = q.slice(1);
      if (next.interval === 0) {
        const pos = Math.min(rest.length, 4);
        return [...rest.slice(0, pos), { id: card.id, mode: "recall" }, ...rest.slice(pos)];
      }
      return rest;
    });
    setDone((d) => d + 1);
  };

  const level = item.mode === "read" ? 0 : (state?.level ?? 1);
  const diff = writing && revealed ? diffText(bodyText(card.body), written) : null;
  const seed = `${card.id}:${day}:${state?.reps ?? 0}`;

  return (
    <div className="screen study" style={{ fontSize }}>
      <div className="study-top">
        <button className="btn ghost small" onClick={onExit}>
          ← 中断
        </button>
        <span className="muted">
          残り {queue.length} ・ 済 {done}
        </span>
      </div>

      <article className="card">
        <div className="card-head">
          <div className="chips">
            <ImportanceChip value={effectiveImportance(card, progress.overrides)} />
            <span className="chip src">{subject.sourceLabels?.[card.source] ?? card.source}</span>
            <span className={`chip lv lv${level}`}>{item.mode === "read" ? "新規・通読" : `Lv${level} ${LEVEL_LABEL[level]}`}</span>
          </div>
          <h2 className="card-title">{card.title}</h2>
        </div>

        {item.mode === "read" ? (
          <>
            <p className="hint">まずは全文を読もう。できれば声に出して2回。次に穴埋めで確認するで。</p>
            <PlainBody body={card.body} />
          </>
        ) : (
          <>
            <p className="hint">
              {level <= 2 && "空欄を思い出してから、タップで1つずつ確認。"}
              {level === 3 && "各句の頭文字だけがヒント。全文を思い出そう。"}
              {level >= 4 && "見出しだけで全文を再現しよう。"}
            </p>
            {level >= 3 && !revealed && (
              <div className="write-toggle">
                <label>
                  <input type="checkbox" checked={writing} onChange={(e) => setWriting(e.target.checked)} /> 書いて答え合わせする
                </label>
              </div>
            )}
            {writing && !revealed && (
              <textarea
                className="write-area"
                value={written}
                onChange={(e) => setWritten(e.target.value)}
                placeholder="覚えている本文を入力（句読点も含めて）"
                rows={8}
              />
            )}
            {diff ? (
              <div className="diff">
                <div className="score">
                  一致率 <strong>{Math.round(diff.score * 100)}%</strong>
                  <span className="muted">（<span className="miss">赤</span>=書けなかった所、<span className="extra">灰</span>=余計に書いた所）</span>
                </div>
                <p className="para">
                  {diff.segs.map((s, i) => (
                    <span key={i} className={s.type}>
                      {s.text}
                    </span>
                  ))}
                </p>
              </div>
            ) : (
              <ClozeBody key={`${seed}:${level}:${done}`} body={card.body} level={level} seed={seed} revealAll={revealed} />
            )}
          </>
        )}
      </article>

      <div className="action-bar">
        {item.mode === "read" ? (
          <button className="btn primary wide" onClick={finishRead}>
            読んだ → 穴埋めへ
          </button>
        ) : !revealed ? (
          <button className="btn primary wide" onClick={() => setRevealed(true)}>
            答えを見る
          </button>
        ) : (
          <div className="grades">
            {([0, 1, 2, 3] as Grade[]).map((g) => (
              <button key={g} className={`btn grade g${g}`} onClick={() => grade(g)}>
                <span>{GRADE_LABEL[g]}</span>
                <small>
                  {fmtInterval(previewInterval(state ?? afterFirstRead(newCardState(day), day), g, day))}
                </small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
