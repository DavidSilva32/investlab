CREATE TABLE "manual_portfolio_adjustment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assetKey" varchar(64) NOT NULL,
	"eventType" varchar(32) DEFAULT 'NEUTRAL_ADJUSTMENT' NOT NULL,
	"previousQuantity" numeric(24, 8) NOT NULL,
	"quantity" numeric(24, 8) NOT NULL,
	"previousUnitPrice" numeric(24, 8),
	"unitPrice" numeric(24, 8),
	"previousTotalValue" numeric(24, 8) NOT NULL,
	"totalValue" numeric(24, 8) NOT NULL,
	"previousCurrency" varchar(3) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"previousValueBasis" varchar(16) NOT NULL,
	"valueBasis" varchar(16) NOT NULL,
	"previousPositionDate" date NOT NULL,
	"positionDate" date NOT NULL,
	"previousConvertedValueBrl" numeric(24, 8),
	"convertedValueBrl" numeric(24, 8),
	"previousConversionDate" date,
	"conversionDate" date,
	"recordedAt" timestamp with time zone NOT NULL,
	"requestId" text,
	CONSTRAINT "manual_portfolio_adjustment_events_type_check" CHECK ("manual_portfolio_adjustment_events"."eventType" = 'NEUTRAL_ADJUSTMENT')
);
--> statement-breakpoint
CREATE INDEX "manual_portfolio_adjustment_events_asset_recorded_idx" ON "manual_portfolio_adjustment_events" USING btree ("assetKey","recordedAt");