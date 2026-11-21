import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDb, type Db } from "../db/client.js";
import { createApp } from "./app.js";

let db: Db;
let close: () => Promise<void>;
const SECRET = "t".repeat(32);
// テストでは Google 認証の代わりに、ヘッダーで管理者を偽装できる認証関数を渡す
const app = () =>
  createApp({ db, sessionSecret: SECRET, authenticateAdmin: async (c) => (c.req.header("x-test-admin") === "ok" ? "admin@example.com" : null) });
const admin = { "x-test-admin": "ok", "content-type": "application/json" };
let device: Record<string, string>;

before(async () => {
  ({ db, close } = await createDb({ memory: true }));
  await app().request("/api/admin/options", { method: "PUT", headers: admin, body: JSON.stringify({ town: ["A町", "B町"], club: ["みゆき会", "さくら会"] }) });
  await app().request("/api/admin/kiosk-passcode", { method: "PUT", headers: admin, body: JSON.stringify({ passcode: "asagohan" }) });
  const res = await app().request("/api/kiosk/device", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode: "asagohan" }) });
  device = { cookie: res.headers.get("set-cookie")!.split(";")[0], "content-type": "application/json" };
});
after(async () => close());

async function json(res: Response) {
  return { status: res.status, body: (await res.json()) as any };
}

async function newEvent(extra: Record<string, unknown> = {}) {
  const r = await json(await app().request("/api/admin/events", { method: "POST", headers: admin, body: JSON.stringify({ date: "2026-11-29", kind: "朝ご飯会", place: "集会所", host: "みゆき会", nextDate: "2026-12-06", ...extra }) }));
  assert.equal(r.status, 201);
  return r.body as { id: number; kioskToken: string };
}
const post = (path: string, body: unknown, headers = device) => app().request(path, { method: "POST", headers, body: JSON.stringify(body) });

test("given 認証なし / when 管理APIを呼ぶ / then 401", async () => {
  assert.equal((await app().request("/api/admin/events")).status, 401);
});

test("given 端末の登録なし / when 受付APIを呼ぶ / then 401", async () => {
  assert.equal((await app().request("/api/kiosk/clubs")).status, 401);
});

test("given 間違った合言葉 / when 端末を登録 / then 401 で Cookie は出ない", async () => {
  const res = await post("/api/kiosk/device", { passcode: "wrong" }, { "content-type": "application/json" });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("set-cookie"), null);
});

test("given 登録済みの端末 / when 老人会を選んでイベントを開く / then その会のイベントだけが出る", async () => {
  const mine = await newEvent();
  await newEvent({ host: "さくら会" });
  const clubs = await json(await app().request("/api/kiosk/clubs", { headers: device }));
  assert.deepEqual(clubs.body, ["みゆき会", "さくら会"]);
  const evs = await json(await app().request(`/api/kiosk/events?club=${encodeURIComponent("みゆき会")}`, { headers: device }));
  assert.ok(evs.body.some((e: any) => e.id === mine.id));
  assert.ok(evs.body.every((e: any) => e.host === "みゆき会"));
  const s = await json(await app().request(`/api/kiosk/events/${mine.id}/session`, { headers: device }));
  assert.equal(s.body.event.kind, "朝ご飯会");
  assert.deepEqual(s.body.options.town, ["A町", "B町"]);
  assert.equal(s.body.event.kioskToken, undefined);
});

test("given 初めての人 / when 名前・気持ち付きで登録 / then IDが振られ、来たときの気持ちが記録される", async () => {
  const ev = await newEvent();
  const reg = await json(await post(`/api/kiosk/events/${ev.id}/register`, { consent: true, name: "山田 花子", club: "みゆき会", town: "A町", trigger: "チラシ", mood: 4 }));
  assert.equal(reg.status, 201);
  assert.match(reg.body.code, /^\d{4}$/);
  assert.equal(reg.body.name, "山田 花子");
  const detail = await json(await app().request(`/api/admin/events/${ev.id}`, { headers: admin }));
  const a = detail.body.attendances.find((x: any) => x.code === reg.body.code);
  assert.equal(a.name, "山田 花子");
  assert.equal(a.moodBefore, 4);
});

test("given 前回登録した人 / when 次の回にIDで入る / then 名前で迎えられ、同じ回にもう一度入ると already", async () => {
  const ev1 = await newEvent();
  const reg = await json(await post(`/api/kiosk/events/${ev1.id}/register`, { consent: true, name: "佐藤 一郎" }));
  const ev2 = await newEvent({ date: "2026-12-06" });
  const r = await json(await post(`/api/kiosk/events/${ev2.id}/checkin`, { code: reg.body.code, mood: 3 }));
  assert.equal(r.body.status, "ok");
  assert.equal(r.body.name, "佐藤 一郎");
  const again = await json(await post(`/api/kiosk/events/${ev2.id}/checkin`, { code: reg.body.code }));
  assert.equal(again.body.status, "already");
});

test("given 受付済みの人 / when 退出（帰るときの気持ち付き） / then 退出時刻と気持ちが記録される", async () => {
  const ev = await newEvent();
  const reg = await json(await post(`/api/kiosk/events/${ev.id}/register`, { consent: true, name: "鈴木", mood: 2 }));
  const out = await json(await post(`/api/kiosk/events/${ev.id}/checkout`, { code: reg.body.code, mood: 5 }));
  assert.equal(out.body.status, "ok");
  assert.equal(out.body.nextDate, "2026-12-06");
  const detail = await json(await app().request(`/api/admin/events/${ev.id}`, { headers: admin }));
  const a = detail.body.attendances.find((x: any) => x.code === reg.body.code);
  assert.equal(a.moodAfter, 5);
  assert.ok(a.checkedOutAt);
});

test("given 受付していない人 / when 退出 / then not-checked-in", async () => {
  const ev1 = await newEvent();
  const reg = await json(await post(`/api/kiosk/events/${ev1.id}/register`, { consent: true }));
  const ev2 = await newEvent({ date: "2026-12-20" });
  const out = await json(await post(`/api/kiosk/events/${ev2.id}/checkout`, { code: reg.body.code }));
  assert.equal(out.body.status, "not-checked-in");
});

test("given 存在しないID / when 受付 / then unknown", async () => {
  const ev = await newEvent();
  assert.equal((await json(await post(`/api/kiosk/events/${ev.id}/checkin`, { code: "9999" }))).body.status, "unknown");
});

test("given 同意しない / when 名前付きで登録 / then 名前も属性も保存されない", async () => {
  const ev = await newEvent();
  const reg = await json(await post(`/api/kiosk/events/${ev.id}/register`, { consent: false, name: "高橋", gender: "女性", town: "A町" }));
  assert.equal(reg.body.name, null);
  const list = await json(await app().request("/api/admin/participants", { headers: admin }));
  const p = list.body.find((x: any) => x.code === reg.body.code);
  assert.equal(p.name, null);
  assert.equal(p.town, null);
});

test("given 選択肢にない値や範囲外の気持ち / when 登録 / then 400", async () => {
  const ev = await newEvent();
  assert.equal((await post(`/api/kiosk/events/${ev.id}/register`, { consent: true, gender: "<script>" })).status, 400);
  assert.equal((await post(`/api/kiosk/events/${ev.id}/register`, { consent: true, mood: 9 })).status, 400);
});

test("given 端末なしでもイベントの受付トークン / when そのイベントのセッション / then 開ける（管理画面のQRからの入口）", async () => {
  const ev = await newEvent();
  const res = await app().request(`/api/kiosk/events/${ev.id}/session`, { headers: { "x-kiosk-token": ev.kioskToken } });
  assert.equal(res.status, 200);
  const other = await newEvent();
  assert.equal((await app().request(`/api/kiosk/events/${other.id}/session`, { headers: { "x-kiosk-token": ev.kioskToken } })).status, 401);
});

test("given 出席者に役割と気持ち / when ダッシュボード / then 担い手・気持ちの変化・地域ヒートマップが返る", async () => {
  const ev = await newEvent({ date: "2026-12-13" });
  const reg = await json(await post(`/api/kiosk/events/${ev.id}/register`, { consent: true, town: "B町", mood: 2 }));
  await post(`/api/kiosk/events/${ev.id}/checkout`, { code: reg.body.code, mood: 4 });
  const detail = await json(await app().request(`/api/admin/events/${ev.id}`, { headers: admin }));
  const att = detail.body.attendances.find((a: any) => a.code === reg.body.code);
  assert.equal((await app().request(`/api/admin/attendances/${att.id}`, { method: "PATCH", headers: admin, body: JSON.stringify({ role: "担当" }) })).status, 200);
  const d = await json(await app().request("/api/admin/dashboard?from=2026-12-13&to=2026-12-13", { headers: admin }));
  assert.equal(d.body.kpis.helpers, 1);
  assert.equal(d.body.mood.pairs, 1);
  assert.equal(d.body.mood.avgChange, 2);
  assert.ok(d.body.townHeat.towns.includes("B町"));
});

test("given 管理者 / when 参加者CSV / then 名前は含めない（集計用）", async () => {
  const text = (await (await app().request("/api/admin/export/participants.csv", { headers: admin })).text()).replace(/^﻿/, "");
  assert.ok(text.startsWith("code,consent,"));
  assert.ok(!text.split("\n")[0].includes("name"));
});

// ---------- 試用モード（認証なし）: 運営がその場で老人会と会を入力して始める ----------
const openApp = () => createApp({ db, sessionSecret: SECRET, kioskOpen: true, authenticateAdmin: async () => "認証なし" });
const openPost = (path: string, body: unknown) => openApp().request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("given 試用モード / when 端末登録なしで老人会一覧 / then 開ける", async () => {
  assert.equal((await openApp().request("/api/kiosk/clubs")).status, 200);
});

test("given 試用モード / when 運営が老人会と会の種類を入れて始める / then 今日の会ができ、同じ組み合わせなら同じ会を開く", async () => {
  const a = await json(await openPost("/api/kiosk/events", { club: "ひまわり会", kind: "朝ご飯会", nextDate: "2026-12-06" }));
  assert.equal(a.status, 201);
  assert.equal(a.body.host, "ひまわり会");
  assert.equal(a.body.kind, "朝ご飯会");
  const b = await json(await openPost("/api/kiosk/events", { club: "ひまわり会", kind: "朝ご飯会" }));
  assert.equal(b.body.id, a.body.id);
  const c = await json(await openPost("/api/kiosk/events", { club: "ひまわり会", kind: "映画会" }));
  assert.notEqual(c.body.id, a.body.id);
  // 新しい老人会は一覧にも加わる
  const clubs = await json(await openApp().request("/api/kiosk/clubs"));
  assert.ok(clubs.body.includes("ひまわり会"));
  // そのまま受付できる
  const reg = await json(await openPost(`/api/kiosk/events/${a.body.id}/register`, { consent: true, name: "試用 太郎" }));
  assert.equal(reg.status, 201);
});

test("given 試用モードでない / when 会を作ろうとする / then 401", async () => {
  assert.equal((await app().request("/api/kiosk/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ club: "x", kind: "朝ご飯会" }) })).status, 401);
});

test("given 空の老人会名 / when 会を作る / then 400", async () => {
  assert.equal((await openPost("/api/kiosk/events", { club: " ", kind: "朝ご飯会" })).status, 400);
});
