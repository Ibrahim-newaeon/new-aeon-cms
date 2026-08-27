-- Human-readable order numbers (ORD-1001). A sequence, not count(*)+1, which
-- collides under concurrency.
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1000;
