// ネコ受付（/neko）が使う API のテスト。試用モード（運営がその場で会を始める）で確かめる。
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db/client.js";
import { participants } from "../db/schema.js";
import { createApp } from "./app.js";

let db: Db;
let close: () => Promise<void>;
const openApp = () => createApp({ db, sessionSecret: "t".repeat(32), kioskOpen: true, authenticateAdmin: async () => "認証なし" });
const post = async (path: string, body: unknown) => {
  const res = await openApp().request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
};
const get = async (path: string) => {
  const res = await openApp().request(path);
  return { status: res.status, body: (await res.json()) as any };
};

before(async () => { ({ db, close } = await createDb({ memory: true })); });
after(async () => close());

test("given 試用モード / when 選択肢にない会の種類（自由入力）で始める / then 会ができる", async () => {
  const r = await post("/api/kiosk/events", { club: "みゆき会", kind: "体操教室" });
  assert.equal(r.status, 201);
  assert.equal(r.body.kind, "体操教室");
});

test("given 空の会の種類 / when 始める / then 400", async () => {
  assert.equal((await post("/api/kiosk/events", { club: "みゆき会", kind: "  " })).status, 400);
});

test("given 同意あり / when 生まれ年つきで登録 / then 生まれ年が保存される", async () => {
  const ev = await post("/api/kiosk/events", { club: "みゆき会", kind: "朝ご飯会" });
  const r = await post(`/api/kiosk/events/${ev.body.id}/register`, { consent: true, name: "はなこ", gender: "女性", birthYear: 1945, mood: 5 });
  assert.equal(r.status, 201);
  const [p] = await db.select().from(participants).where(eq(participants.code, r.body.code));
  assert.equal(p.birthYear, 1945);
});

test("given 同意なし / when 生まれ年つきで登録 / then 生まれ年は保存されない", async () => {
  const ev = await post("/api/kiosk/events", { club: "みゆき会", kind: "朝ご飯会" });
  const r = await post(`/api/kiosk/events/${ev.body.id}/register`, { consent: false, name: "ないしょ", birthYear: 1945 });
  const [p] = await db.select().from(participants).where(eq(participants.code, r.body.code));
  assert.equal(p.birthYear, null);
  assert.equal(p.name, null);
});

test("given 範囲外の生まれ年 / when 登録 / then 400", async () => {
  const ev = await post("/api/kiosk/events", { club: "みゆき会", kind: "朝ご飯会" });
  assert.equal((await post(`/api/kiosk/events/${ev.body.id}/register`, { consent: true, birthYear: 1800 })).status, 400);
});

test("given 登録でもらったID / when 次の会でIDだけで入室し、IDだけで退出 / then 入室・退出が記録される", async () => {
  const ev1 = await post("/api/kiosk/events", { club: "みゆき会", kind: "ご飯会" });
  const reg = await post(`/api/kiosk/events/${ev1.body.id}/register`, { consent: true, name: "たろう", mood: 3 });
  const ev2 = await post("/api/kiosk/events", { club: "みゆき会", kind: "映画会" });
  const inn = await post(`/api/kiosk/events/${ev2.body.id}/checkin`, { code: reg.body.code, mood: 5 });
  assert.equal(inn.body.status, "ok");
  assert.equal(inn.body.name, "たろう");
  const out = await post(`/api/kiosk/events/${ev2.body.id}/checkout`, { code: reg.body.code });
  assert.equal(out.body.status, "ok");
});
