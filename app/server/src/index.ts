// サーバーの起動。API と、ビルド済みの画面（web/dist）を1つのサービスで配信する（Cloud Run 1サービス構成）。
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "./db/client.js";
import { createApp } from "./http/app.js";
import { authRoutes, googleVerifier, makeAdminAuthenticator, type AuthConfig } from "./http/auth.js";

const env = process.env;
const production = env.NODE_ENV === "production";
const cfg: AuthConfig = {
  clientId: env.GOOGLE_CLIENT_ID ?? "",
  adminEmails: (env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  sessionSecret: env.SESSION_SECRET ?? (production ? "" : "dev-only-session-secret-0123456789abcdef"),
  production,
  devBypass: env.AUTH_DEV_BYPASS === "1",
  open: env.ADMIN_AUTH === "none",
};
if (production && cfg.sessionSecret.length < 32) {
  console.error("SESSION_SECRET（32文字以上）が設定されていません");
  process.exit(1);
}

const { db } = await createDb({ url: env.DATABASE_URL, dataDir: env.PGLITE_DIR });

const app = new Hono();
// 検索エンジンに載せない（認証なしで公開する場合の最低限の対策）
app.use("*", async (c, next) => { await next(); c.header("X-Robots-Tag", "noindex, nofollow"); });
app.use("*", secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://accounts.google.com/gsi/client"],
    frameSrc: ["https://accounts.google.com/"],
    connectSrc: ["'self'", "https://accounts.google.com/gsi/"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com/gsi/style"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:", "blob:"],
    mediaSrc: ["'self'", "blob:"],
  },
  crossOriginOpenerPolicy: "same-origin-allow-popups",
}));
app.route("/api/auth", authRoutes(cfg, googleVerifier(cfg.clientId)));
app.route("/", createApp({ db, sessionSecret: cfg.sessionSecret, kioskOpen: !!cfg.open, authenticateAdmin: makeAdminAuthenticator(cfg) }));

// 画面（SPA）
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (existsSync(webDist)) {
  const indexHtml = readFileSync(path.join(webDist, "index.html"), "utf8");
  app.use("/assets/*", serveStatic({ root: path.relative(process.cwd(), webDist) }));
  app.use("/*", serveStatic({ root: path.relative(process.cwd(), webDist) }));
  app.get("*", (c) => (c.req.path.startsWith("/api/") ? c.json({ error: "not found" }, 404) : c.html(indexHtml)));
}

const port = Number(env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, () => console.log(`listening on :${port}`));
