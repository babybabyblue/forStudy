import { useMemo, useState, type ReactNode } from "react";
import { chooseHidden, hideAllTerms, hintOf, splitChunks, termSpans } from "../lib/cloze";

const LIST_RE = /^(（[０-９0-9]+）|（[ア-ン]）|[①-⑳]|[ア-ン](?=[^゠-ヿ])|[０-９]+．|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)/u;

function paraClass(p: string) {
  const m = p.match(LIST_RE);
  if (!m) return "para";
  if (/^[①-⑳]/.test(m[0])) return "para list l2";
  if (/^（[ア-ン]）|^[ア-ン]/.test(m[0])) return "para list l3";
  return "para list l1";
}

export function Figure({ raw }: { raw: string }) {
  const info = JSON.parse(raw.slice("[[FIG]]".length)) as { src: string; alt: string };
  return (
    <figure className="fig">
      <img src={import.meta.env.BASE_URL + info.src} alt={info.alt} loading="lazy" />
      <figcaption>図・表・式（原文PDFより）</figcaption>
    </figure>
  );
}

/** 重要単語を強調して表示 */
function highlightTerms(text: string, termsRe: RegExp | null): ReactNode {
  const spans = termSpans(text, termsRe);
  if (!spans.length) return text;
  const out: ReactNode[] = [];
  let pos = 0;
  spans.forEach(([s, e], i) => {
    if (s > pos) out.push(text.slice(pos, s));
    out.push(
      <strong key={i} className="term">
        {text.slice(s, e)}
      </strong>,
    );
    pos = e;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

/** 全文表示（重要単語は強調） */
export function PlainBody({ body, termsRe = null }: { body: string[]; termsRe?: RegExp | null }) {
  return (
    <div className="card-body">
      {body.map((p, i) =>
        p.startsWith("[[FIG]]") ? (
          <Figure key={i} raw={p} />
        ) : (
          <p key={i} className={paraClass(p)}>
            {highlightTerms(p, termsRe)}
          </p>
        ),
      )}
    </div>
  );
}

interface ClozeProps {
  body: string[];
  level: number;
  seed: string;
  revealAll: boolean;
  termsRe: RegExp | null;
}

function Blank({ text, onOpen, term }: { text: string; onOpen: () => void; term?: boolean }) {
  const tail = text.match(/[、。，]$/)?.[0] ?? "";
  const len = Array.from(text).length - tail.length;
  return (
    <>
      <button
        type="button"
        className={term ? "blank term-blank" : "blank"}
        style={{ width: `${Math.max(1.5, len)}em` }}
        onClick={onOpen}
        aria-label="タップで表示"
      />
      {tail}
    </>
  );
}

/** 穴埋め表示（レベルに応じて隠す） */
export function ClozeBody({ body, level, seed, revealAll, termsRe }: ClozeProps) {
  const paras = useMemo(
    () =>
      body.map((p, pi) => {
        if (p.startsWith("[[FIG]]")) return { fig: p, chunks: [], hidden: [] };
        const chunks = splitChunks(p, termsRe);
        return { fig: null, chunks, hidden: chooseHidden(chunks, level, `${seed}:${pi}`) };
      }),
    [body, level, seed, termsRe],
  );
  const [opened, setOpened] = useState<Record<string, boolean>>({});

  // Lv4（全文暗唱）は本文をすべて伏せ、段落数だけ示す
  if (level >= 4 && !revealAll) {
    return (
      <div className="card-body recall-blank">
        <p className="muted">
          見出しから本文を思い出して、声に出すか紙に書いてみよう（{body.filter((p) => !p.startsWith("[[FIG]]")).length}段落・
          {body.reduce((s, p) => s + (p.startsWith("[[FIG]]") ? 0 : p.length), 0)}字）。
        </p>
        {paras.map((p, i) =>
          p.fig ? null : (
            <p key={i} className={paraClass(body[i]) + " ghost"}>
              {hintOf(p.chunks[0]?.text ?? "").shown}
              <span className="blank-line" />
            </p>
          ),
        )}
      </div>
    );
  }

  return (
    <div className="card-body">
      {paras.map((p, pi) =>
        p.fig ? (
          <Figure key={pi} raw={p.fig} />
        ) : (
          <p key={pi} className={paraClass(body[pi])}>
            {p.chunks.map((c, ci) => {
              const key = `${pi}-${ci}`;
              const open = (k: string) => () => setOpened((o) => ({ ...o, [k]: true }));
              const revealedCls = (k: string) => (revealAll && !opened[k] ? "revealed" : "revealed self");
              // 句ごと隠す
              if (p.hidden[ci]) {
                if (revealAll || opened[key]) {
                  return (
                    <span key={key} className={revealedCls(key)}>
                      {highlightTerms(c.text, termsRe)}
                    </span>
                  );
                }
                const { shown, hidden } = level >= 3 ? hintOf(c.text) : { shown: "", hidden: c.text };
                return (
                  <span key={key}>
                    {shown}
                    <Blank text={hidden} onOpen={open(key)} term={c.hasTerm} />
                  </span>
                );
              }
              // 句は見せるが、重要単語は個別に隠す
              return (
                <span key={key}>
                  {c.segs.map((sg, si) => {
                    const k = `${key}-${si}`;
                    if (!sg.term) return <span key={k}>{sg.text}</span>;
                    if (!hideAllTerms(level))
                      return (
                        <strong key={k} className="term">
                          {sg.text}
                        </strong>
                      );
                    if (revealAll || opened[k])
                      return (
                        <strong key={k} className={"term " + revealedCls(k)}>
                          {sg.text}
                        </strong>
                      );
                    return <Blank key={k} text={sg.text} onOpen={open(k)} term />;
                  })}
                </span>
              );
            })}
          </p>
        ),
      )}
    </div>
  );
}

export function bodyText(body: string[]) {
  return body.filter((p) => !p.startsWith("[[FIG]]")).join("\n");
}
