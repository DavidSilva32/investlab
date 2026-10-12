ALTER TABLE "manual_portfolio_operations" ADD COLUMN "idempotencyKey" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio_operation_reconciliation_events" ADD COLUMN "eventOrder" bigserial NOT NULL;--> statement-breakpoint
WITH ordered_events AS (
  SELECT "id", row_number() OVER (ORDER BY "recordedAt", "id") AS event_order
  FROM "portfolio_operation_reconciliation_events"
)
UPDATE "portfolio_operation_reconciliation_events" AS event
SET "eventOrder" = ordered_events.event_order
FROM ordered_events
WHERE event."id" = ordered_events."id";--> statement-breakpoint
SELECT setval(
  pg_get_serial_sequence('"portfolio_operation_reconciliation_events"', 'eventOrder'),
  COALESCE(MAX("eventOrder"), 1),
  MAX("eventOrder") IS NOT NULL
)
FROM "portfolio_operation_reconciliation_events";--> statement-breakpoint
CREATE UNIQUE INDEX "manual_portfolio_operations_idempotency_key_unique" ON "manual_portfolio_operations" USING btree ("idempotencyKey");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_operation_reconciliation_event_order_unique" ON "portfolio_operation_reconciliation_events" USING btree ("eventOrder");
