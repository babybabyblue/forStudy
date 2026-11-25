import { useMemo, useState } from "react";
import { chooseHidden, hintOf, splitChunks } from "../lib/cloze";

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

/** 全文表示 */
export function PlainBody({ body }: { body: string[] }) {
  return (
    <div className="card-body">
      {body.map((p, i) =>
        p.startsWith("[[FIG]]") ? (
          <Figure key={i} raw={p} />
        ) : (
          <p key={i} className={paraClass(p)}>
            {p}
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
}

/** 穴埋め表示（レベルに応じて隠す） */
export function ClozeBody({ body, level, seed, revealAll }: ClozeProps) {
  const paras = useMemo(
    () =>
      body.map((p, pi) => {
        if (p.startsWith("[[FIG]]")) return { fig: p, chunks: [], hidden: [] };
        const chunks = splitChunks(p);
        return { fig: null, chunks, hidden: chooseHidden(chunks, level, `${seed}:${pi}`) };
      }),
    [body, level, seed],
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
              if (!p.hidden[ci]) return <span key={key}>{c.text}</span>;
              const show = revealAll || opened[key];
              if (show)
                return (
                  <span key={key} className={revealAll && !opened[key] ? "revealed" : "revealed self"}>
                    {c.text}
                  </span>
                );
              const { shown, hidden } = level >= 3 ? hintOf(c.text) : { shown: "", hidden: c.text };
              const tail = hidden.match(/[、。，]$/)?.[0] ?? "";
              const len = Array.from(hidden).length - tail.length;
              return (
                <span key={key}>
                  {shown}
                  <button
                    type="button"
                    className="blank"
                    style={{ width: `${Math.max(1.5, len)}em` }}
                    onClick={() => setOpened((o) => ({ ...o, [key]: true }))}
                    aria-label="タップで表示"
                  />
                  {tail}
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
