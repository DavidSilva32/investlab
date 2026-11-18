CREATE TABLE "financial_statement_import_rows" (
	"userId" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"importId" uuid NOT NULL,
	"sourceRow" integer NOT NULL,
	"entryId" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_statement_imports" (
	"userId" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fileHash" varchar(64) NOT NULL,
	"importedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_statement_import_rows" ADD CONSTRAINT "financial_statement_import_rows_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement_import_rows" ADD CONSTRAINT "financial_statement_import_rows_importId_financial_statement_imports_id_fk" FOREIGN KEY ("importId") REFERENCES "public"."financial_statement_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement_import_rows" ADD CONSTRAINT "financial_statement_import_rows_entryId_financial_entries_id_fk" FOREIGN KEY ("entryId") REFERENCES "public"."financial_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement_imports" ADD CONSTRAINT "financial_statement_imports_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_statement_import_rows_import_row_uidx" ON "financial_statement_import_rows" USING btree ("importId","sourceRow");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_statement_imports_user_hash_uidx" ON "financial_statement_imports" USING btree ("userId","fileHash");