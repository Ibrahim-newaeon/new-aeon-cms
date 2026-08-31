CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" varchar(100),
	"name" varchar(255) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"governorate" varchar(100) NOT NULL,
	"city" varchar(100) NOT NULL,
	"address_line" text NOT NULL,
	"landmark" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_carts" (
	"customer_id" uuid PRIMARY KEY NOT NULL,
	"lines" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_otp" (
	"phone" varchar(32) PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"attempts_left" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"product_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "product_categories_product_id_category_id_pk" PRIMARY KEY("product_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"customer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "wishlist_items_customer_id_product_id_pk" PRIMARY KEY("customer_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_category_id_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "content_types" ADD COLUMN "route_prefix" varchar(64);--> statement-breakpoint
ALTER TABLE "content_types" ADD COLUMN "is_built_in" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "registered_at" timestamp;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "theme_dark" jsonb;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "theme_mode" varchar(5) DEFAULT 'light';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "admin_logo" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "admin_accent" varchar(7);--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "country_code" varchar(2) DEFAULT 'JO';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "shipping_regions" jsonb;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "brand_answer" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "allow_ai_crawlers" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "whatsapp_number" varchar(32);--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "whatsapp_greeting" text;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_carts" ADD CONSTRAINT "customer_carts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_idx" ON "customer_addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_addresses_one_default_idx" ON "customer_addresses" USING btree ("customer_id") WHERE is_default;--> statement-breakpoint
CREATE INDEX "product_categories_category_idx" ON "product_categories" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_one_primary_idx" ON "product_categories" USING btree ("product_id") WHERE is_primary;--> statement-breakpoint
CREATE INDEX "wishlist_customer_idx" ON "wishlist_items" USING btree ("customer_id");--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "category_id";--> statement-breakpoint
ALTER TABLE "content_types" ADD CONSTRAINT "content_types_route_prefix_unique" UNIQUE("route_prefix");