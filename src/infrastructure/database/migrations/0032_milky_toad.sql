ALTER TABLE "stock_fundamentals" ADD COLUMN "periodStart" date;--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "periodEnd" date;--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "filingReferenceDate" date;--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "exerciseOrder" varchar(12);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "periodBasis" varchar(32) DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "revenueVersion" varchar(32);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "revenueAccountLabel" varchar(256);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "netIncomeVersion" varchar(32);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "netIncomeAccount" varchar(16);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "netIncomeConcept" varchar(64);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "equityVersion" varchar(32);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "equityAccount" varchar(16);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "equityConcept" varchar(64);--> statement-breakpoint
UPDATE "stock_fundamentals"
SET "periodStart" = CASE
      WHEN "sourceDocument" = 'DFP'
        THEN make_date(EXTRACT(YEAR FROM "referenceDate")::integer, 1, 1)
      ELSE NULL
    END,
    "periodEnd" = CASE
      WHEN "sourceDocument" = 'DFP' THEN "referenceDate"
      ELSE NULL
    END,
    "filingReferenceDate" = CASE
      WHEN "sourceDocument" = 'DFP' THEN "referenceDate"
      ELSE NULL
    END,
    "exerciseOrder" = CASE
      WHEN "sourceDocument" = 'DFP' THEN 'last'
      ELSE NULL
    END,
    "periodBasis" = CASE
      WHEN "sourceDocument" = 'DFP' THEN 'annual'
      ELSE 'unknown'
    END,
    "fetchedAt" = NOW() - INTERVAL '25 hours'
WHERE "sourceDocument" IN ('DFP', 'ITR')
  AND "periodStart" IS NULL
  AND "periodEnd" IS NULL
  AND "filingReferenceDate" IS NULL
  AND "exerciseOrder" IS NULL
  AND "periodBasis" = 'unknown';