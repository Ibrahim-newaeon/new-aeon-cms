CREATE TABLE "tag_i18n" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"name" varchar(255) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tag_i18n" ADD CONSTRAINT "tag_i18n_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tag_i18n_tag_locale_idx" ON "tag_i18n" USING btree ("tag_id","locale");