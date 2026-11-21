// 管理者の Google ログイン。ID トークンを検証し、許可リストのメールだけ署名付き Cookie のセッションを発行する。
import { Hono, type Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { z } from "zod";

export type AuthConfig = { clientId: string; adminEmails: string[]; sessionSecret: string; production: boolean; devBypass: boolean };
export type GoogleVerifier = (idToken: string) => Promise<{ email?: string; email_verified?: boolean } | null>;

const COOKIE = "admin_session";
const TTL_SEC = 8 * 60 * 60;

export function googleVerifier(clientId: string): GoogleVerifier {
  return async (idToken) => {
    const { OAuth2Client } = await import("google-auth-library");
    try {
      const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken, audience: clientId });
      return ticket.getPayload() ?? null;
    } catch {
      return null;
    }
  };
}

const allowed = (cfg: AuthConfig, email?: string) => !!email && cfg.adminEmails.includes(email.toLowerCase());

export function makeAdminAuthenticator(cfg: AuthConfig) {
  return async (c: Context): Promise<string | null> => {
    if (cfg.devBypass && !cfg.production) return "dev@localhost";
    const v = await getSignedCookie(c, cfg.sessionSecret, COOKIE);
    if (!v) return null;
    const [email, exp] = v.split("|");
    if (!exp || Number(exp) < Date.now()) return null;
    return allowed(cfg, email) ? email : null;
  };
}

export function authRoutes(cfg: AuthConfig, verify: GoogleVerifier) {
  const r = new Hono();
  r.get("/config", (c) => c.json({ googleClientId: cfg.clientId, devBypass: cfg.devBypass && !cfg.production }));
  r.post("/google", async (c) => {
    const body = z.object({ credential: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const payload = await verify(body.data.credential);
    if (!payload?.email_verified || !allowed(cfg, payload.email)) return c.json({ error: "forbidden" }, 403);
    const email = payload.email!.toLowerCase();
    await setSignedCookie(c, COOKIE, `${email}|${Date.now() + TTL_SEC * 1000}`, cfg.sessionSecret, {
      httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: TTL_SEC,
    });
    return c.json({ email });
  });
  r.post("/logout", (c) => {
    deleteCookie(c, COOKIE, { path: "/", secure: true });
    return c.json({ ok: true });
  });
  return r;
}
