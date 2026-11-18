CREATE TABLE "financial_statement_category_rules" (
	"userId" text NOT NULL,
	"kind" varchar(8) NOT NULL,
	"descriptionKey" varchar(120) NOT NULL,
	"categoryId" uuid NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_statement_category_rules_kind_check" CHECK ("financial_statement_category_rules"."kind" in ('INCOME', 'EXPENSE'))
);
--> statement-breakpoint
ALTER TABLE "financial_statement_category_rules" ADD CONSTRAINT "financial_statement_category_rules_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement_category_rules" ADD CONSTRAINT "financial_statement_category_rules_categoryId_financial_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."financial_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_statement_category_rules_user_key_uidx" ON "financial_statement_category_rules" USING btree ("userId","kind","descriptionKey");