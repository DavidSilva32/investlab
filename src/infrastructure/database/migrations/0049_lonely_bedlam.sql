CREATE TABLE "auth_terms_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"termsVersion" varchar(40) NOT NULL,
	"acceptedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_terms_acceptances" ADD CONSTRAINT "auth_terms_acceptances_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_terms_acceptances_user_accepted_idx" ON "auth_terms_acceptances" USING btree ("userId","acceptedAt");