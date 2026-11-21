CREATE TABLE "financial_card_settlement_links" (
	"userId" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlementEntryId" uuid NOT NULL,
	"cardEntryId" uuid NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_card_settlement_links_distinct_entries_check" CHECK ("financial_card_settlement_links"."settlementEntryId" <> "financial_card_settlement_links"."cardEntryId")
);
--> statement-breakpoint
ALTER TABLE "financial_entries" ADD COLUMN "channel" varchar(12) DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD COLUMN "sourceCategory" varchar(80);--> statement-breakpoint
ALTER TABLE "financial_entries" ADD COLUMN "cardSettlementStatus" varchar(16);--> statement-breakpoint
ALTER TABLE "financial_statement_imports" ADD COLUMN "source" varchar(12) DEFAULT 'ACCOUNT' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_statement_imports" ADD COLUMN "coverageStart" date;--> statement-breakpoint
ALTER TABLE "financial_statement_imports" ADD COLUMN "coverageEnd" date;--> statement-breakpoint
UPDATE "financial_entries" AS entry
SET "channel" = 'ACCOUNT'
FROM "financial_statement_import_rows" AS imported_row
WHERE imported_row."entryId" = entry."id"
  AND imported_row."userId" = entry."userId";--> statement-breakpoint
UPDATE "financial_statement_imports" AS statement_import
SET "coverageStart" = coverage."coverageStart",
    "coverageEnd" = coverage."coverageEnd"
FROM (
  SELECT imported_row."importId",
         MIN(entry."actualDate") AS "coverageStart",
         MAX(entry."actualDate") AS "coverageEnd"
  FROM "financial_statement_import_rows" AS imported_row
  INNER JOIN "financial_entries" AS entry
    ON entry."id" = imported_row."entryId"
   AND entry."userId" = imported_row."userId"
  GROUP BY imported_row."importId"
) AS coverage
WHERE statement_import."id" = coverage."importId";--> statement-breakpoint
UPDATE "financial_entries" AS entry
SET "cardSettlementStatus" = 'AGGREGATE'
FROM "financial_categories" AS category
WHERE category."id" = entry."categoryId"
  AND category."name" = 'Fatura do cartão'
  AND entry."channel" = 'ACCOUNT'
  AND entry."kind" = 'EXPENSE';--> statement-breakpoint
CREATE UNIQUE INDEX "financial_entries_user_id_uidx" ON "financial_entries" USING btree ("userId","id");--> statement-breakpoint
ALTER TABLE "financial_card_settlement_links" ADD CONSTRAINT "financial_card_settlement_links_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_card_settlement_links" ADD CONSTRAINT "financial_card_settlement_links_settlement_owner_fk" FOREIGN KEY ("userId","settlementEntryId") REFERENCES "public"."financial_entries"("userId","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_card_settlement_links" ADD CONSTRAINT "financial_card_settlement_links_card_owner_fk" FOREIGN KEY ("userId","cardEntryId") REFERENCES "public"."financial_entries"("userId","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_card_settlement_links_user_card_uidx" ON "financial_card_settlement_links" USING btree ("userId","cardEntryId");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_card_settlement_links_pair_uidx" ON "financial_card_settlement_links" USING btree ("userId","settlementEntryId","cardEntryId");--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_channel_check" CHECK ("financial_entries"."channel" in ('MANUAL', 'ACCOUNT', 'CARD'));--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_card_settlement_status_check" CHECK ("financial_entries"."cardSettlementStatus" is null or "financial_entries"."cardSettlementStatus" in ('AGGREGATE', 'PENDING', 'LINKED', 'NOT_RELATED'));--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_card_settlement_source_check" CHECK ("financial_entries"."cardSettlementStatus" is null or ("financial_entries"."channel" = 'ACCOUNT' and "financial_entries"."kind" = 'EXPENSE'));--> statement-breakpoint
ALTER TABLE "financial_statement_imports" ADD CONSTRAINT "financial_statement_imports_source_check" CHECK ("financial_statement_imports"."source" in ('ACCOUNT', 'CARD'));--> statement-breakpoint
ALTER TABLE "financial_statement_imports" ADD CONSTRAINT "financial_statement_imports_coverage_pair_check" CHECK (("financial_statement_imports"."coverageStart" is null and "financial_statement_imports"."coverageEnd" is null) or ("financial_statement_imports"."coverageStart" is not null and "financial_statement_imports"."coverageEnd" is not null and "financial_statement_imports"."coverageStart" <= "financial_statement_imports"."coverageEnd"));
