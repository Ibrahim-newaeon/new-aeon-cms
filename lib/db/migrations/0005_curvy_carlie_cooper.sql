CREATE TYPE "public"."coupon_type" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cod', 'card', 'wallet');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'authorized', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"type" "coupon_type" NOT NULL,
	"value" integer NOT NULL,
	"min_subtotal" integer DEFAULT 0,
	"usage_limit" integer,
	"used_count" integer DEFAULT 0,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"governorate" varchar(100),
	"city" varchar(100),
	"address_line" text,
	"landmark" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "customers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"note" text,
	"changed_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shipping_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"governorates" jsonb NOT NULL,
	"flat_rate" integer NOT NULL,
	"free_over" integer,
	"eta_days" integer DEFAULT 3,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."order_status" USING "status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_method" SET DEFAULT 'cod'::"public"."payment_method";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_method" SET DATA TYPE "public"."payment_method" USING "payment_method"::"public"."payment_method";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_method" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DEFAULT 'pending'::"public"."payment_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DATA TYPE "public"."payment_status" USING "payment_status"::"public"."payment_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_zone_id" uuid;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_zone_id_shipping_zones_id_fk" FOREIGN KEY ("shipping_zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE no action ON UPDATE no action;