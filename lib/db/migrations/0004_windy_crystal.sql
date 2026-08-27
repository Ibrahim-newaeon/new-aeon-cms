CREATE TABLE "product_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"position" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "variant_option_values" (
	"variant_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"value" varchar(255) NOT NULL,
	CONSTRAINT "variant_option_values_variant_id_option_id_pk" PRIMARY KEY("variant_id","option_id")
);
--> statement-breakpoint
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_option_values" ADD CONSTRAINT "variant_option_values_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_option_values" ADD CONSTRAINT "variant_option_values_option_id_product_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."product_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_options_product_name_idx" ON "product_options" USING btree ("product_id","name");--> statement-breakpoint
ALTER TABLE "product_variants" DROP COLUMN "color";--> statement-breakpoint
ALTER TABLE "product_variants" DROP COLUMN "size";--> statement-breakpoint
ALTER TABLE "product_variants" DROP COLUMN "capacity";--> statement-breakpoint
ALTER TABLE "product_variants" DROP COLUMN "connector_type";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "warranty_months";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "is_genuine";