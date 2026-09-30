CREATE TABLE "portfolio_objective_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"objectiveId" uuid NOT NULL,
	"assetKey" varchar(80) NOT NULL,
	"assignedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_objective_positions_assetKey_unique" UNIQUE("assetKey")
);
--> statement-breakpoint
CREATE TABLE "portfolio_objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(16) DEFAULT 'CUSTOM' NOT NULL,
	"name" varchar(120) NOT NULL,
	"targetAmount" numeric(18, 2),
	"monthlyPlannedAmount" numeric(18, 2),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portfolio_objective_positions" ADD CONSTRAINT "portfolio_objective_positions_objectiveId_portfolio_objectives_id_fk" FOREIGN KEY ("objectiveId") REFERENCES "public"."portfolio_objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portfolio_objective_positions_objective_idx" ON "portfolio_objective_positions" USING btree ("objectiveId");--> statement-breakpoint
CREATE INDEX "portfolio_objectives_kind_created_idx" ON "portfolio_objectives" USING btree ("kind","createdAt");--> statement-breakpoint
INSERT INTO "portfolio_objectives" ("id", "kind", "name")
VALUES ('00000000-0000-4000-8000-000000000010', 'RESERVE', 'Reserva')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "portfolio_objective_positions" ("objectiveId", "assetKey")
SELECT '00000000-0000-4000-8000-000000000010', expanded.asset_key
FROM "emergency_reserve_settings"
CROSS JOIN LATERAL jsonb_array_elements_text("selectedAssetKeys") AS expanded(asset_key)
ON CONFLICT ("assetKey") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "emergency_reserve_settings" DROP COLUMN "selectedAssetKeys";
