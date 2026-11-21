// 受付の計算部分（登録・出席・集計）のテスト。実行: node --test reception/
const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("./core.js");

const NOW = "2026-11-22T08:00:00+09:00";

function withEvent() {
  let s = Core.emptyState();
  s = Core.startEvent(s, { date: "2026-11-22", kind: "朝ご飯会", place: "会場A", host: "みゆき会" }, NOW).state;
  return s;
}

test("given 参加者がいない / when 初めての人を登録 / then 番号 0001 が振られ、その回の出席も記録される", () => {
  let s = withEvent();
  const r = Core.register(s, { ageGroup: "70代", gender: "女性", town: "町A", club: "入っていない", trigger: "チラシ", consent: "はい" }, NOW);
  assert.equal(r.id, "0001");
  assert.equal(r.state.attendance.length, 1);
  assert.equal(r.state.attendance[0].participantId, "0001");
});

test("given 2人登録済み / when 3人目を登録 / then 番号は 0003", () => {
  let s = withEvent();
  s = Core.register(s, { consent: "はい" }, NOW).state;
  s = Core.register(s, { consent: "はい" }, NOW).state;
  assert.equal(Core.register(s, { consent: "はい" }, NOW).id, "0003");
});

test("given 登録済みの番号 / when 同じ回に2回受付 / then 出席は1件のまま（二重記録しない）", () => {
  let s = withEvent();
  s = Core.register(s, { consent: "はい" }, NOW).state;
  const r = Core.checkIn(s, "0001", NOW);
  assert.equal(r.ok, true);
  assert.equal(r.already, true);
  assert.equal(r.state.attendance.length, 1);
});

test("given 存在しない番号 / when 受付 / then ok=false で出席は増えない", () => {
  let s = withEvent();
  const r = Core.checkIn(s, "0099", NOW);
  assert.equal(r.ok, false);
  assert.equal(r.state.attendance.length, 0);
});

test("given 開催が設定されていない / when 受付 / then ok=false", () => {
  let s = Core.emptyState();
  s = { ...s, participants: [{ id: "0001" }] };
  assert.equal(Core.checkIn(s, "0001", NOW).ok, false);
});

test("given 前回来た人と初めての人 / when 今回を集計 / then 新規1・リピート1、男女と年代の内訳が出る", () => {
  let s = withEvent();
  s = Core.register(s, { ageGroup: "80代", gender: "男性", consent: "はい" }, NOW).state; // 前回に初参加
  s = Core.startEvent(s, { date: "2026-11-29", kind: "朝ご飯会" }, NOW).state;
  s = Core.checkIn(s, "0001", NOW).state;
  s = Core.register(s, { ageGroup: "70代", gender: "女性", consent: "はい" }, NOW).state;
  const sum = Core.summarize(s, s.currentEventId);
  assert.equal(sum.total, 2);
  assert.equal(sum.newCount, 1);
  assert.equal(sum.repeatCount, 1);
  assert.deepEqual(sum.byGender, { 男性: 1, 女性: 1 });
  assert.deepEqual(sum.byAge, { "80代": 1, "70代": 1 });
});

test("given 同意しなかった人 / when 集計 / then 人数には入るが属性の内訳には入らない", () => {
  let s = withEvent();
  s = Core.register(s, { ageGroup: "70代", gender: "女性", consent: "いいえ" }, NOW).state;
  const sum = Core.summarize(s, s.currentEventId);
  assert.equal(sum.total, 1);
  assert.deepEqual(sum.byGender, {});
  assert.equal(sum.noConsent, 1);
});

test("given 出席者に役割を付ける / when 集計 / then 担い手（準備・担当）の人数が出る", () => {
  let s = withEvent();
  s = Core.register(s, { consent: "はい" }, NOW).state;
  s = Core.register(s, { consent: "はい" }, NOW).state;
  s = Core.setRole(s, s.currentEventId, "0002", "準備を手伝った");
  const sum = Core.summarize(s, s.currentEventId);
  assert.equal(sum.helpers, 1);
});

test("given 同意しなかった人の属性 / when 登録 / then 属性は保存されない", () => {
  let s = withEvent();
  const r = Core.register(s, { ageGroup: "70代", gender: "女性", town: "町A", consent: "いいえ" }, NOW);
  const p = r.state.participants[0];
  assert.equal(p.ageGroup, undefined);
  assert.equal(p.town, undefined);
});

test("given 出席データ / when CSV 出力 / then 見出し行とカンマ・改行のエスケープが正しい", () => {
  const csv = Core.toCSV([{ a: "x,y", b: 'say "hi"' }], ["a", "b"]);
  assert.equal(csv, 'a,b\n"x,y","say ""hi"""');
});
