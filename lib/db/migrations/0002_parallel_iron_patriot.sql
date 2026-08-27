CREATE TABLE "navigation_i18n" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"navigation_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"label" varchar(255) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "navigation_i18n" ADD CONSTRAINT "navigation_i18n_navigation_id_navigation_id_fk" FOREIGN KEY ("navigation_id") REFERENCES "public"."navigation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "navigation_i18n_nav_locale_idx" ON "navigation_i18n" USING btree ("navigation_id","locale");