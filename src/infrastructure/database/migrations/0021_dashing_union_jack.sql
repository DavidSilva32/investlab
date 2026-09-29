CREATE TABLE "treasury_liquidity_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" varchar(80) NOT NULL,
	"sourceUrl" text NOT NULL,
	"sourceTitle" text NOT NULL,
	"observedAt" date NOT NULL,
	"effectiveFrom" date NOT NULL,
	"effectiveTo" date,
	"terms" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "treasury_liquidity_rules_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "treasury_position_liquidity_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"positionItemId" uuid NOT NULL,
	"snapshotId" uuid NOT NULL,
	"ruleVersion" varchar(80) NOT NULL,
	"status" varchar(16) NOT NULL,
	"reasons" jsonb NOT NULL,
	"asOf" date NOT NULL,
	"normalizedTitleType" varchar(40),
	"maturityAt" date,
	"positionQuantity" numeric(24, 8) NOT NULL,
	"availableQuantity" numeric(24, 8),
	"unavailableQuantity" numeric(24, 8),
	"institution" text,
	"assetCode" text,
	"settlementEstimate" jsonb,
	"source" varchar(40) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "treasury_position_liquidity_facts" ADD CONSTRAINT "treasury_position_liquidity_facts_positionItemId_position_items_id_fk" FOREIGN KEY ("positionItemId") REFERENCES "public"."position_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_position_liquidity_facts" ADD CONSTRAINT "treasury_position_liquidity_facts_snapshotId_position_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."position_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_position_liquidity_facts" ADD CONSTRAINT "treasury_position_liquidity_facts_ruleVersion_treasury_liquidity_rules_version_fk" FOREIGN KEY ("ruleVersion") REFERENCES "public"."treasury_liquidity_rules"("version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "treasury_position_liquidity_position_uidx" ON "treasury_position_liquidity_facts" USING btree ("positionItemId");--> statement-breakpoint
CREATE INDEX "treasury_position_liquidity_snapshot_idx" ON "treasury_position_liquidity_facts" USING btree ("snapshotId");
--> statement-breakpoint
INSERT INTO "treasury_liquidity_rules" ("version", "sourceUrl", "sourceTitle", "observedAt", "effectiveFrom", "terms")
VALUES (
	'portaria-mf-1748-2024-v1',
	'https://www.tesourodireto.com.br/sobre-o-tesouro/regras-e-regulamento',
	'Regras e Regulamento do Tesouro Direto — Liquidação do Resgate',
	'2026-09-29',
	'2024-11-11',
	'{"instrumentType":"Tesouro Selic","identityMethod":"Identity uses the B3 XLSX product label, maturity, and snapshot reference date; V1 does not perform an external catalogue match.","regulatoryBasis":{"sourceUrl":"https://www.in.gov.br/web/dou/-/portaria-mf-n-1.748-de-8-de-novembro-de-2024-595136872","sourceTitle":"Portaria MF nº 1.748, de 8 de novembro de 2024 — Regulamento do Programa Tesouro Direto","effectiveFrom":"2024-11-11"},"settlementWindows":[{"requestWindow":"business_day_09_30_to_13_00","relativeSettlement":"same_business_day_from_13_00"},{"requestWindow":"business_day_13_00_to_18_00","relativeSettlement":"next_business_day_from_13_00"},{"requestWindow":"scheduled_after_18_00_or_non_business_day","relativeSettlement":"next_business_day_from_13_00"}]}'::jsonb
)
ON CONFLICT ("version") DO NOTHING;
