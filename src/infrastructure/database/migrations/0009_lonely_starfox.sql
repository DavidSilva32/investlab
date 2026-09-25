CREATE TABLE "screener_market_refresh_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startedAt" timestamp with time zone NOT NULL,
	"completedAt" timestamp with time zone,
	"attemptedIssuers" integer DEFAULT 0 NOT NULL,
	"updatedIssuers" integer DEFAULT 0 NOT NULL,
	"unavailableIssuers" integer DEFAULT 0 NOT NULL,
	"skippedFreshIssuers" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'RUNNING' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "screener_market_snapshots" ALTER COLUMN "ingestionRunId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "screener_market_snapshots" ADD COLUMN "quoteObservedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "screener_market_snapshots" ADD COLUMN "marketRefreshRunId" uuid;--> statement-breakpoint
ALTER TABLE "screener_market_snapshots" ADD CONSTRAINT "screener_market_snapshots_marketRefreshRunId_screener_market_refresh_runs_id_fk" FOREIGN KEY ("marketRefreshRunId") REFERENCES "public"."screener_market_refresh_runs"("id") ON DELETE no action ON UPDATE no action;