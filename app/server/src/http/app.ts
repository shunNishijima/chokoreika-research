// HTTP API。受付（iPad）用と管理者用に分ける。
import { Hono, type Context } from "hono";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { asc, desc, eq, max } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { attendances, events, options, participants } from "../db/schema.js";
import { buildDashboard, nextCode } from "../domain/metrics.js";
import { CHOICES } from "../domain/choices.js";

type Deps = { db: Db; authenticateAdmin: (c: Context) => Promise<string | null> };

const opt = (values: readonly string[]) => z.enum(values as [string, ...string[]]).nullish();
const registerSchema = z.object({
  consent: z.boolean(),
  ageGroup: opt(CHOICES.ageGroup),
  gender: opt(CHOICES.gender),
  town: z.string().max(40).nullish(),
  club: z.string().max(40).nullish(),
  trigger: opt(CHOICES.trigger),
  livingAlone: opt(CHOICES.livingAlone),
  mobility: opt(CHOICES.mobility),
});
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
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
}

export function createApp({ db, authenticateAdmin }: Deps) {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true }));

  // ---------- 受付（iPad） ----------
  const kioskEvent = async (c: Context) => {
    const token = c.req.header("x-kiosk-token");
    if (!token) return null;
    const [ev] = await db.select().from(events).where(eq(events.kioskToken, token));
    return ev ?? null;
  };

  async function optionLists() {
    const rows = await db.select().from(options).orderBy(asc(options.sort), asc(options.id));
    return { town: rows.filter((r) => r.kind === "town").map((r) => r.label), club: rows.filter((r) => r.kind === "club").map((r) => r.label) };
  }

  app.get("/api/kiosk/session", async (c) => {
    const ev = await kioskEvent(c);
    if (!ev) return c.json({ error: "unauthorized" }, 401);
    return c.json({ event: { id: ev.id, date: ev.date, kind: ev.kind, place: ev.place, host: ev.host, nextDate: ev.nextDate }, options: await optionLists(), choices: CHOICES });
  });

  app.post("/api/kiosk/register", async (c) => {
    const ev = await kioskEvent(c);
    if (!ev) return c.json({ error: "unauthorized" }, 401);
    const parsed = registerSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const a = parsed.data;
    const attrs = a.consent
      ? { ageGroup: a.ageGroup ?? null, gender: a.gender ?? null, town: a.town ?? null, club: a.club ?? null, trigger: a.trigger ?? null, livingAlone: a.livingAlone ?? null, mobility: a.mobility ?? null }
      : {};
    // 番号の重複は一意制約で防ぎ、衝突したら取り直す
    for (let i = 0; i < 5; i++) {
      try {
        const code = await db.transaction(async (tx) => {
          const [{ m }] = await tx.select({ m: max(participants.code) }).from(participants);
          const code = nextCode(m ?? null);
          const [p] = await tx.insert(participants).values({ code, consent: a.consent, ...attrs }).returning();
          await tx.insert(attendances).values({ eventId: ev.id, participantId: p.id });
          return code;
        });
        return c.json({ code, nextDate: ev.nextDate }, 201);
      } catch (e) {
        if (i === 4) throw e;
      }
    }
  });

  app.post("/api/kiosk/checkin", async (c) => {
    const ev = await kioskEvent(c);
    if (!ev) return c.json({ error: "unauthorized" }, 401);
    const body = z.object({ code: z.string().regex(/^\d{1,4}$/) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const code = body.data.code.padStart(4, "0");
    const [p] = await db.select().from(participants).where(eq(participants.code, code));
    if (!p) return c.json({ status: "unknown", code });
    const inserted = await db.insert(attendances).values({ eventId: ev.id, participantId: p.id }).onConflictDoNothing().returning();
    return c.json({ status: inserted.length ? "ok" : "already", code, nextDate: ev.nextDate });
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
      .select({ id: attendances.id, role: attendances.role, checkedInAt: attendances.checkedInAt, code: participants.code, ageGroup: participants.ageGroup, gender: participants.gender, town: participants.town, club: participants.club })
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
      db.select({ eventId: attendances.eventId, participantId: attendances.participantId, role: attendances.role }).from(attendances),
    ]);
    return c.json(buildDashboard({ events: evs, participants: ps, attendances: as }, { from: q.from || undefined, to: q.to || undefined, kind: q.kind || undefined, suppressBelow: q.suppress === "1" ? 5 : undefined }));
  });

  adminApi.get("/export/:name", async (c) => {
    const name = c.req.param("name");
    let csv: string;
    if (name === "participants.csv") {
      csv = toCSV(await db.select().from(participants).orderBy(asc(participants.code)), ["code", "consent", "ageGroup", "gender", "town", "club", "trigger", "livingAlone", "mobility", "createdAt"]);
    } else if (name === "attendances.csv") {
      const rows = await db.select({ date: events.date, kind: events.kind, code: participants.code, role: attendances.role, checkedInAt: attendances.checkedInAt })
        .from(attendances).innerJoin(events, eq(attendances.eventId, events.id)).innerJoin(participants, eq(attendances.participantId, participants.id))
        .orderBy(asc(events.date), asc(participants.code));
      csv = toCSV(rows, ["date", "kind", "code", "role", "checkedInAt"]);
    } else if (name === "events.csv") {
      csv = toCSV(await db.select().from(events).orderBy(asc(events.date)), ["id", "date", "kind", "place", "host", "nextDate"]);
    } else return c.json({ error: "not found" }, 404);
    return c.body(csv, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` });
  });

  app.route("/api/admin", adminApi);
  return app;
}


