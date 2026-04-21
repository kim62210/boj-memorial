-- boj-memorial initial schema.
-- Preserves the exact shape produced by the legacy server.js initDB() block so
-- running this migration against an existing production DB is a no-op.

CREATE TABLE IF NOT EXISTS "comments" (
  "id" serial PRIMARY KEY,
  "nickname" text NOT NULL DEFAULT '익명의 개발자',
  "message" text NOT NULL,
  "ip" text,
  "device_token" text,
  "user_agent" text,
  "created_at" timestamptz DEFAULT NOW()
);

ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "device_token" text;
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "user_agent" text;

-- NULLS LAST keeps `drizzle-kit push` reporting zero diff against the schema.ts
-- definition; created_at has a NOW() default so NULL rows should never occur.
CREATE INDEX IF NOT EXISTS "idx_comments_created" ON "comments" ("created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "idx_comments_device_token" ON "comments" ("device_token");

CREATE TABLE IF NOT EXISTS "flowers" (
  "id" integer PRIMARY KEY,
  "count" integer NOT NULL DEFAULT 0,
  CONSTRAINT "flowers_singleton" CHECK ("id" = 1)
);

INSERT INTO "flowers" ("id", "count") VALUES (1, 0) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS "reports" (
  "id" serial PRIMARY KEY,
  "comment_id" integer,
  "reason" text,
  "ip" text,
  "created_at" timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "rate_limits" (
  "key" text PRIMARY KEY,
  "last_action" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_rate_limits_time" ON "rate_limits" ("last_action");

CREATE TABLE IF NOT EXISTS "incense" (
  "id" integer PRIMARY KEY,
  "count" integer NOT NULL DEFAULT 0,
  CONSTRAINT "incense_singleton" CHECK ("id" = 1)
);

INSERT INTO "incense" ("id", "count") VALUES (1, 0) ON CONFLICT DO NOTHING;
