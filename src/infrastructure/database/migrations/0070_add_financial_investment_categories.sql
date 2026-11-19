-- Custom SQL migration file, put your code below! --
INSERT INTO "financial_categories" ("kind", "name", "isDefault") VALUES
	('EXPENSE', 'Investimentos', true),
	('INCOME', 'Resgates de investimentos', true);
