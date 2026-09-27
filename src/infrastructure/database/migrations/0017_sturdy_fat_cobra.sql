CREATE TABLE "manual_portfolio_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assetKey" varchar(64) NOT NULL,
	"product" text NOT NULL,
	"assetCode" varchar(24),
	"institution" text,
	"quantity" numeric(24, 8) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"unitPrice" numeric(24, 8),
	"totalValue" numeric(24, 8) NOT NULL,
	"valueBasis" varchar(16) NOT NULL,
	"positionDate" date NOT NULL,
	"convertedValueBrl" numeric(24, 8),
	"conversionDate" date,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_portfolio_positions_assetKey_unique" UNIQUE("assetKey")
);
