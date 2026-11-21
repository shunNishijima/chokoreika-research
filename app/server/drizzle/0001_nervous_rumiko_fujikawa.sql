CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendances" ADD COLUMN "checked_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendances" ADD COLUMN "mood_before" smallint;--> statement-breakpoint
ALTER TABLE "attendances" ADD COLUMN "mood_after" smallint;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "name" text;