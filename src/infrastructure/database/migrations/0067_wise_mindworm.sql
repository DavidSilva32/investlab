CREATE TABLE "financial_monthly_closure_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"closureId" uuid NOT NULL,
	"version" integer NOT NULL,
	"totals" jsonb NOT NULL,
	"closedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_monthly_closures" (
	"userId" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" varchar(7) NOT NULL,
	"status" varchar(16) DEFAULT 'CLOSED' NOT NULL,
	"currentVersion" integer DEFAULT 1 NOT NULL,
	"closedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_monthly_closures_month_check" CHECK ("financial_monthly_closures"."month" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "financial_monthly_closures_status_check" CHECK ("financial_monthly_closures"."status" in ('CLOSED', 'NEEDS_REVIEW'))
);
--> statement-breakpoint
ALTER TABLE "financial_monthly_closure_versions" ADD CONSTRAINT "financial_monthly_closure_versions_closureId_financial_monthly_closures_id_fk" FOREIGN KEY ("closureId") REFERENCES "public"."financial_monthly_closures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_monthly_closures" ADD CONSTRAINT "financial_monthly_closures_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_monthly_closure_versions_version_uidx" ON "financial_monthly_closure_versions" USING btree ("closureId","version");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_monthly_closures_user_month_uidx" ON "financial_monthly_closures" USING btree ("userId","month");