CREATE TABLE "position_reconciliation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manualAssetKey" varchar(64) NOT NULL,
	"importedAssetKey" varchar(67) NOT NULL,
	"status" varchar(16) NOT NULL,
	"effectiveFrom" date NOT NULL,
	"recordedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"requestId" text NOT NULL,
	"importId" uuid,
	CONSTRAINT "position_reconciliation_status_check" CHECK ("position_reconciliation_events"."status" IN ('LINK', 'UNLINK', 'SEPARATE'))
);
--> statement-breakpoint
CREATE INDEX "position_reconciliation_manual_recorded_idx" ON "position_reconciliation_events" USING btree ("manualAssetKey","recordedAt");