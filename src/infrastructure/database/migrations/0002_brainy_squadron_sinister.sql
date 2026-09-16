ALTER TABLE "position_items" ADD COLUMN "valuationSource" varchar(20);--> statement-breakpoint
ALTER TABLE "position_items" ADD COLUMN "mtmUnitPrice" numeric(24, 8);--> statement-breakpoint
ALTER TABLE "position_items" ADD COLUMN "mtmTotalValue" numeric(24, 8);--> statement-breakpoint
ALTER TABLE "position_items" ADD COLUMN "curveUnitPrice" numeric(24, 8);--> statement-breakpoint
ALTER TABLE "position_items" ADD COLUMN "curveTotalValue" numeric(24, 8);--> statement-breakpoint
ALTER TABLE "position_items" ADD COLUMN "closingUnitPrice" numeric(24, 8);--> statement-breakpoint
ALTER TABLE "position_items" ADD COLUMN "closingTotalValue" numeric(24, 8);