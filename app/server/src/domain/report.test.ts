import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, ageBand, type ReportData } from "./report.js";

const t = (date: string, hm: string) => new Date(`${date}T${hm}:00+09:00`).toISOString();

function data(): ReportData {
  return {
    events: [
      { id: 1, date: "2026-09-05", kind: "朝ご飯会", host: "みゆき会" },
      { id: 2, date: "2026-09-19", kind: "映画会", host: "さくら会" },
      { id: 3, date: "2026-10-03", kind: "朝ご飯会", host: "みゆき会" },
    ],
    participants: [
      { id: 1, consent: true, ageGroup: null, birthYear: 1945, gender: "女性" }, // 2026年に81歳
      { id: 2, consent: true, ageGroup: "65〜74歳", birthYear: null, gender: "男性" },
      { id: 3, consent: false, ageGroup: null, birthYear: null, gender: null },
    ],
    attendances: [
      { eventId: 1, participantId: 1, checkedInAt: t("2026-09-05", "09:00"), checkedOutAt: t("2026-09-05", "10:30") },
      { eventId: 1, participantId: 2, checkedInAt: t("2026-09-05", "09:10"), checkedOutAt: t("2026-09-05", "10:10") },
      { eventId: 2, participantId: 3, checkedInAt: t("2026-09-19", "13:00"), checkedOutAt: null },
      { eventId: 3, participantId: 1, checkedInAt: t("2026-10-03", "09:00"), checkedOutAt: t("2026-10-03", "11:00") },
    ],
  };
}

test("given 生まれ年 / when 年齢層に分ける / then 国の集計と同じ区分（65歳未満・前期・後期・85歳以上）になる", () => {
  assert.equal(ageBand(1945, 2026), "75〜84歳");
  assert.equal(ageBand(1960, 2026), "65〜74歳");
  assert.equal(ageBand(1940, 2026), "85歳以上");
  assert.equal(ageBand(1970, 2026), "65歳未満");
});

test("given 3回の開催 / when 月ごとに集計 / then 月ごとの開催数・延べ・実人数・新規が出る", () => {
  const r = buildReport(data(), { asOf: "2026-11-22" });
  assert.deepEqual(r.monthly, [
    { month: "2026-09", events: 2, visits: 3, uniques: 3, newcomers: 3 },
    { month: "2026-10", events: 1, visits: 1, uniques: 1, newcomers: 0 },
  ]);
});

test("given 生まれ年の人と年代を選んだ人と同意なしの人 / when 年齢層 / then 同意した人だけ、生まれ年を優先して数える", () => {
  const r = buildReport(data(), { asOf: "2026-11-22" });
  const m = Object.fromEntries(r.ageBands.map((b) => [b.label, b.count]));
  assert.equal(m["75〜84歳"], 1);
  assert.equal(m["65〜74歳"], 1);
  assert.equal(r.ageBands.reduce((a, b) => a + (b.count ?? 0), 0), 2);
});

test("given 期間中にはじめて来た3人のうち1人が後日また来た / when 再来率 / then 1/3", () => {
  const r = buildReport(data(), { asOf: "2026-11-22" });
  assert.equal(r.comeback.newcomers, 3);
  assert.equal(r.comeback.returned, 1);
});

test("given 退出まで記録した3件 / when 滞在時間 / then 平均と中央値（分）が出て、退出なしは数えない", () => {
  const r = buildReport(data(), { asOf: "2026-11-22" });
  assert.equal(r.stay.count, 3);
  assert.equal(r.stay.avgMinutes, 90); // 90, 60, 120
  assert.equal(r.stay.medianMinutes, 90);
});

test("given 12時間を超える滞在（退出の押し忘れ） / when 滞在時間 / then 外れ値として除く", () => {
  const d = data();
  d.attendances[2].checkedOutAt = t("2026-09-20", "13:00");
  assert.equal(buildReport(d, { asOf: "2026-11-22" }).stay.count, 3);
});

test("given 会の種類と主催 / when 集計 / then 種類ごと・主催ごとの開催数と延べ参加が出る", () => {
  const r = buildReport(data(), { asOf: "2026-11-22" });
  assert.deepEqual(r.kinds[0], { label: "朝ご飯会", events: 2, visits: 3, perEvent: 1.5 });
  assert.deepEqual(r.hosts.find((h) => h.label === "さくら会"), { label: "さくら会", events: 1, visits: 1, perEvent: 1 });
});

test("given 外部共有（5人未満を隠す） / when 年齢層 / then 5人未満の区分は null", () => {
  const r = buildReport(data(), { asOf: "2026-11-22", suppressBelow: 5 });
  assert.ok(r.ageBands.every((b) => b.count === null));
});

test("given 期間の指定 / when 9月だけ / then 10月は含まれず、期間の最初と最後の開催日が返る", () => {
  const r = buildReport(data(), { asOf: "2026-11-22", from: "2026-09-01", to: "2026-09-30" });
  assert.equal(r.monthly.length, 1);
  assert.deepEqual(r.period, { first: "2026-09-05", last: "2026-09-19" });
});
