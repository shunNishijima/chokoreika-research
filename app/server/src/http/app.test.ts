import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDb, type Db } from "../db/client.js";
import { createApp } from "./app.js";

let db: Db;
let close: () => Promise<void>;
// テストでは Google 認証の代わりに、ヘッダーで管理者を偽装できる認証関数を渡す
const app = () =>
  createApp({ db, authenticateAdmin: async (c) => (c.req.header("x-test-admin") === "ok" ? "admin@example.com" : null) });
const admin = { "x-test-admin": "ok", "content-type": "application/json" };

before(async () => {
  ({ db, close } = await createDb({ memory: true }));
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
const kiosk = (token: string) => ({ "x-kiosk-token": token, "content-type": "application/json" });

test("given 認証なし / when 管理APIを呼ぶ / then 401", async () => {
  const res = await app().request("/api/admin/events");
  assert.equal(res.status, 401);
});

test("given 不正な受付トークン / when 受付APIを呼ぶ / then 401", async () => {
  const res = await app().request("/api/kiosk/session", { headers: kiosk("bad") });
  assert.equal(res.status, 401);
});

test("given 開催を作成 / when 受付トークンでセッション取得 / then 開催情報と選択肢が返る", async () => {
  await app().request("/api/admin/options", { method: "PUT", headers: admin, body: JSON.stringify({ town: ["A町", "B町"], club: ["みゆき会"] }) });
  const ev = await newEvent();
  const r = await json(await app().request("/api/kiosk/session", { headers: kiosk(ev.kioskToken) }));
  assert.equal(r.status, 200);
  assert.equal(r.body.event.kind, "朝ご飯会");
  assert.deepEqual(r.body.options.town, ["A町", "B町"]);
  assert.deepEqual(r.body.options.club, ["みゆき会"]);
});

test("given 初めての人 / when 登録 / then 4桁の番号が振られ出席も記録、同じ回に番号で受付すると already", async () => {
  const ev = await newEvent();
  const reg = await json(await app().request("/api/kiosk/register", { method: "POST", headers: kiosk(ev.kioskToken), body: JSON.stringify({ consent: true, ageGroup: "75〜84歳", gender: "女性", town: "A町", club: "みゆき会", trigger: "チラシ" }) }));
  assert.equal(reg.status, 201);
  assert.match(reg.body.code, /^\d{4}$/);
  assert.equal(reg.body.nextDate, "2026-12-06");
  const again = await json(await app().request("/api/kiosk/checkin", { method: "POST", headers: kiosk(ev.kioskToken), body: JSON.stringify({ code: reg.body.code }) }));
  assert.equal(again.body.status, "already");
});

test("given 前回登録した人 / when 次の回に番号で受付 / then ok で出席が1件増える", async () => {
  const ev1 = await newEvent();
  const reg = await json(await app().request("/api/kiosk/register", { method: "POST", headers: kiosk(ev1.kioskToken), body: JSON.stringify({ consent: true }) }));
  const ev2 = await newEvent({ date: "2026-12-06" });
  const r = await json(await app().request("/api/kiosk/checkin", { method: "POST", headers: kiosk(ev2.kioskToken), body: JSON.stringify({ code: reg.body.code }) }));
  assert.equal(r.body.status, "ok");
  const detail = await json(await app().request(`/api/admin/events/${ev2.id}`, { headers: admin }));
  assert.equal(detail.body.attendances.length, 1);
});

test("given 存在しない番号 / when 受付 / then unknown", async () => {
  const ev = await newEvent();
  const r = await json(await app().request("/api/kiosk/checkin", { method: "POST", headers: kiosk(ev.kioskToken), body: JSON.stringify({ code: "9999" }) }));
  assert.equal(r.body.status, "unknown");
});

test("given 同意しない / when 登録 / then 属性は保存されない", async () => {
  const ev = await newEvent();
  const reg = await json(await app().request("/api/kiosk/register", { method: "POST", headers: kiosk(ev.kioskToken), body: JSON.stringify({ consent: false, gender: "女性", town: "A町" }) }));
  const list = await json(await app().request("/api/admin/participants", { headers: admin }));
  const p = list.body.find((x: any) => x.code === reg.body.code);
  assert.equal(p.consent, false);
  assert.equal(p.gender, null);
  assert.equal(p.town, null);
});

test("given 選択肢にない値 / when 登録 / then 400", async () => {
  const ev = await newEvent();
  const res = await app().request("/api/kiosk/register", { method: "POST", headers: kiosk(ev.kioskToken), body: JSON.stringify({ consent: true, gender: "<script>" }) });
  assert.equal(res.status, 400);
});

test("given 出席者に役割を付ける / when ダッシュボード / then 担い手が数えられ、地域ヒートマップが返る", async () => {
  const ev = await newEvent({ date: "2026-12-13" });
  const reg = await json(await app().request("/api/kiosk/register", { method: "POST", headers: kiosk(ev.kioskToken), body: JSON.stringify({ consent: true, town: "B町" }) }));
  const detail = await json(await app().request(`/api/admin/events/${ev.id}`, { headers: admin }));
  const att = detail.body.attendances.find((a: any) => a.code === reg.body.code);
  const patch = await app().request(`/api/admin/attendances/${att.id}`, { method: "PATCH", headers: admin, body: JSON.stringify({ role: "担当" }) });
  assert.equal(patch.status, 200);
  const d = await json(await app().request("/api/admin/dashboard?from=2026-12-13&to=2026-12-13", { headers: admin }));
  assert.equal(d.body.kpis.helpers, 1);
  assert.ok(d.body.townHeat.towns.includes("B町"));
});

test("given 管理者 / when CSV出力 / then 見出し付きのCSVが返る", async () => {
  const res = await app().request("/api/admin/export/participants.csv", { headers: admin });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.replace(/^﻿/, "").startsWith("code,consent,"));
});
