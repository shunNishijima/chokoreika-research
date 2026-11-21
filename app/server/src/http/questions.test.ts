// アンケートの質問を管理画面で追加・編集・削除するAPIと、受付・集計への反映のテスト
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDb, type Db } from "../db/client.js";
import { createApp } from "./app.js";

let db: Db;
let close: () => Promise<void>;
const app = () => createApp({ db, sessionSecret: "t".repeat(32), kioskOpen: true, authenticateAdmin: async (c) => (c.req.header("x-test-admin") === "ok" ? "admin" : null) });
const admin = { "x-test-admin": "ok", "content-type": "application/json" };
const req = async (path: string, method = "GET", body?: unknown, headers: Record<string, string> = admin) => {
  const res = await app().request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
};
let eventId: number;

before(async () => {
  ({ db, close } = await createDb({ memory: true }));
  eventId = (await req("/api/kiosk/events", "POST", { club: "みゆき会", kind: "朝ご飯会" })).body.id;
});
after(async () => close());

test("given 管理者でない / when 質問一覧 / then 401", async () => {
  assert.equal((await req("/api/admin/questions", "GET", undefined, {})).status, 401);
});

test("given 初期状態 / when 質問一覧 / then 最初からある質問が決まった順で並び、選択肢も返る", async () => {
  const qs = (await req("/api/admin/questions")).body;
  assert.deepEqual(qs.map((q: any) => q.key), ["name", "club", "town", "trigger", "ageGroup", "gender", "livingAlone", "mobility"]);
  assert.ok(qs.every((q: any) => q.builtin));
  assert.ok(qs.find((q: any) => q.key === "gender").options.includes("女性"));
});

test("given 選択肢の質問を追加 / when 受付のセッション / then 有効な質問として順番どおりに出る", async () => {
  const r = await req("/api/admin/questions", "POST", { title: "朝ごはんは毎日食べますか？", type: "single", options: ["毎日", "ときどき", "ほとんど食べない"], optional: true });
  assert.equal(r.status, 201);
  assert.equal(r.body.builtin, false);
  const s = (await req(`/api/kiosk/events/${eventId}/session`, "GET", undefined, {})).body;
  const last = s.questions[s.questions.length - 1];
  assert.equal(last.title, "朝ごはんは毎日食べますか？");
  assert.deepEqual(last.options, ["毎日", "ときどき", "ほとんど食べない"]);
});

test("given 選択肢が空の選択式 / when 追加 / then 400", async () => {
  assert.equal((await req("/api/admin/questions", "POST", { title: "x", type: "single", options: [] })).status, 400);
});

test("given 追加した質問 / when 受付で回答 / then 保存され、選択肢にない値は 400", async () => {
  const q = (await req("/api/admin/questions")).body.find((x: any) => x.title === "朝ごはんは毎日食べますか？");
  const bad = await req(`/api/kiosk/events/${eventId}/register`, "POST", { consent: true, name: "a", extra: { [q.id]: "週1" } }, {});
  assert.equal(bad.status, 400);
  const ok = await req(`/api/kiosk/events/${eventId}/register`, "POST", { consent: true, name: "回答 花子", extra: { [q.id]: "毎日" } }, {});
  assert.equal(ok.status, 201);
  const d = (await req("/api/admin/dashboard")).body;
  const b = d.breakdowns.custom.find((x: any) => x.title === "朝ごはんは毎日食べますか？");
  assert.deepEqual(b.rows, [{ label: "毎日", count: 1 }]);
});

test("given 同意しない人 / when 追加質問に回答 / then 回答は保存しない", async () => {
  const q = (await req("/api/admin/questions")).body.find((x: any) => x.title === "朝ごはんは毎日食べますか？");
  await req(`/api/kiosk/events/${eventId}/register`, "POST", { consent: false, extra: { [q.id]: "ときどき" } }, {});
  const d = (await req("/api/admin/dashboard")).body;
  const b = d.breakdowns.custom.find((x: any) => x.id === q.id);
  assert.equal(b.rows.find((r: any) => r.label === "ときどき"), undefined);
});

test("given 文字で答える質問 / when 追加して回答 / then 保存され、長すぎる回答は 400", async () => {
  const q = (await req("/api/admin/questions", "POST", { title: "やってみたいことは？", type: "text", optional: true })).body;
  assert.equal((await req(`/api/kiosk/events/${eventId}/register`, "POST", { consent: true, extra: { [q.id]: "あ".repeat(201) } }, {})).status, 400);
  assert.equal((await req(`/api/kiosk/events/${eventId}/register`, "POST", { consent: true, extra: { [q.id]: "歌を歌いたい" } }, {})).status, 201);
  const csv = await app().request("/api/admin/export/answers.csv", { headers: admin });
  assert.ok((await csv.text()).includes("歌を歌いたい"));
});

test("given 追加した質問 / when 題名と選択肢を編集 / then 反映される", async () => {
  const q = (await req("/api/admin/questions")).body.find((x: any) => x.title === "朝ごはんは毎日食べますか？");
  const r = await req(`/api/admin/questions/${q.id}`, "PATCH", { title: "朝ごはんは食べますか？", options: ["毎日", "ときどき", "食べない"] });
  assert.equal(r.status, 200);
  assert.equal(r.body.title, "朝ごはんは食べますか？");
  assert.deepEqual(r.body.options, ["毎日", "ときどき", "食べない"]);
});

test("given 最初からある質問 / when 題名・必須・表示を変える / then 変わるが、選択肢の変更と削除はできない", async () => {
  const g = (await req("/api/admin/questions")).body.find((x: any) => x.key === "gender");
  const r = await req(`/api/admin/questions/${g.id}`, "PATCH", { title: "性別（答えなくてもOK）", optional: true, enabled: false });
  assert.equal(r.status, 200);
  assert.equal(r.body.title, "性別（答えなくてもOK）");
  assert.equal((await req(`/api/admin/questions/${g.id}`, "PATCH", { options: ["A", "B"] })).status, 400);
  assert.equal((await req(`/api/admin/questions/${g.id}`, "DELETE")).status, 400);
  // 出さない設定の質問は受付に出ない
  const s = (await req(`/api/kiosk/events/${eventId}/session`, "GET", undefined, {})).body;
  assert.equal(s.questions.find((x: any) => x.key === "gender"), undefined);
});

test("given 並び順を指定 / when 並べ替え / then その順で返る", async () => {
  const ids = (await req("/api/admin/questions")).body.map((q: any) => q.id);
  const reversed = [...ids].reverse();
  assert.equal((await req("/api/admin/questions/order", "PUT", { ids: reversed })).status, 200);
  assert.deepEqual((await req("/api/admin/questions")).body.map((q: any) => q.id), reversed);
});

test("given 追加した質問 / when 削除 / then 一覧と受付から消え、回答も消える", async () => {
  const q = (await req("/api/admin/questions")).body.find((x: any) => x.title === "やってみたいことは？");
  assert.equal((await req(`/api/admin/questions/${q.id}`, "DELETE")).status, 200);
  assert.equal((await req("/api/admin/questions")).body.find((x: any) => x.id === q.id), undefined);
  const csv = await (await app().request("/api/admin/export/answers.csv", { headers: admin })).text();
  assert.ok(!csv.includes("歌を歌いたい"));
});
