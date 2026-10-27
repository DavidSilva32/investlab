ALTER TABLE "recurring_expenses" ADD COLUMN "categoryId" uuid;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD COLUMN "kind" varchar(8) DEFAULT 'EXPENSE' NOT NULL;--> statement-breakpoint
INSERT INTO "financial_categories" ("userId", "kind", "name", "isDefault")
SELECT "userId", 'EXPENSE', MIN(trim("category")), false
FROM "recurring_expenses"
WHERE "category" IS NOT NULL AND trim("category") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "financial_categories" category
    WHERE category."kind" = 'EXPENSE'
      AND lower(trim(category."name")) = lower(trim("recurring_expenses"."category"))
      AND (category."userId" IS NULL OR category."userId" = "recurring_expenses"."userId")
  )
GROUP BY "userId", lower(trim("category"));--> statement-breakpoint
UPDATE "recurring_expenses" recurring
SET "categoryId" = (
  SELECT category."id"
  FROM "financial_categories" category
  WHERE category."kind" = 'EXPENSE'
    AND lower(trim(category."name")) = lower(trim(recurring."category"))
    AND (category."userId" IS NULL OR category."userId" = recurring."userId")
  ORDER BY CASE WHEN category."userId" = recurring."userId" THEN 0 ELSE 1 END
  LIMIT 1
)
WHERE recurring."category" IS NOT NULL
  AND trim(recurring."category") <> '';--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_categoryId_financial_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."financial_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_kind_check" CHECK ("recurring_expenses"."kind" in ('INCOME', 'EXPENSE'));--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_income_not_essential_check" CHECK ("recurring_expenses"."kind" = 'EXPENSE' or "recurring_expenses"."essential" = false);
