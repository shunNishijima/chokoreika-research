// 報告書 API（/api/admin/report）のテスト
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDb, type Db } from "../db/client.js";
import { createApp } from "./app.js";

let db: Db;
let close: () => Promise<void>;
const app = (admin = true) => createApp({ db, sessionSecret: "t".repeat(32), kioskOpen: true, authenticateAdmin: async () => (admin ? "admin@example.com" : null) });
const post = (path: string, body: unknown) => app().request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

before(async () => { ({ db, close } = await createDb({ memory: true })); });
after(async () => close());

test("given 管理者でない / when 報告書 / then 401", async () => {
  assert.equal((await app(false).request("/api/admin/report")).status, 401);
});

test("given 受付の記録 / when 報告書 / then ダッシュボードの数字と報告書の指標が一緒に返る", async () => {
  const ev = (await (await post("/api/kiosk/events", { club: "みゆき会", kind: "朝ご飯会" })).json()) as { id: number };
  const reg = (await (await post(`/api/kiosk/events/${ev.id}/register`, { consent: true, name: "はなこ", birthYear: 1945, mood: 5 })).json()) as { code: string };
  await post(`/api/kiosk/events/${ev.id}/checkout`, { code: reg.code });
  const res = await app().request("/api/admin/report?suppress=0");
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.dashboard.kpis.visits, 1);
  assert.equal(body.report.monthly.length, 1);
  assert.equal(body.report.ageBands[0].label, "75〜84歳");
  assert.equal(body.report.stay.count, 1);
  assert.equal(body.report.hosts[0].label, "みゆき会");
});

test("given 外部共有（既定） / when 報告書 / then 5人未満の内訳は隠れる", async () => {
  const body = (await (await app().request("/api/admin/report")).json()) as any;
  assert.ok(body.report.ageBands.every((b: any) => b.count === null));
});
