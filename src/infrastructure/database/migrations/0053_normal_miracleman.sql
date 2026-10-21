ALTER TABLE "stock_fundamentals" ADD COLUMN "parentNetIncomeVersion" varchar(32);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "parentNetIncomeAccount" varchar(16);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "parentNetIncomeConcept" varchar(64);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "nonControllingNetIncomeVersion" varchar(32);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "nonControllingNetIncomeAccount" varchar(16);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "nonControllingNetIncomeConcept" varchar(64);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "nonControllingEquityVersion" varchar(32);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "nonControllingEquityAccount" varchar(16);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "nonControllingEquityConcept" varchar(64);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "parentNetIncome" numeric(24, 2);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "nonControllingNetIncome" numeric(24, 2);--> statement-breakpoint
ALTER TABLE "stock_fundamentals" ADD COLUMN "nonControllingEquity" numeric(24, 2);