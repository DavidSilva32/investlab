-- Custom SQL migration file, put your code below! --
INSERT INTO "financial_categories" ("kind", "name", "isDefault") VALUES
	('EXPENSE', 'Fatura do cartão', true)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "financial_category_preferences"
	("userId", "categoryId", "nameOverride", "active", "updatedAt")
SELECT preference."userId", default_category."id", preference."nameOverride",
	preference."active", preference."updatedAt"
FROM "financial_category_preferences" preference
JOIN "financial_categories" owner_category
	ON owner_category."id" = preference."categoryId"
	AND owner_category."userId" = preference."userId"
JOIN "financial_categories" default_category
	ON default_category."userId" IS NULL
	AND default_category."isDefault"
	AND default_category."kind" = owner_category."kind"
	AND lower(trim(default_category."name")) = lower(trim(owner_category."name"))
WHERE owner_category."kind" = 'EXPENSE'
	AND lower(trim(owner_category."name")) = lower(trim('Fatura do cartão'))
ON CONFLICT ("userId", "categoryId") DO NOTHING;
--> statement-breakpoint

INSERT INTO "financial_category_preferences"
	("userId", "categoryId", "nameOverride", "active", "updatedAt")
SELECT owner_category."userId", default_category."id", NULL,
	owner_category."active", now()
FROM "financial_categories" owner_category
JOIN "financial_categories" default_category
	ON default_category."userId" IS NULL
	AND default_category."isDefault"
	AND default_category."kind" = owner_category."kind"
	AND lower(trim(default_category."name")) = lower(trim(owner_category."name"))
WHERE owner_category."userId" IS NOT NULL
	AND owner_category."kind" = 'EXPENSE'
	AND lower(trim(owner_category."name")) = lower(trim('Fatura do cartão'))
ON CONFLICT ("userId", "categoryId") DO NOTHING;
--> statement-breakpoint

UPDATE "financial_entries" entry
SET "categoryId" = default_category."id"
FROM "financial_categories" owner_category
JOIN "financial_categories" default_category
	ON default_category."userId" IS NULL
	AND default_category."isDefault"
	AND default_category."kind" = owner_category."kind"
	AND lower(trim(default_category."name")) = lower(trim(owner_category."name"))
WHERE entry."categoryId" = owner_category."id"
	AND entry."userId" = owner_category."userId"
	AND owner_category."userId" IS NOT NULL
	AND owner_category."kind" = 'EXPENSE'
	AND lower(trim(owner_category."name")) = lower(trim('Fatura do cartão'));
--> statement-breakpoint

UPDATE "financial_recurrences" recurrence
SET "categoryId" = default_category."id"
FROM "financial_categories" owner_category
JOIN "financial_categories" default_category
	ON default_category."userId" IS NULL
	AND default_category."isDefault"
	AND default_category."kind" = owner_category."kind"
	AND lower(trim(default_category."name")) = lower(trim(owner_category."name"))
WHERE recurrence."categoryId" = owner_category."id"
	AND recurrence."userId" = owner_category."userId"
	AND owner_category."userId" IS NOT NULL
	AND owner_category."kind" = 'EXPENSE'
	AND lower(trim(owner_category."name")) = lower(trim('Fatura do cartão'));
--> statement-breakpoint

UPDATE "financial_statement_category_rules" rule
SET "categoryId" = default_category."id"
FROM "financial_categories" owner_category
JOIN "financial_categories" default_category
	ON default_category."userId" IS NULL
	AND default_category."isDefault"
	AND default_category."kind" = owner_category."kind"
	AND lower(trim(default_category."name")) = lower(trim(owner_category."name"))
WHERE rule."categoryId" = owner_category."id"
	AND rule."userId" = owner_category."userId"
	AND rule."kind" = owner_category."kind"
	AND owner_category."userId" IS NOT NULL
	AND owner_category."kind" = 'EXPENSE'
	AND lower(trim(owner_category."name")) = lower(trim('Fatura do cartão'));
--> statement-breakpoint

DELETE FROM "financial_categories" owner_category
WHERE owner_category."userId" IS NOT NULL
	AND owner_category."kind" = 'EXPENSE'
	AND lower(trim(owner_category."name")) = lower(trim('Fatura do cartão'))
	AND EXISTS (
		SELECT 1
		FROM "financial_categories" default_category
		WHERE default_category."userId" IS NULL
			AND default_category."isDefault"
			AND default_category."kind" = owner_category."kind"
			AND lower(trim(default_category."name")) = lower(trim(owner_category."name"))
	);
