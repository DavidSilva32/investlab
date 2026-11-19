-- Custom SQL migration file, put your code below! --
INSERT INTO "financial_categories" ("kind", "name", "isDefault") VALUES
	('INCOME', 'Proventos de investimentos', true),
	('EXPENSE', 'Transferências enviadas', true),
	('INCOME', 'Transferências recebidas', true);
