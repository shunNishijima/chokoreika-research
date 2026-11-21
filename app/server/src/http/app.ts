// HTTP API。受付（iPad）用と管理者用に分ける。
import { Hono, type Context } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { and, asc, desc, eq, gte, like, max } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { attendances, events, options, participants, settings } from "../db/schema.js";
import { buildDashboard, nextCode } from "../domain/metrics.js";
import { buildReport } from "../domain/report.js";
import { CHOICES } from "../domain/choices.js";
import { DEMO_NAME_PREFIX, DEMO_PLACE, generateDemo } from "../domain/demo.js";

// kioskOpen=true は試用モード: 受付の端末登録（合言葉）なしで使え、運営がその場で会を作れる
type Deps = { db: Db; sessionSecret: string; kioskOpen?: boolean; authenticateAdmin: (c: Context) => Promise<string | null> };

const opt = (values: readonly string[]) => z.enum(values as [string, ...string[]]).nullish();
const mood = z.number().int().min(1).max(5).nullish();
const registerSchema = z.object({
  consent: z.boolean(),
  name: z.string().trim().max(40).nullish(),
  ageGroup: opt(CHOICES.ageGroup),
  gender: opt(CHOICES.gender),
  town: z.string().max(40).nullish(),
  club: z.string().max(40).nullish(),
  trigger: opt(CHOICES.trigger),
  livingAlone: opt(CHOICES.livingAlone),
  mobility: opt(CHOICES.mobility),
  birthYear: z.number().int().min(1900).max(2030).nullish(),
  mood,
});
const codeSchema = z.object({ code: z.string().regex(/^\d{1,4}$/), mood });
const eventSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: opt(CHOICES.kind).transform((v) => v ?? "朝ご飯会"),
  place: z.string().max(80).default(""),
  host: z.string().max(40).default(""),
  nextDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCSV(rows: Record<string, unknown>[], cols: string[]) {
  return "\uFEFF" + [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
}

// 合言葉は scrypt でハッシュ化して保存する
function hashPasscode(pass: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pass, salt, 32).toString("hex")}`;
}
function checkPasscode(pass: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const a = scryptSync(pass, salt, 32);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const DEVICE_COOKIE = "kiosk_device";
const DEVICE_TTL_SEC = 180 * 24 * 60 * 60;
const failures = new Map<string, { n: number; until: number }>();

export function createApp({ db, sessionSecret, kioskOpen = false, authenticateAdmin }: Deps) {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true }));

  async function getSetting(key: string) {
    const [row] = await db.select().from(settings).where(eq(settings.key, key));
    return row?.value ?? null;
  }
  async function optionLists() {
    const rows = await db.select().from(options).orderBy(asc(options.sort), asc(options.id));
    return { town: rows.filter((r) => r.kind === "town").map((r) => r.label), club: rows.filter((r) => r.kind === "club").map((r) => r.label) };
  }

  // ---------- 受付（iPad） ----------
  // 端末の登録: 運営の合言葉を一度入れると、その iPad に署名付き Cookie（180日）を渡す
  app.post("/api/kiosk/device", async (c) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const f = failures.get(ip);
    if (f && f.until > Date.now()) return c.json({ error: "too many attempts" }, 429);
    const body = z.object({ passcode: z.string().min(1).max(100) }).safeParse(await c.req.json().catch(() => null));
    const stored = await getSetting("kioskPasscode");
    if (!body.success || !stored || !checkPasscode(body.data.passcode, stored)) {
      const n = (f?.n ?? 0) + 1;
      failures.set(ip, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
      return c.json({ error: "unauthorized" }, 401);
    }
    failures.delete(ip);
    await setSignedCookie(c, DEVICE_COOKIE, `device|${stored.slice(0, 16)}`, sessionSecret, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: DEVICE_TTL_SEC });
    return c.json({ ok: true });
  });

  // 合言葉を変えると、古い合言葉で登録した端末は使えなくなる
  async function isDevice(c: Context) {
    if (kioskOpen) return true;
    const v = await getSignedCookie(c, sessionSecret, DEVICE_COOKIE);
    const stored = await getSetting("kioskPasscode");
    return !!v && !!stored && v === `device|${stored.slice(0, 16)}`;
  }

  // イベント単位の受付は「登録済み端末」か「そのイベントの受付トークン」で許可する
  async function kioskEvent(c: Context) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return null;
    const [ev] = await db.select().from(events).where(eq(events.id, id));
    if (!ev) return null;
    if (await isDevice(c)) return ev;
    return c.req.header("x-kiosk-token") === ev.kioskToken ? ev : null;
  }

  app.get("/api/kiosk/clubs", async (c) => {
    if (!(await isDevice(c))) return c.json({ error: "unauthorized" }, 401);
    return c.json((await optionLists()).club);
  });

  app.get("/api/kiosk/events", async (c) => {
    if (!(await isDevice(c))) return c.json({ error: "unauthorized" }, 401);
    const club = c.req.query("club") ?? "";
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rows = await db.select({ id: events.id, date: events.date, kind: events.kind, place: events.place, host: events.host })
      .from(events).where(and(eq(events.host, club), gte(events.date, since))).orderBy(desc(events.date), desc(events.id));
    return c.json(rows);
  });

  // 試用モード: 運営が「老人会」と「会の種類」を入れて今日の会を始める（同じ組み合わせなら同じ会を開く）
  app.post("/api/kiosk/events", async (c) => {
    if (!kioskOpen) return c.json({ error: "unauthorized" }, 401);
    const body = z.object({
      club: z.string().trim().min(1).max(40),
      // ネコ受付では会の種類を自由に入力できる
      kind: z.string().trim().min(1).max(40),
      nextDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const { club, kind, nextDate } = body.data;
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    await db.insert(options).values({ kind: "club", label: club, sort: 999 }).onConflictDoNothing();
    const [found] = await db.select().from(events).where(and(eq(events.date, today), eq(events.host, club), eq(events.kind, kind)));
    if (found) {
      if (nextDate && found.nextDate !== nextDate) await db.update(events).set({ nextDate }).where(eq(events.id, found.id));
      return c.json({ id: found.id, date: found.date, kind: found.kind, host: found.host }, 200);
    }
    const [ev] = await db.insert(events).values({ date: today, kind, host: club, nextDate: nextDate ?? null, kioskToken: randomBytes(18).toString("base64url") }).returning();
    return c.json({ id: ev.id, date: ev.date, kind: ev.kind, host: ev.host }, 201);
  });

  app.get("/api/kiosk/events/:id/session", async (c) => {
    const ev = await kioskEvent(c);
    if (!ev) return c.json({ error: "unauthorized" }, 401);
    return c.json({ event: { id: ev.id, date: ev.date, kind: ev.kind, place: ev.place, host: ev.host, nextDate: ev.nextDate }, options: await optionLists(), choices: CHOICES });
  });

  app.post("/api/kiosk/events/:id/register", async (c) => {
    const ev = await kioskEvent(c);
    if (!ev) return c.json({ error: "unauthorized" }, 401);
    const parsed = registerSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const a = parsed.data;
    const attrs = a.consent
      ? { name: a.name || null, ageGroup: a.ageGroup ?? null, gender: a.gender ?? null, town: a.town ?? null, club: a.club ?? null, trigger: a.trigger ?? null, livingAlone: a.livingAlone ?? null, mobility: a.mobility ?? null, birthYear: a.birthYear ?? null }
      : {};
    // ID の重複は一意制約で防ぎ、衝突したら取り直す
    for (let i = 0; i < 5; i++) {
      try {
        const p = await db.transaction(async (tx) => {
          const [{ m }] = await tx.select({ m: max(participants.code) }).from(participants);
          const [p] = await tx.insert(participants).values({ code: nextCode(m ?? null), consent: a.consent, ...attrs }).returning();
          await tx.insert(attendances).values({ eventId: ev.id, participantId: p.id, moodBefore: a.mood ?? null });
          return p;
        });
        return c.json({ code: p.code, name: p.name ?? null, nextDate: ev.nextDate }, 201);
      } catch (e) {
        if (i === 4) throw e;
      }
    }
  });

  async function findByCode(code: string) {
    const [p] = await db.select().from(participants).where(eq(participants.code, code.padStart(4, "0")));
    return p ?? null;
  }

  app.post("/api/kiosk/events/:id/checkin", async (c) => {
    const ev = await kioskEvent(c);
    if (!ev) return c.json({ error: "unauthorized" }, 401);
    const body = codeSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const p = await findByCode(body.data.code);
    if (!p) return c.json({ status: "unknown", code: body.data.code.padStart(4, "0") });
    const inserted = await db.insert(attendances).values({ eventId: ev.id, participantId: p.id, moodBefore: body.data.mood ?? null }).onConflictDoNothing().returning();
    return c.json({ status: inserted.length ? "ok" : "already", code: p.code, name: p.name ?? null, nextDate: ev.nextDate });
  });

  app.post("/api/kiosk/events/:id/checkout", async (c) => {
    const ev = await kioskEvent(c);
    if (!ev) return c.json({ error: "unauthorized" }, 401);
    const body = codeSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const p = await findByCode(body.data.code);
    if (!p) return c.json({ status: "unknown", code: body.data.code.padStart(4, "0") });
    const updated = await db.update(attendances).set({ checkedOutAt: new Date(), moodAfter: body.data.mood ?? null })
      .where(and(eq(attendances.eventId, ev.id), eq(attendances.participantId, p.id))).returning();
    if (!updated.length) return c.json({ status: "not-checked-in", code: p.code, name: p.name ?? null });
    return c.json({ status: "ok", code: p.code, name: p.name ?? null, nextDate: ev.nextDate });
  });

  // ---------- 管理者 ----------
  const adminApi = new Hono<{ Variables: { admin: string } }>();
  adminApi.use("*", async (c, next) => {
    const email = await authenticateAdmin(c);
    if (!email) return c.json({ error: "unauthorized" }, 401);
    c.set("admin", email);
    await next();
  });

  adminApi.get("/me", (c) => c.json({ email: c.get("admin") }));

  adminApi.get("/kiosk-passcode", async (c) => c.json({ isSet: !!(await getSetting("kioskPasscode")) }));
  adminApi.put("/kiosk-passcode", async (c) => {
    const body = z.object({ passcode: z.string().trim().min(4).max(100) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "4文字以上で入力してください" }, 400);
    await db.insert(settings).values({ key: "kioskPasscode", value: hashPasscode(body.data.passcode) })
      .onConflictDoUpdate({ target: settings.key, set: { value: hashPasscode(body.data.passcode) } });
    return c.json({ isSet: true });
  });

  adminApi.get("/events", async (c) => {
    const evs = await db.select().from(events).orderBy(desc(events.date), desc(events.id));
    const att = await db.select({ eventId: attendances.eventId }).from(attendances);
    const counts = new Map<number, number>();
    for (const a of att) counts.set(a.eventId, (counts.get(a.eventId) ?? 0) + 1);
    return c.json(evs.map((e) => ({ ...e, attendanceCount: counts.get(e.id) ?? 0 })));
  });

  adminApi.post("/events", async (c) => {
    const parsed = eventSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const [ev] = await db.insert(events).values({ ...parsed.data, nextDate: parsed.data.nextDate ?? null, kioskToken: randomBytes(18).toString("base64url") }).returning();
    return c.json(ev, 201);
  });

  adminApi.patch("/events/:id", async (c) => {
    const parsed = eventSchema.partial().safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const [ev] = await db.update(events).set(parsed.data).where(eq(events.id, Number(c.req.param("id")))).returning();
    return ev ? c.json(ev) : c.json({ error: "not found" }, 404);
  });

  adminApi.get("/events/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const [ev] = await db.select().from(events).where(eq(events.id, id));
    if (!ev) return c.json({ error: "not found" }, 404);
    const rows = await db
      .select({ id: attendances.id, role: attendances.role, checkedInAt: attendances.checkedInAt, checkedOutAt: attendances.checkedOutAt, moodBefore: attendances.moodBefore, moodAfter: attendances.moodAfter, code: participants.code, name: participants.name, ageGroup: participants.ageGroup, gender: participants.gender, town: participants.town, club: participants.club })
      .from(attendances).innerJoin(participants, eq(attendances.participantId, participants.id))
      .where(eq(attendances.eventId, id)).orderBy(asc(attendances.checkedInAt));
    return c.json({ event: ev, attendances: rows });
  });

  adminApi.patch("/attendances/:id", async (c) => {
    const body = z.object({ role: z.enum(CHOICES.role as unknown as [string, ...string[]]) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const [row] = await db.update(attendances).set({ role: body.data.role }).where(eq(attendances.id, Number(c.req.param("id")))).returning();
    return row ? c.json(row) : c.json({ error: "not found" }, 404);
  });

  adminApi.delete("/attendances/:id", async (c) => {
    await db.delete(attendances).where(eq(attendances.id, Number(c.req.param("id"))));
    return c.json({ ok: true });
  });

  // ---------- デモデータ（ダッシュボードの見た目を確かめるためのモック。目印付きで入れ、まとめて消せる） ----------
  adminApi.get("/demo", async (c) => {
    const [ev] = await db.select({ id: events.id }).from(events).where(eq(events.place, DEMO_PLACE)).limit(1);
    return c.json({ present: !!ev });
  });

  adminApi.post("/demo", async (c) => {
    const [exists] = await db.select({ id: events.id }).from(events).where(eq(events.place, DEMO_PLACE)).limit(1);
    if (exists) return c.json({ present: true, participants: 0 }, 200);
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const demo = generateDemo(today);
    await db.transaction(async (tx) => {
      const evIds: number[] = [];
      for (const e of demo.events) {
        const [row] = await tx.insert(events).values({ ...e, place: DEMO_PLACE, kioskToken: randomBytes(18).toString("base64url") }).returning({ id: events.id });
        evIds.push(row.id);
      }
      const [{ m }] = await tx.select({ m: max(participants.code) }).from(participants);
      let last = m ?? null;
      const pIds: number[] = [];
      for (const p of demo.people) {
        last = nextCode(last);
        const [row] = await tx.insert(participants).values({ code: last, consent: true, ...p }).returning({ id: participants.id });
        pIds.push(row.id);
      }
      const rows = demo.attendances.map((a) => ({ eventId: evIds[a.event], participantId: pIds[a.person], role: a.role, moodBefore: a.moodBefore, moodAfter: a.moodAfter, checkedOutAt: new Date() }));
      for (let i = 0; i < rows.length; i += 200) await tx.insert(attendances).values(rows.slice(i, i + 200));
    });
    for (const club of ["みゆき会", "さくら会", "ひまわり会"]) await db.insert(options).values({ kind: "club", label: club, sort: 999 }).onConflictDoNothing();
    return c.json({ present: true, participants: demo.people.length, events: demo.events.length, attendances: demo.attendances.length }, 201);
  });

  adminApi.delete("/demo", async (c) => {
    await db.transaction(async (tx) => {
      await tx.delete(events).where(eq(events.place, DEMO_PLACE)); // 出席は会と一緒に消える
      await tx.delete(participants).where(like(participants.name, `${DEMO_NAME_PREFIX}%`));
    });
    return c.json({ present: false });
  });

  adminApi.get("/participants", async (c) => c.json(await db.select().from(participants).orderBy(asc(participants.code))));

  adminApi.get("/options", async (c) => c.json(await optionLists()));
  adminApi.put("/options", async (c) => {
    const body = z.object({ town: z.array(z.string().trim().min(1).max(40)).max(300), club: z.array(z.string().trim().min(1).max(40)).max(100) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    await db.transaction(async (tx) => {
      await tx.delete(options);
      const rows = [
        ...[...new Set(body.data.town)].map((label, i) => ({ kind: "town", label, sort: i })),
        ...[...new Set(body.data.club)].map((label, i) => ({ kind: "club", label, sort: i })),
      ];
      if (rows.length) await tx.insert(options).values(rows);
    });
    return c.json(await optionLists());
  });

  adminApi.get("/dashboard", async (c) => {
    const q = c.req.query();
    const [evs, ps, as] = await Promise.all([
      db.select({ id: events.id, date: events.date, kind: events.kind }).from(events),
      db.select().from(participants),
      db.select({ eventId: attendances.eventId, participantId: attendances.participantId, role: attendances.role, moodBefore: attendances.moodBefore, moodAfter: attendances.moodAfter }).from(attendances),
    ]);
    return c.json(buildDashboard({ events: evs, participants: ps, attendances: as }, { from: q.from || undefined, to: q.to || undefined, kind: q.kind || undefined, suppressBelow: q.suppress === "1" ? 5 : undefined }));
  });

  // 報告書（行政・協賛企業向け）。既定は外部共有（5人未満を隠す）
  adminApi.get("/report", async (c) => {
    const q = c.req.query();
    const [evs, ps, as] = await Promise.all([
      db.select({ id: events.id, date: events.date, kind: events.kind, host: events.host }).from(events),
      db.select().from(participants),
      db.select({ eventId: attendances.eventId, participantId: attendances.participantId, role: attendances.role, moodBefore: attendances.moodBefore, moodAfter: attendances.moodAfter, checkedInAt: attendances.checkedInAt, checkedOutAt: attendances.checkedOutAt }).from(attendances),
    ]);
    const range = { from: q.from || undefined, to: q.to || undefined, kind: q.kind || undefined, suppressBelow: q.suppress === "0" ? undefined : 5 };
    const asOf = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    return c.json({
      dashboard: buildDashboard({ events: evs, participants: ps, attendances: as }, range),
      report: buildReport({ events: evs, participants: ps, attendances: as }, { ...range, asOf }),
    });
  });

  adminApi.get("/export/:name", async (c) => {
    const name = c.req.param("name");
    let csv: string;
    if (name === "participants.csv") {
      csv = toCSV(await db.select().from(participants).orderBy(asc(participants.code)), ["code", "consent", "ageGroup", "gender", "town", "club", "trigger", "livingAlone", "mobility", "birthYear", "createdAt"]);
    } else if (name === "attendances.csv") {
      const rows = await db.select({ date: events.date, kind: events.kind, code: participants.code, role: attendances.role, checkedInAt: attendances.checkedInAt, checkedOutAt: attendances.checkedOutAt, moodBefore: attendances.moodBefore, moodAfter: attendances.moodAfter })
        .from(attendances).innerJoin(events, eq(attendances.eventId, events.id)).innerJoin(participants, eq(attendances.participantId, participants.id))
        .orderBy(asc(events.date), asc(participants.code));
      csv = toCSV(rows, ["date", "kind", "code", "role", "checkedInAt", "checkedOutAt", "moodBefore", "moodAfter"]);
    } else if (name === "events.csv") {
      csv = toCSV(await db.select().from(events).orderBy(asc(events.date)), ["id", "date", "kind", "place", "host", "nextDate"]);
    } else return c.json({ error: "not found" }, 404);
    return c.body(csv, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` });
  });

  app.route("/api/admin", adminApi);
  return app;
}


