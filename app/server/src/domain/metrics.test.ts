import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDashboard, nextCode, type Dataset } from "./metrics.js";

const people = (n: number, extra: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1, code: String(i + 1).padStart(4, "0"), consent: true,
    ageGroup: "65〜74歳", gender: i % 2 ? "女性" : "男性", town: "A町", club: "みゆき会",
    trigger: "チラシ", livingAlone: null, mobility: null, ...extra,
  }));

function dataset(): Dataset {
  return {
    events: [
      { id: 1, date: "2026-09-05", kind: "朝ご飯会" },
      { id: 2, date: "2026-10-03", kind: "朝ご飯会" },
      { id: 3, date: "2026-11-07", kind: "映画会" },
    ],
    participants: [
      ...people(6),
      { id: 7, code: "0007", consent: true, ageGroup: "75〜84歳", gender: "女性", town: "B町", club: "入っていない", trigger: "知り合いに誘われた", livingAlone: "はい", mobility: "手押し車" },
      { id: 8, code: "0008", consent: false, ageGroup: null, gender: null, town: null, club: null, trigger: null, livingAlone: null, mobility: null },
    ],
    attendances: [
      // 9月: 1〜6 が初参加
      ...[1, 2, 3, 4, 5, 6].map((p) => ({ eventId: 1, participantId: p, role: "参加" })),
      // 10月: 1,2 がリピート、7 が初参加、1 は担い手
      { eventId: 2, participantId: 1, role: "準備を手伝った" },
      { eventId: 2, participantId: 2, role: "参加" },
      { eventId: 2, participantId: 7, role: "参加" },
      // 11月: 1 と 7 がリピート、8（同意なし）が初参加
      { eventId: 3, participantId: 1, role: "担当" },
      { eventId: 3, participantId: 7, role: "参加" },
      { eventId: 3, participantId: 8, role: "参加" },
    ],
  };
}

test("given 3回分の出席 / when 全期間を集計 / then 実人数・延べ・開催数・リピート率が正しい", () => {
  const d = buildDashboard(dataset(), {});
  assert.equal(d.kpis.uniques, 8);
  assert.equal(d.kpis.visits, 12);
  assert.equal(d.kpis.events, 3);
  // 2回以上来た人: 1,2,7 → 3/8
  assert.equal(d.kpis.repeatRate, 3 / 8);
  // 担い手（準備・担当を1回以上）: 1 → 1人
  assert.equal(d.kpis.helpers, 1);
});

test("given 同意あり非会員1人 / when 集計 / then 非会員率は同意者の中で計算する", () => {
  const d = buildDashboard(dataset(), {});
  // 同意者 7人中 非会員 1人
  assert.equal(d.kpis.nonMemberRate, 1 / 7);
});

test("given 開催ごとの出席 / when 推移を出す / then 新規とリピートに分かれる", () => {
  const d = buildDashboard(dataset(), {});
  assert.deepEqual(d.series.map((s) => [s.eventId, s.newcomers, s.repeaters]), [[1, 6, 0], [2, 1, 2], [3, 1, 2]]);
});

test("given 期間を10月以降に絞る / when 集計 / then 9月の出席は数えないが、新規判定は全期間の履歴で行う", () => {
  const d = buildDashboard(dataset(), { from: "2026-10-01" });
  assert.equal(d.kpis.visits, 6);
  assert.equal(d.kpis.newcomers, 2); // 7 と 8 だけ
});

test("given 町ごとの出席 / when 地域ヒートマップを出す / then 町×月で延べ・実人数・新規・平均回数・担い手が出る", () => {
  const d = buildDashboard(dataset(), {});
  const a10 = d.townHeat.cells.find((c) => c.town === "A町" && c.month === "2026-10")!;
  assert.equal(a10.visits, 2);
  assert.equal(a10.uniques, 2);
  assert.equal(a10.newcomers, 0);
  assert.equal(a10.helpers, 1);
  assert.equal(a10.avgVisits, 1);
  const total = d.townHeat.totals.find((t) => t.town === "A町")!;
  assert.equal(total.visits, 9);
  assert.equal(total.uniques, 6);
  assert.equal(total.avgVisits, 1.5);
});

test("given 同意なしの人 / when 地域ヒートマップ / then 町は「不明」にまとめる", () => {
  const d = buildDashboard(dataset(), {});
  assert.ok(d.townHeat.towns.includes("不明"));
});

test("given 外部共有モード / when 実人数5人未満の町 / then その町の値は隠す", () => {
  const d = buildDashboard(dataset(), { suppressBelow: 5 });
  const b = d.townHeat.totals.find((t) => t.town === "B町")!;
  assert.equal(b.suppressed, true);
  assert.equal(b.visits, null);
  const a = d.townHeat.totals.find((t) => t.town === "A町")!;
  assert.equal(a.suppressed, false);
  assert.equal(a.visits, 9);
  // 属性の内訳も 5人未満の項目は隠す
  assert.equal(d.breakdowns.gender.find((g) => g.label === "女性")!.count, null);
});

test("given 外部共有モードでない / when 内訳 / then 同意者だけで性別・年代・きっかけを数える", () => {
  const d = buildDashboard(dataset(), {});
  const g = Object.fromEntries(d.breakdowns.gender.map((x) => [x.label, x.count]));
  assert.deepEqual(g, { 男性: 3, 女性: 4 });
});

test("given 発行済みの最大番号 / when 次の番号 / then 4桁で1つ増やす", () => {
  assert.equal(nextCode(null), "0001");
  assert.equal(nextCode("0041"), "0042");
});
