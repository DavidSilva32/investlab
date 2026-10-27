CREATE TABLE "financial_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text,
	"kind" varchar(8) NOT NULL,
	"name" varchar(80) NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_categories_kind_check" CHECK ("financial_categories"."kind" in ('INCOME', 'EXPENSE')),
	CONSTRAINT "financial_categories_owner_default_check" CHECK (("financial_categories"."userId" is null and "financial_categories"."isDefault") or ("financial_categories"."userId" is not null and not "financial_categories"."isDefault"))
);
--> statement-breakpoint
CREATE TABLE "financial_category_preferences" (
	"userId" text NOT NULL,
	"categoryId" uuid NOT NULL,
	"nameOverride" varchar(80),
	"active" boolean DEFAULT true NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_entries" (
	"userId" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(8) NOT NULL,
	"description" varchar(120) NOT NULL,
	"categoryId" uuid NOT NULL,
	"expectedAmount" numeric(14, 2),
	"expectedDate" date,
	"actualAmount" numeric(14, 2),
	"actualDate" date,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_entries_kind_check" CHECK ("financial_entries"."kind" in ('INCOME', 'EXPENSE')),
	CONSTRAINT "financial_entries_expected_pair_check" CHECK (("financial_entries"."expectedAmount" is null and "financial_entries"."expectedDate" is null) or ("financial_entries"."expectedAmount" > 0 and "financial_entries"."expectedDate" is not null)),
	CONSTRAINT "financial_entries_actual_pair_check" CHECK (("financial_entries"."actualAmount" is null and "financial_entries"."actualDate" is null) or ("financial_entries"."actualAmount" > 0 and "financial_entries"."actualDate" is not null)),
	CONSTRAINT "financial_entries_amount_required_check" CHECK ("financial_entries"."expectedAmount" is not null or "financial_entries"."actualAmount" is not null)
);
--> statement-breakpoint
ALTER TABLE "recurring_expense_occurrences" ADD COLUMN "actualDate" date;--> statement-breakpoint
INSERT INTO "financial_categories" ("kind", "name", "isDefault") VALUES
	('INCOME', 'Salário', true),
	('INCOME', 'Trabalho autônomo', true),
	('INCOME', 'Benefícios', true),
	('INCOME', 'Renda de aluguel', true),
	('INCOME', 'Outras entradas', true),
	('EXPENSE', 'Moradia', true),
	('EXPENSE', 'Alimentação', true),
	('EXPENSE', 'Transporte', true),
	('EXPENSE', 'Saúde', true),
	('EXPENSE', 'Educação', true),
	('EXPENSE', 'Contas e serviços', true),
	('EXPENSE', 'Lazer', true),
	('EXPENSE', 'Impostos e taxas', true),
	('EXPENSE', 'Seguros', true),
	('EXPENSE', 'Outras despesas', true);--> statement-breakpoint
ALTER TABLE "financial_categories" ADD CONSTRAINT "financial_categories_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_category_preferences" ADD CONSTRAINT "financial_category_preferences_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_category_preferences" ADD CONSTRAINT "financial_category_preferences_categoryId_financial_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."financial_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_categoryId_financial_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."financial_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_categories_default_name_uidx" ON "financial_categories" USING btree ("kind",lower(trim("name"))) WHERE "financial_categories"."userId" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_categories_owner_name_uidx" ON "financial_categories" USING btree ("userId","kind",lower(trim("name"))) WHERE "financial_categories"."userId" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_category_preferences_user_category_uidx" ON "financial_category_preferences" USING btree ("userId","categoryId");--> statement-breakpoint
CREATE INDEX "financial_entries_user_expected_date_idx" ON "financial_entries" USING btree ("userId","expectedDate");--> statement-breakpoint
CREATE INDEX "financial_entries_user_actual_date_idx" ON "financial_entries" USING btree ("userId","actualDate");
