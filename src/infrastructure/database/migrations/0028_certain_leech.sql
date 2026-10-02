ALTER TABLE "personal_investment_strategy" ALTER COLUMN "answers" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "personal_investment_strategy" ALTER COLUMN "selectedDirection" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "personal_investment_strategy" ADD COLUMN "allocationPercentages" jsonb;