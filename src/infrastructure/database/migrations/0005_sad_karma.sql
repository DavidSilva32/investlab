CREATE TABLE "cdb_rate_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assetCode" text NOT NULL,
	"cdiPercentage" numeric(9, 4) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cdb_rate_configurations_assetCode_unique" UNIQUE("assetCode")
);
--> statement-breakpoint
CREATE TABLE "cdi_daily_rates" (
	"rateDate" date PRIMARY KEY NOT NULL,
	"annualRate" numeric(9, 6) NOT NULL,
	"fetchedAt" timestamp with time zone DEFAULT now() NOT NULL
);
