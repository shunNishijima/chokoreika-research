CREATE TABLE "attendances" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"participant_id" integer NOT NULL,
	"role" text DEFAULT '参加' NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"place" text DEFAULT '' NOT NULL,
	"host" text DEFAULT '' NOT NULL,
	"next_date" date,
	"kiosk_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_kiosk_token_unique" UNIQUE("kiosk_token")
);
--> statement-breakpoint
CREATE TABLE "options" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"consent" boolean NOT NULL,
	"age_group" text,
	"gender" text,
	"town" text,
	"club" text,
	"trigger" text,
	"living_alone" text,
	"mobility" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendances_event_participant" ON "attendances" USING btree ("event_id","participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "options_kind_label" ON "options" USING btree ("kind","label");