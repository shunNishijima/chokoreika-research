// ネコ受付（パターン2）の計算部分のテスト。実行: node --test neko/core.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("./core.js");

const NOW = "2026-11-22T08:00:00+09:00";

function withEvent() {
  return Core.startEvent(Core.emptyState(), { club: "みゆき会", kind: "朝ご飯会", date: "2026-11-22" }, NOW).state;
}

test("given 時刻 / when 挨拶を決める / then 朝はおはよう・昼はこんにちは・夜はこんばんは", () => {
  assert.equal(Core.greeting(4), "こんばんは");
  assert.equal(Core.greeting(5), "おはようございます");
  assert.equal(Core.greeting(10), "おはようございます");
  assert.equal(Core.greeting(11), "こんにちは");
  assert.equal(Core.greeting(17), "こんにちは");
  assert.equal(Core.greeting(18), "こんばんは");
});

test("given 昭和の年月日 / when 西暦に直す / then 昭和20年3月5日は 1945-03-05", () => {
  assert.equal(Core.showaToISO(20, 3, 5), "1945-03-05");
  assert.equal(Core.showaToISO(1, 12, 25), "1926-12-25");
});

test("given 昭和に存在しない日付 / when 西暦に直す / then null", () => {
  assert.equal(Core.showaToISO(1, 12, 24), null); // 昭和元年は12月25日から
  assert.equal(Core.showaToISO(64, 1, 8), null); // 昭和64年は1月7日まで
  assert.equal(Core.showaToISO(20, 2, 30), null);
  assert.equal(Core.showaToISO(65, 1, 1), null);
});

test("given 老人会名と会の種類 / when 会を始める / then 今の会として設定される", () => {
  const s = withEvent();
  assert.equal(s.events.length, 1);
  assert.equal(s.currentEventId, s.events[0].id);
  assert.equal(s.events[0].club, "みゆき会");
  assert.equal(s.events[0].kind, "朝ご飯会");
});

test("given 会が設定済み / when 初めての人が登録 / then 番号 0001 が振られ、気分つきで出席が記録される", () => {
  const r = Core.register(withEvent(), { name: "はなこ", gender: "女", birth: "1945-03-05", mood: "るんるん" }, NOW);
  assert.equal(r.id, "0001");
  assert.equal(r.state.participants[0].name, "はなこ");
  assert.equal(r.state.participants[0].birth, "1945-03-05");
  assert.equal(r.state.attendance.length, 1);
  assert.equal(r.state.attendance[0].mood, "るんるん");
});

test("given 前回来た人 / when 次の会で名前を選んで受付 / then その会の出席が増え、気分も残る", () => {
  let s = Core.register(withEvent(), { name: "はなこ", gender: "女", mood: "ふつう" }, NOW).state;
  s = Core.startEvent(s, { club: "みゆき会", kind: "映画会", date: "2026-11-29" }, NOW).state;
  const r = Core.checkIn(s, "0001", "ゆううつ", NOW);
  assert.equal(r.ok, true);
  assert.equal(r.already, false);
  assert.equal(r.state.attendance.length, 2);
  assert.equal(r.state.attendance[1].mood, "ゆううつ");
});

test("given 同じ会で受付済み / when もう一度受付 / then 出席は増えない", () => {
  const s = Core.register(withEvent(), { name: "はなこ", mood: "ふつう" }, NOW).state;
  const r = Core.checkIn(s, "0001", "るんるん", NOW);
  assert.equal(r.already, true);
  assert.equal(r.state.attendance.length, 1);
});

test("given 会が未設定 / when 受付 / then ok=false", () => {
  const s = { ...Core.emptyState(), participants: [{ id: "0001", name: "はなこ" }] };
  assert.equal(Core.checkIn(s, "0001", "ふつう", NOW).ok, false);
});

test("given 同じ名前の人が2人 / when 名前一覧を作る / then 性別と生まれ年で見分けられる表示になる", () => {
  let s = withEvent();
  s = Core.register(s, { name: "たろう", gender: "男", birth: "1940-01-01" }, NOW).state;
  s = Core.register(s, { name: "たろう", gender: "男", birth: "1950-05-05" }, NOW).state;
  s = Core.register(s, { name: "あき", gender: "女" }, NOW).state;
  const list = Core.nameList(s);
  assert.deepEqual(list.map((x) => x.label), ["あき", "たろう（男・昭和15年生）", "たろう（男・昭和25年生）"]);
});

test("given 会の出席 / when 集計 / then 人数・はじめて・気分と性別の内訳が出る", () => {
  let s = Core.register(withEvent(), { name: "A", gender: "男", mood: "ふつう" }, NOW).state;
  s = Core.startEvent(s, { club: "みゆき会", kind: "映画会", date: "2026-11-29" }, NOW).state;
  s = Core.checkIn(s, "0001", "るんるん", NOW).state;
  s = Core.register(s, { name: "B", gender: "女", mood: "るんるん" }, NOW).state;
  const sum = Core.summarize(s, s.currentEventId);
  assert.equal(sum.total, 2);
  assert.equal(sum.newCount, 1);
  assert.deepEqual(sum.byMood, { るんるん: 2 });
  assert.deepEqual(sum.byGender, { 男: 1, 女: 1 });
});

test("given 値にカンマと引用符 / when CSV 出力 / then エスケープされる", () => {
  assert.equal(Core.toCSV([{ a: "x,y", b: 'say "hi"' }], ["a", "b"]), 'a,b\n"x,y","say ""hi"""');
});

test("given 豆知識 / when 番号で選ぶ / then 範囲外でも必ず1件返る", () => {
  assert.equal(typeof Core.trivia(0), "string");
  assert.equal(Core.trivia(999999), Core.trivia(999999 % Core.TRIVIA.length));
});
