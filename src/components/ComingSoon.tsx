import type { QuizSubject } from "../subjects/types";

export function ComingSoon({ subject }: { subject: QuizSubject }) {
  return (
    <div className="screen">
      <section className="panel">
        <h2>{subject.name}</h2>
        <p>{subject.description}</p>
        <p className="muted small">
          予定している機能: 法令ごとの一問一答（○×）・択一問題、間違えた問題の自動復習（鑑定評価理論と同じ間隔反復）、
          短答式試験日から逆算した学習ペース表示。
        </p>
        <p className="muted small">
          問題データは <code>src/data/gyosei.json</code>（形式は <code>src/subjects/types.ts</code> の <code>QuizQuestion</code>）として追加する想定です。
        </p>
      </section>
    </div>
  );
}
