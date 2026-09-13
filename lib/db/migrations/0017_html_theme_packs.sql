-- Idempotent on purpose: staging already had a "themes" table that no migration
-- created (42P07 on boot, crash loop). The drizzle migrator skips applied files
-- by created_at alone, never by hash, so databases that ran the original
-- CREATE TABLE are unaffected; fresh databases get the identical table.
CREATE TABLE IF NOT EXISTS "themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"version" varchar(32) NOT NULL,
	"manifest" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "name" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "version" varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "manifest" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();
