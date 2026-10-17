CREATE TABLE "b3_reconciliation_events" (
	"userId" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eventOrder" bigserial NOT NULL,
	"tradingItemId" uuid NOT NULL,
	"movementItemId" uuid NOT NULL,
	"status" varchar(16) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_items" (
	"userId" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"importId" uuid NOT NULL,
	"sourceRow" integer NOT NULL,
	"identityFingerprint" varchar(64) NOT NULL,
	"side" varchar(4) NOT NULL,
	"tradingDate" date NOT NULL,
	"settlementDate" date,
	"movementType" text NOT NULL,
	"market" text,
	"product" text NOT NULL,
	"assetCode" text,
	"originalAssetCode" text,
	"institution" text,
	"quantity" numeric(24, 8) NOT NULL,
	"unitPrice" numeric(24, 8),
	"grossValue" numeric(24, 8),
	"fees" numeric(24, 8),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "movement_items_user_event_fingerprint_uidx";--> statement-breakpoint
ALTER TABLE "movement_items" ADD COLUMN "sourceRow" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "movement_items" ADD COLUMN "originalAssetCode" text;--> statement-breakpoint
ALTER TABLE "position_items" ADD COLUMN "sourceSheet" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "position_items" ADD COLUMN "sourceRow" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "position_items" ADD COLUMN "instrumentKind" varchar(24) DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "position_items" ADD COLUMN "account" text;--> statement-breakpoint
ALTER TABLE "position_items" ADD COLUMN "issuerCnpj" text;--> statement-breakpoint
ALTER TABLE "position_items" ADD COLUMN "sourceType" text;--> statement-breakpoint
ALTER TABLE "position_items" ADD COLUMN "originalAssetCode" text;--> statement-breakpoint
ALTER TABLE "position_items" ADD COLUMN "isin" text;--> statement-breakpoint
ALTER TABLE "b3_reconciliation_events" ADD CONSTRAINT "b3_reconciliation_events_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b3_reconciliation_events" ADD CONSTRAINT "b3_reconciliation_events_tradingItemId_trading_items_id_fk" FOREIGN KEY ("tradingItemId") REFERENCES "public"."trading_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b3_reconciliation_events" ADD CONSTRAINT "b3_reconciliation_events_movementItemId_movement_items_id_fk" FOREIGN KEY ("movementItemId") REFERENCES "public"."movement_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_items" ADD CONSTRAINT "trading_items_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_items" ADD CONSTRAINT "trading_items_importId_imports_id_fk" FOREIGN KEY ("importId") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "b3_reconciliation_event_order_uidx" ON "b3_reconciliation_events" USING btree ("eventOrder");--> statement-breakpoint
CREATE INDEX "b3_reconciliation_pair_history_idx" ON "b3_reconciliation_events" USING btree ("userId","tradingItemId","movementItemId","eventOrder");--> statement-breakpoint
CREATE UNIQUE INDEX "trading_items_import_source_row_uidx" ON "trading_items" USING btree ("importId","sourceRow");--> statement-breakpoint
CREATE INDEX "trading_items_user_identity_idx" ON "trading_items" USING btree ("userId","identityFingerprint");--> statement-breakpoint
CREATE INDEX "movement_items_user_event_fingerprint_idx" ON "movement_items" USING btree ("userId","eventFingerprint");