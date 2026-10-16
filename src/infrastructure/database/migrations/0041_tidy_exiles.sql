ALTER TABLE "auth_users" DROP CONSTRAINT "auth_users_email_unique";--> statement-breakpoint
ALTER TABLE "auth_invitations" ADD COLUMN "revokedAt" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_users_email_normalized_uidx" ON "auth_users" USING btree (lower(trim("email")));--> statement-breakpoint
ALTER TABLE "auth_users" ADD CONSTRAINT "auth_users_role_check" CHECK ("auth_users"."role" in ('USER', 'ADMIN'));