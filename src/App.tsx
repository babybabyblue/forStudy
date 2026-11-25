import { useState } from "react";
import { SUBJECTS } from "./subjects";
import type { MemoSubject } from "./subjects/types";
import { emptySubject } from "./lib/storage";
import { useAppData } from "./lib/useAppData";
import { Home } from "./components/Home";
import { Study, type QueueItem } from "./components/Study";
import { Browse } from "./components/Browse";
import { Settings } from "./components/Settings";
import { ComingSoon } from "./components/ComingSoon";
import { InstallHint } from "./components/InstallHint";

type Tab = "home" | "browse" | "settings";

export function App() {
  const { data, setData, updateSubject, saveError } = useAppData();
  const [subjectId, setSubjectId] = useState("kantei");
  const [tab, setTab] = useState<Tab>("home");
  const [session, setSession] = useState<QueueItem[] | null>(null);

  const subject = SUBJECTS.find((s) => s.id === subjectId)!;
  const sp = data.subjects[subject.id] ?? emptySubject();
  const update = (fn: Parameters<typeof updateSubject>[1]) => updateSubject(subject.id, fn);

  if (session && subject.kind === "memo") {
    return (
      <Study
        subject={subject as MemoSubject}
        progress={sp}
        initialQueue={session}
        onUpdate={update}
        onExit={() => setSession(null)}
        fontSize={data.ui.fontSize}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>鑑定士 暗記トレーナー</h1>
        <nav className="subject-tabs" aria-label="科目">
          {SUBJECTS.map((s) => (
            <button
              key={s.id}
              className={s.id === subjectId ? "active" : ""}
              onClick={() => setSubjectId(s.id)}
            >
              {s.shortName}
              {s.kind === "quiz" && s.comingSoon && <small>準備中</small>}
            </button>
          ))}
        </nav>
      </header>
      {saveError && <div className="warn banner">学習記録を保存できませんでした（ブラウザの容量・プライベートモードをご確認ください）。</div>}

      <main>
        {tab === "home" && (
          <div className="screen-top">
            <InstallHint />
          </div>
        )}
        {tab === "settings" ? (
          <Settings data={data} setData={setData} subjects={SUBJECTS} />
        ) : subject.kind === "quiz" ? (
          <ComingSoon subject={subject} />
        ) : tab === "home" ? (
          <Home subject={subject} progress={sp} plan={data.plan} onStart={setSession} />
        ) : (
          <Browse subject={subject} progress={sp} onUpdate={update} onStart={setSession} fontSize={data.ui.fontSize} />
        )}
      </main>

      <nav className="bottom-nav" aria-label="メニュー">
        {(
          [
            ["home", "🏠", "ホーム"],
            ["browse", "📖", "一覧・本文"],
            ["settings", "⚙️", "設定"],
          ] as [Tab, string, string][]
        ).map(([t, icon, label]) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            <span aria-hidden>{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
