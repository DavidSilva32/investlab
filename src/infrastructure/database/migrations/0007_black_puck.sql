CREATE TABLE "stock_fundamentals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticker" varchar(16) NOT NULL,
	"cnpj" varchar(14) NOT NULL,
	"periodType" varchar(12) NOT NULL,
	"referenceDate" date NOT NULL,
	"revenue" numeric(24, 2),
	"netIncome" numeric(24, 2),
	"equity" numeric(24, 2),
	"assets" numeric(24, 2),
	"liabilities" numeric(24, 2),
	"cash" numeric(24, 2),
	"debt" numeric(24, 2),
	"sourceDocument" varchar(8) NOT NULL,
	"sourceVersion" varchar(32) NOT NULL,
	"fetchedAt" timestamp with time zone DEFAULT now() NOT NULL
);
