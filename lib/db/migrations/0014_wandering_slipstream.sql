ALTER TABLE "settings" ADD COLUMN "announcement_ar" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "announcement_en" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "announcement_active" boolean DEFAULT false;