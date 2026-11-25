import type { MemoSubject } from "../subjects/types";
import { IMPORTANCE_LABEL, IMPORTANCE_ORDER } from "../subjects/types";
import type { PlanSettings } from "../lib/plan";
import { dailyQuota, dueCards, introDeadline, nextNewCards, progress } from "../lib/plan";
import type { SubjectProgress } from "../lib/storage";
import { addDays, diffDays, formatJa, formatJaLong, today } from "../lib/date";
import type { QueueItem } from "./Study";
import { Bar, pct } from "./common";

interface Props {
  subject: MemoSubject;
  progress: SubjectProgress;
  plan: PlanSettings;
  onStart: (q: QueueItem[]) => void;
}

function streak(log: SubjectProgress["log"], day: string) {
  let n = 0;
  let d = day;
  if (!log[d]) d = addDays(d, -1); // 今日まだなら昨日から数える
  while (log[d] && (log[d].reviews > 0 || log[d].newCards > 0)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function Home({ subject, progress: sp, plan, onStart }: Props) {
  const day = today();
  const ov = sp.overrides;
  const q = dailyQuota(subject.cards, sp.cards, ov, plan, day);
  const due = dueCards(subject.cards, sp.cards, ov, day);
  const pr = progress(subject.cards, sp.cards, ov, plan, day);
  const deadline = introDeadline(plan);
  const daysToTarget = diffDays(day, plan.targetDate);
  const behind = pr.plannedChars - pr.startedChars;
  const notStarted = diffDays(plan.startDate, day) < 0;

  const todayItems: QueueItem[] = [
    ...due.map((c) => ({ id: c.id, mode: "recall" as const })),
    ...q.newCards.map((c) => ({ id: c.id, mode: "read" as const })),
  ];
  const minutes = Math.max(
    1,
    Math.round(due.reduce((s, c) => s + c.chars, 0) / 150 + q.newCards.reduce((s, c) => s + c.chars, 0) / 60),
  );

  const last14 = Array.from({ length: 14 }, (_, i) => addDays(day, i - 13));
  const maxCount = Math.max(1, ...last14.map((d) => (sp.log[d]?.reviews ?? 0) + (sp.log[d]?.newCards ?? 0)));
  const todayLog = sp.log[day];

  return (
    <div className="screen">
      <section className="panel today">
        <div className="today-head">
          <h2>今日の学習 <span className="muted">{formatJa(day)}</span></h2>
          {streak(sp.log, day) > 0 && <span className="streak">🔥 {streak(sp.log, day)}日連続</span>}
        </div>
        <div className="today-stats">
          <div>
            <div className="num">{due.length}</div>
            <div className="label">復習</div>
          </div>
          <div>
            <div className="num">{q.newCards.length}</div>
            <div className="label">新規</div>
          </div>
          <div>
            <div className="num">約{todayItems.length ? minutes : 0}<small>分</small></div>
            <div className="label">目安</div>
          </div>
        </div>
        {todayItems.length > 0 ? (
          <button className="btn primary wide big" onClick={() => onStart(todayItems)}>
            学習をはじめる
          </button>
        ) : (
          <div className="all-done">
            <p>✅ 今日のノルマは達成済み{todayLog ? `（復習${todayLog.reviews}・新規${todayLog.newCards}）` : ""}</p>
            <button
              className="btn wide"
              onClick={() =>
                onStart(nextNewCards(subject.cards, sp.cards, ov, 2).map((c) => ({ id: c.id, mode: "read" })))
              }
              disabled={pr.startedCards >= pr.totalCards}
            >
              余裕があれば先取り（+2枚）
            </button>
          </div>
        )}
        {q.newCards.length > 0 && (
          <ul className="next-list">
            {q.newCards.map((c) => (
              <li key={c.id}>
                <span className={`chip imp imp-${ov.importance[c.id] ?? c.importance}`}>{ov.importance[c.id] ?? c.importance}</span>
                {c.title}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h3>6か月プラン</h3>
        <p className="plan-line">
          目標日 <strong>{formatJaLong(plan.targetDate)}</strong>
          {daysToTarget >= 0 ? `（あと${daysToTarget}日）` : "（目標日を過ぎています）"}
        </p>
        <p className="muted small">
          新規学習の締切: {formatJaLong(deadline)}。以降の{plan.reviewBufferDays}日間は総仕上げ（復習のみ）。
          1日の新規ノルマ 約{q.quotaChars}字。
        </p>
        {notStarted ? (
          <p className="muted">開始日は {formatJaLong(plan.startDate)} です。</p>
        ) : behind > 400 ? (
          <p className="warn">計画より約{behind.toLocaleString()}字遅れ。ノルマは自動で増えてるから、少しずつ取り戻そう。</p>
        ) : behind < -400 ? (
          <p className="good">計画より約{(-behind).toLocaleString()}字先行中。ええ調子！</p>
        ) : (
          <p className="good">ほぼ計画どおり。</p>
        )}

        <div className="metric">
          <div className="metric-head">
            <span>着手</span>
            <span>
              {pr.startedCards}/{pr.totalCards}枚（{pct(pr.startedChars, pr.totalChars)}%）
            </span>
          </div>
          <Bar value={pr.startedChars} max={pr.totalChars} marker={pr.plannedChars} label="着手" />
        </div>
        <div className="metric">
          <div className="metric-head">
            <span>定着（全文暗唱で2週間以上保持）</span>
            <span>
              {pr.masteredCards}枚（{pct(pr.masteredChars, pr.totalChars)}%）
            </span>
          </div>
          <Bar value={pr.masteredChars} max={pr.totalChars} label="定着" />
        </div>
        <p className="muted small">バーの縦線は「昨日までに着手しておきたい量」の目安。</p>
      </section>

      <section className="panel">
        <h3>重要度別の進み具合</h3>
        {IMPORTANCE_ORDER.map((k) => {
          const b = pr.byImportance[k];
          if (!b.total) return null;
          return (
            <div className="metric" key={k}>
              <div className="metric-head">
                <span>
                  <span className={`chip imp imp-${k}`}>{k}</span> {IMPORTANCE_LABEL[k].slice(2)}
                </span>
                <span>
                  着手{pct(b.started, b.total)}% ・ 定着{pct(b.mastered, b.total)}%
                </span>
              </div>
              <div className="stack">
                <Bar value={b.started} max={b.total} />
                <Bar value={b.mastered} max={b.total} />
              </div>
            </div>
          );
        })}
      </section>

      <section className="panel">
        <h3>直近2週間</h3>
        <div className="spark">
          {last14.map((d) => {
            const l = sp.log[d];
            const v = (l?.reviews ?? 0) + (l?.newCards ?? 0);
            return (
              <div key={d} className="spark-col" title={`${formatJa(d)} 復習${l?.reviews ?? 0} 新規${l?.newCards ?? 0}`}>
                <div className="spark-bar" style={{ height: `${(v / maxCount) * 100}%` }} />
                <span>{Number(d.slice(8))}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
