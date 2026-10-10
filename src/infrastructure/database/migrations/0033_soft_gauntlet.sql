CREATE TABLE "manual_portfolio_position_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assetKey" varchar(64) NOT NULL,
	"product" text NOT NULL,
	"assetCode" varchar(24),
	"currency" varchar(3) NOT NULL,
	"totalValue" numeric(24, 8),
	"convertedValueBrl" numeric(24, 8),
	"positionDate" date NOT NULL,
	"conversionDate" date,
	"valueBasis" varchar(16) NOT NULL,
	"status" varchar(16) NOT NULL,
	"recordedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "manual_portfolio_position_snapshots_asset_recorded_uidx" ON "manual_portfolio_position_snapshots" USING btree ("assetKey","recordedAt");
