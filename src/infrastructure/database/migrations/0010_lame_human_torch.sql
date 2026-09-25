CREATE TABLE "screener_market_snapshot_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshotId" uuid NOT NULL,
	"requestedTicker" varchar(16) NOT NULL,
	"returnedTicker" varchar(16) NOT NULL,
	"price" numeric(24, 8),
	"marketCap" numeric(26, 2),
	"quoteObservedAt" timestamp with time zone,
	"validationResult" varchar(40) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "screener_market_snapshot_quotes" ADD CONSTRAINT "screener_market_snapshot_quotes_snapshotId_screener_market_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."screener_market_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "screener_market_snapshot_quotes_snapshot_idx" ON "screener_market_snapshot_quotes" USING btree ("snapshotId");--> statement-breakpoint
CREATE UNIQUE INDEX "screener_market_refresh_running_uidx" ON "screener_market_refresh_runs" USING btree ("status") WHERE "screener_market_refresh_runs"."status" = 'RUNNING';