CREATE TABLE "stock_opportunity_analysis_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"bazinTargetYield" numeric(8, 4) DEFAULT '6' NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_opportunity_manual_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticker" varchar(16) NOT NULL,
	"inputKey" varchar(24) NOT NULL,
	"value" numeric(24, 8) NOT NULL,
	"source" text NOT NULL,
	"asOf" date NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_opportunity_manual_ticker_input_idx" ON "stock_opportunity_manual_inputs" USING btree ("ticker","inputKey");--> statement-breakpoint
CREATE INDEX "stock_opportunity_manual_ticker_idx" ON "stock_opportunity_manual_inputs" USING btree ("ticker");