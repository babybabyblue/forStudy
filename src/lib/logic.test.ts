import { describe, expect, it } from "vitest";
import kijun from "../data/kijun.json";
import type { MemoCard } from "../subjects/types";
import { chooseHidden, splitChunks } from "./cloze";
import { addDays, addMonths, diffDays } from "./date";
import { diffText } from "./diff";
import { dailyQuota, dueCards, introDeadline, learningOrder, type CardOverrides } from "./plan";
import { afterFirstRead, isMastered, newCardState, review, type CardState } from "./srs";

const cards = kijun.cards as MemoCard[];
const ov: CardOverrides = { importance: {}, suspended: {} };

describe("content", () => {
  it("カードがあり、IDが一意", () => {
    expect(cards.length).toBeGreaterThan(250);
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
  });
  it("留意事項は、学習順で対応する基準カードの直後（他の留意事項の後ろ）に続く", () => {
    const order = learningOrder(cards, ov);
    let lastKijun = "";
    for (const c of order) {
      if (c.source === "kijun") lastKijun = c.id;
      else expect(c.anchor).toBe(lastKijun);
    }
  });
  it("基準カードの重要度を変えると、対応する留意事項も連動する", () => {
    const r = cards.find((c) => c.anchor)!;
    const o: CardOverrides = { importance: { [r.anchor!]: "C" }, suspended: {} };
    const order = learningOrder(cards, o);
    const i = order.findIndex((c) => c.id === r.anchor);
    expect(order[i + 1].anchor).toBe(r.anchor);
  });
  it("重要度順: S が先頭、C が末尾", () => {
    const order = learningOrder(cards, ov);
    expect(order[0].importance).toBe("S");
    expect(order[order.length - 1].importance).toBe("C");
  });
});

describe("cloze", () => {
  it("分割しても文が欠けない", () => {
    for (const c of cards) {
      for (const p of c.body) {
        if (p.startsWith("[[FIG]]")) continue;
        expect(splitChunks(p).map((x) => x.text).join("")).toBe(p);
      }
    }
  });
  it("レベルに応じて隠す割合が増える", () => {
    const chunks = splitChunks(cards[1].body.join(""));
    const count = (lv: number) => chooseHidden(chunks, lv, "x").filter(Boolean).length;
    expect(count(0)).toBe(0);
    expect(count(1)).toBeLessThan(count(2));
    expect(count(3)).toBe(chunks.filter((c) => c.hideable).length);
  });
});

describe("srs", () => {
  it("できたを続けると全文暗唱・定着に到達", () => {
    let s = afterFirstRead(newCardState("2026-01-01"), "2026-01-01");
    let day = "2026-01-01";
    for (let i = 0; i < 6; i++) {
      s = review(s, 2, day);
      day = s.due;
    }
    expect(s.level).toBe(4);
    expect(isMastered(s)).toBe(true);
  });
  it("もう一度でレベルが下がり当日再出題", () => {
    const s = review({ ...newCardState("2026-01-01"), level: 3, interval: 6 }, 0, "2026-01-10");
    expect(s.level).toBe(2);
    expect(s.due).toBe("2026-01-10");
  });
});

describe("plan", () => {
  it("毎日ノルマをこなせば締切までに全カードに着手し、目標日までに大半が定着する", () => {
    const start = "2026-12-01";
    const plan = { startDate: start, targetDate: addMonths(start, 6), reviewBufferDays: 30, maxNewCharsPerDay: 0 };
    const states: Record<string, CardState> = {};
    let day = start;
    let maxLoad = 0;
    while (diffDays(day, plan.targetDate) >= 0) {
      const q = dailyQuota(cards, states, ov, plan, day);
      for (const c of q.newCards) states[c.id] = afterFirstRead(newCardState(day), day);
      const due = dueCards(cards, states, ov, day);
      maxLoad = Math.max(maxLoad, due.length);
      // 9割「できた」、1割「もう一度」とする
      due.forEach((c, i) => {
        states[c.id] = review(states[c.id], i % 10 === 9 ? 0 : 2, day);
      });
      // 当日中の再出題
      for (const c of dueCards(cards, states, ov, day)) states[c.id] = review(states[c.id], 2, day);
      day = addDays(day, 1);
    }
    const startedAll = cards.every((c) => states[c.id]);
    expect(startedAll).toBe(true);
    const lastIntro = Object.values(states).map((s) => s.introduced).sort().pop()!;
    expect(diffDays(lastIntro, introDeadline(plan))).toBeGreaterThanOrEqual(0);
    const mastered = cards.filter((c) => isMastered(states[c.id])).length;
    console.log(`定着 ${mastered}/${cards.length}, 1日の最大復習枚数 ${maxLoad}`);
    expect(mastered / cards.length).toBeGreaterThan(0.9);
  });
});

describe("diff", () => {
  it("一致率", () => {
    expect(diffText("不動産の価格", "不動産の価格").score).toBe(1);
    const r = diffText("不動産の価格", "不動産価格");
    expect(r.score).toBeCloseTo(5 / 6);
    expect(r.segs.some((s) => s.type === "miss" && s.text === "の")).toBe(true);
  });
});
