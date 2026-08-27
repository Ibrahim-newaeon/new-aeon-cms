ALTER TABLE "orders" ADD COLUMN "idempotency_key" varchar(128);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key");