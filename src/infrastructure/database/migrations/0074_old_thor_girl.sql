ALTER TABLE "financial_entries" DROP CONSTRAINT "financial_entries_card_settlement_source_check";--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_card_settlement_source_check" CHECK ("financial_entries"."cardSettlementStatus" is null or ("financial_entries"."channel" in ('ACCOUNT', 'MANUAL') and "financial_entries"."kind" = 'EXPENSE'));--> statement-breakpoint
UPDATE "financial_entries" AS entry
SET "cardSettlementStatus" = 'AGGREGATE'
FROM "financial_categories" AS category
WHERE category."id" = entry."categoryId"
  AND category."name" = 'Fatura do cartão'
  AND entry."channel" = 'MANUAL'
  AND entry."kind" = 'EXPENSE'
  AND entry."cardSettlementStatus" IS NULL;
