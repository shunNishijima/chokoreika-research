import { pgTable, serial, text, boolean, date, timestamp, integer, smallint, uniqueIndex } from "drizzle-orm/pg-core";

export const participants = pgTable("participants", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  consent: boolean("consent").notNull(),
  // 名前は管理画面だけで表示する（同意がない人は保存しない）
  name: text("name"),
  ageGroup: text("age_group"),
  gender: text("gender"),
  town: text("town"),
  club: text("club"),
  trigger: text("trigger"),
  livingAlone: text("living_alone"),
  mobility: text("mobility"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  kind: text("kind").notNull(),
  place: text("place").notNull().default(""),
  host: text("host").notNull().default(""),
  nextDate: date("next_date", { mode: "string" }),
  kioskToken: text("kiosk_token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attendances = pgTable(
  "attendances",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    participantId: integer("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("参加"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    // 今の気持ち（1=しんどい〜5=すごくいい）。来たときと帰るとき
    moodBefore: smallint("mood_before"),
    moodAfter: smallint("mood_after"),
  },
  (t) => [uniqueIndex("attendances_event_participant").on(t.eventId, t.participantId)],
);

export const options = pgTable(
  "options",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [uniqueIndex("options_kind_label").on(t.kind, t.label)],
);

// 受付端末の合言葉など、運営の設定値
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
