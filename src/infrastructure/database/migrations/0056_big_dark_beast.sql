ALTER TABLE "auth_users" ADD COLUMN "betaActivatedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_users" ADD COLUMN "betaExpiresAt" timestamp with time zone;
--> statement-breakpoint
-- Give accounts that predate beta tracking a fresh 30-day test window from rollout.
UPDATE "auth_users"
SET "betaActivatedAt" = now(),
    "betaExpiresAt" = now() + interval '30 days'
WHERE COALESCE("role", 'USER') <> 'ADMIN'
  AND "betaExpiresAt" IS NULL;
