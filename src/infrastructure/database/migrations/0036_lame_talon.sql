CREATE TABLE "manual_portfolio_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"side" varchar(8) NOT NULL,
	"effectiveDate" date NOT NULL,
	"product" text NOT NULL,
	"assetCode" text,
	"quantity" numeric(24, 8) NOT NULL,
	"unitPrice" numeric(24, 8) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"fees" numeric(24, 8),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_portfolio_operations_side_check" CHECK ("manual_portfolio_operations"."side" IN ('BUY', 'SELL')),
	CONSTRAINT "manual_portfolio_operations_quantity_check" CHECK ("manual_portfolio_operations"."quantity" > 0),
	CONSTRAINT "manual_portfolio_operations_unit_price_check" CHECK ("manual_portfolio_operations"."unitPrice" >= 0),
	CONSTRAINT "manual_portfolio_operations_fees_check" CHECK ("manual_portfolio_operations"."fees" IS NULL OR "manual_portfolio_operations"."fees" >= 0)
);
--> statement-breakpoint
CREATE TABLE "portfolio_operation_reconciliation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operationId" uuid NOT NULL,
	"movementId" uuid NOT NULL,
	"status" varchar(8) NOT NULL,
	"recordedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"requestId" text NOT NULL,
	CONSTRAINT "portfolio_operation_reconciliation_status_check" CHECK ("portfolio_operation_reconciliation_events"."status" IN ('LINK', 'UNLINK'))
);
--> statement-breakpoint
ALTER TABLE "portfolio_operation_reconciliation_events" ADD CONSTRAINT "portfolio_operation_reconciliation_events_operationId_manual_portfolio_operations_id_fk" FOREIGN KEY ("operationId") REFERENCES "public"."manual_portfolio_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_operation_reconciliation_events" ADD CONSTRAINT "portfolio_operation_reconciliation_events_movementId_movement_items_id_fk" FOREIGN KEY ("movementId") REFERENCES "public"."movement_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manual_portfolio_operations_effective_date_idx" ON "manual_portfolio_operations" USING btree ("effectiveDate","createdAt");--> statement-breakpoint
CREATE INDEX "portfolio_operation_reconciliation_operation_recorded_idx" ON "portfolio_operation_reconciliation_events" USING btree ("operationId","recordedAt");--> statement-breakpoint
CREATE INDEX "portfolio_operation_reconciliation_movement_recorded_idx" ON "portfolio_operation_reconciliation_events" USING btree ("movementId","recordedAt");