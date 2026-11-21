// デモデータ（ダッシュボードの見た目を確かめるためのモック）の投入と削除のテスト
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

before(async () => { ({ db, close } = await createDb({ memory: true })); });
after(async () => close());

test("given 管理者でない / when デモデータを入れる / then 401", async () => {
  assert.equal((await req("/api/admin/demo", "POST", {}, { "content-type": "application/json" })).status, 401);
});

test("given 実データが1件 / when デモデータを入れる / then ダッシュボードに複数の会・市町村・気持ちの変化が出る", async () => {
  const ev = await req("/api/kiosk/events", "POST", { club: "みゆき会", kind: "朝ご飯会" });
  await req(`/api/kiosk/events/${ev.body.id}/register`, "POST", { consent: true, name: "本物 一郎", town: "豊中市" });
  const r = await req("/api/admin/demo", "POST", {});
  assert.equal(r.status, 201);
  assert.ok(r.body.participants >= 60);
  const d = (await req("/api/admin/dashboard")).body;
  assert.ok(d.kpis.events >= 10);
  assert.ok(d.townHeat.towns.length >= 6);
  assert.ok(d.mood.pairs > 20);
  assert.ok(d.kpis.helpers > 0);
  assert.equal((await req("/api/admin/demo")).body.present, true);
});

test("given デモデータを入れ済み / when もう一度入れる / then 二重には入らない", async () => {
  const before = (await req("/api/admin/participants")).body.length;
  await req("/api/admin/demo", "POST", {});
  assert.equal((await req("/api/admin/participants")).body.length, before);
});

test("given デモデータと実データ / when デモデータを消す / then デモだけ消えて実データは残る", async () => {
  const r = await req("/api/admin/demo", "DELETE");
  assert.equal(r.status, 200);
  const ps = (await req("/api/admin/participants")).body;
  assert.deepEqual(ps.map((p: any) => p.name), ["本物 一郎"]);
  const evs = (await req("/api/admin/events")).body;
  assert.equal(evs.length, 1);
  assert.equal((await req("/api/admin/demo")).body.present, false);
});
