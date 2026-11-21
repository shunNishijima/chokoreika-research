import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { authRoutes, makeAdminAuthenticator, type AuthConfig } from "./auth.js";

const base: AuthConfig = { clientId: "cid", adminEmails: ["boss@example.com"], sessionSecret: "s".repeat(32), production: true, devBypass: false };

function appWith(cfg: AuthConfig, verify: (t: string) => Promise<{ email?: string; email_verified?: boolean } | null>) {
  const app = new Hono();
  app.route("/api/auth", authRoutes(cfg, verify));
  const auth = makeAdminAuthenticator(cfg);
  app.get("/who", async (c) => c.json({ email: await auth(c) }));
  return app;
}

test("given 本番 / when 開発用バイパスを有効にしても / then 認証は通らない", async () => {
  const app = appWith({ ...base, devBypass: true }, async () => null);
  const r = await (await app.request("/who")).json();
  assert.equal(r.email, null);
});

test("given 許可リストのメール / when Googleトークンでログイン / then セッションCookieで管理者と判定される", async () => {
  const app = appWith(base, async () => ({ email: "boss@example.com", email_verified: true }));
  const login = await app.request("/api/auth/google", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential: "tok" }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  const r = await (await app.request("/who", { headers: { cookie: cookie.split(";")[0] } })).json();
  assert.equal(r.email, "boss@example.com");
});

test("given 許可リストにないメール / when ログイン / then 403", async () => {
  const app = appWith(base, async () => ({ email: "other@example.com", email_verified: true }));
  const res = await app.request("/api/auth/google", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential: "tok" }) });
  assert.equal(res.status, 403);
});

test("given メール未確認 / when ログイン / then 403", async () => {
  const app = appWith(base, async () => ({ email: "boss@example.com", email_verified: false }));
  const res = await app.request("/api/auth/google", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential: "tok" }) });
  assert.equal(res.status, 403);
});

test("given 改ざんしたCookie / when 判定 / then 管理者ではない", async () => {
  const app = appWith(base, async () => null);
  const r = await (await app.request("/who", { headers: { cookie: "admin_session=boss@example.com|9999999999999.fake" } })).json();
  assert.equal(r.email, null);
});

test("given 開発環境でバイパス有効 / when 判定 / then 開発用の管理者になる", async () => {
  const app = appWith({ ...base, production: false, devBypass: true }, async () => null);
  const r = await (await app.request("/who")).json();
  assert.equal(r.email, "dev@localhost");
});

test("given 認証なし（open）を明示 / when 判定 / then 本番でも管理者として通す", async () => {
  const app = appWith({ ...base, open: true }, async () => null);
  const r = await (await app.request("/who")).json();
  assert.equal(r.email, "認証なし");
  const cfg = await (await app.request("/api/auth/config")).json();
  assert.equal(cfg.open, true);
});

test("given open を指定しない / when 判定 / then 従来どおり認証が必要", async () => {
  const app = appWith(base, async () => null);
  assert.equal((await (await app.request("/who")).json()).email, null);
});
