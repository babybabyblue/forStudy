import { useRef, useState } from "react";
import type { AppData } from "../lib/storage";
import { defaultData, exportJson, importJson } from "../lib/storage";
import { addMonths, diffDays, today } from "../lib/date";
import type { Subject } from "../subjects/types";
import { InstallHint } from "./InstallHint";

interface Props {
  data: AppData;
  setData: (fn: (d: AppData) => AppData) => void;
  subjects: Subject[];
}

export function Settings({ data, setData, subjects }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const p = data.plan;
  const setPlan = (patch: Partial<AppData["plan"]>) => setData((d) => ({ ...d, plan: { ...d.plan, ...patch } }));
  const spanDays = diffDays(p.startDate, p.targetDate);

  const download = () => {
    const blob = new Blob([exportJson(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kantei-study-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const upload = async (f: File) => {
    try {
      const d = importJson(await f.text());
      if (!confirm("今の学習記録をバックアップの内容で上書きします。よろしいですか？")) return;
      setData(() => d);
      setMsg("読み込みました。");
    } catch (e) {
      setMsg(`読み込めませんでした: ${(e as Error).message}`);
    }
  };

  return (
    <div className="screen">
      <InstallHint always />
      <section className="panel">
        <h3>学習プラン</h3>
        <label className="field">
          <span>開始日</span>
          <input type="date" value={p.startDate} onChange={(e) => e.target.value && setPlan({ startDate: e.target.value })} />
        </label>
        <label className="field">
          <span>全範囲を覚え終える目標日</span>
          <input type="date" value={p.targetDate} onChange={(e) => e.target.value && setPlan({ targetDate: e.target.value })} />
        </label>
        <div className="row-btns">
          {[4, 5, 6].map((m) => (
            <button key={m} className="btn small" onClick={() => setPlan({ targetDate: addMonths(p.startDate, m) })}>
              開始から{m}か月
            </button>
          ))}
        </div>
        <p className="muted small">期間: {spanDays}日</p>
        <label className="field">
          <span>総仕上げ期間（目標日前の、新規なし・復習のみの日数）</span>
          <input
            type="number"
            min={0}
            max={90}
            value={p.reviewBufferDays}
            onChange={(e) => setPlan({ reviewBufferDays: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })}
          />
        </label>
        <label className="field">
          <span>1日の新規の上限（文字数、0=自動のみ）</span>
          <input
            type="number"
            min={0}
            step={100}
            value={p.maxNewCharsPerDay}
            onChange={(e) => setPlan({ maxNewCharsPerDay: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
        <p className="muted small">上限を付けると締切までに終わらない場合があります。</p>
      </section>

      <section className="panel">
        <h3>表示</h3>
        <label className="field">
          <span>本文の文字サイズ: {data.ui.fontSize}px</span>
          <input
            type="range"
            min={14}
            max={24}
            value={data.ui.fontSize}
            onChange={(e) => setData((d) => ({ ...d, ui: { ...d.ui, fontSize: Number(e.target.value) } }))}
          />
        </label>
      </section>

      <section className="panel">
        <h3>データ</h3>
        <p className="muted small">
          学習記録はこの端末のブラウザ内にだけ保存されます。機種変更・ブラウザのデータ削除に備えて、ときどきバックアップしてください。
        </p>
        <div className="row-btns">
          <button className="btn" onClick={download}>
            バックアップを保存
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            バックアップから復元
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </div>
        {msg && <p className="small">{msg}</p>}
        <div className="row-btns">
          <button
            className="btn danger small"
            onClick={() => {
              if (confirm("学習記録をすべて消去します。元に戻せません。よろしいですか？")) setData(() => defaultData());
            }}
          >
            学習記録をすべて消去
          </button>
        </div>
      </section>

      <section className="panel">
        <h3>収録内容と出典</h3>
        {subjects.map((s) => (
          <div key={s.id} className="small">
            <strong>{s.name}</strong>
            {s.kind === "memo" && (
              <span className="muted">
                {" "}
                {s.cards.length}枚・{s.cards.reduce((a, c) => a + c.chars, 0).toLocaleString()}字
              </span>
            )}
            {s.sourceNote && <p className="muted">{s.sourceNote}</p>}
            {s.sourceUrls && (
              <ul>
                {Object.entries(s.sourceUrls).map(([k, u]) => (
                  <li key={k}>
                    <a href={u} target="_blank" rel="noreferrer">
                      {s.sourceLabels?.[k] ?? k}（PDF）
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <p className="muted small">
          本文はPDFから自動抽出しています。改行位置の復元や図表の切り出しに誤りがある可能性があるため、気になる箇所は原文PDFで確認してください。
          重要度（S/A/B/C）は出題傾向などからの目安で、一覧画面から自分用に変更できます。
        </p>
      </section>
    </div>
  );
}
