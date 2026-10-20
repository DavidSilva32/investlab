CREATE TABLE "stock_fundamental_refreshes" (
	"ticker" varchar(16) NOT NULL,
	"cnpj" varchar(14) NOT NULL,
	"sourceVersion" varchar(32) NOT NULL,
	"status" varchar(12) NOT NULL,
	"leaseToken" uuid NOT NULL,
	"attemptCount" integer DEFAULT 1 NOT NULL,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"leaseExpiresAt" timestamp with time zone NOT NULL,
	"completedAt" timestamp with time zone,
	"retryAfter" timestamp with time zone,
	"errorCode" varchar(64),
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_fundamental_refresh_status_check" CHECK ("stock_fundamental_refreshes"."status" IN ('RUNNING', 'COMPLETED', 'FAILED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_fundamental_refresh_identity_idx" ON "stock_fundamental_refreshes" USING btree ("ticker","cnpj","sourceVersion");--> statement-breakpoint
CREATE INDEX "stock_fundamental_refresh_status_idx" ON "stock_fundamental_refreshes" USING btree ("status");