ALTER TABLE "auth_users" ADD COLUMN "accountStatus" varchar(12) DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_users" ADD COLUMN "lastLoginAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_users" ADD CONSTRAINT "auth_users_account_status_check" CHECK ("auth_users"."accountStatus" in ('ACTIVE', 'PENDING', 'DISABLED'));