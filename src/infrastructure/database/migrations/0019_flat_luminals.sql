CREATE TABLE "cvm_share_capital_facts" (
	"factKey" varchar(64) PRIMARY KEY NOT NULL,
	"issuerCnpj" varchar(14) NOT NULL,
	"ingestionRunId" uuid NOT NULL,
	"referenceDate" date,
	"documentVersion" integer NOT NULL,
	"documentId" varchar(32) NOT NULL,
	"documentReceivedDate" date,
	"metadataStatus" varchar(16) NOT NULL,
	"recordKind" varchar(40) NOT NULL,
	"capitalId" varchar(32),
	"shareholderId" varchar(32),
	"sourceArchive" varchar(64) NOT NULL,
	"sourceFile" varchar(128) NOT NULL,
	"sourceRow" integer NOT NULL,
	"rawFields" jsonb NOT NULL,
	"tickerClassStatus" varchar(16) NOT NULL,
	"quantitySemantics" varchar(64) NOT NULL,
	"fetchedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cvm_share_class_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingestionRunId" uuid NOT NULL,
	"issuerCnpj" varchar(14) NOT NULL,
	"ticker" varchar(16) NOT NULL,
	"instrumentSubtype" varchar(16) NOT NULL,
	"tickerClassStatus" varchar(16) NOT NULL,
	"unitCompositionStatus" varchar(16) NOT NULL,
	"freDocumentAlignmentStatus" varchar(16) NOT NULL,
	"crossSourceAlignmentStatus" varchar(16) NOT NULL,
	"effectiveDateStatus" varchar(16) NOT NULL,
	"eventHistoryStatus" varchar(16) NOT NULL,
	"treasuryStatus" varchar(32) NOT NULL,
	"reasons" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"reconciledAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cvm_share_capital_facts" ADD CONSTRAINT "cvm_share_capital_facts_issuerCnpj_screener_issuers_cnpj_fk" FOREIGN KEY ("issuerCnpj") REFERENCES "public"."screener_issuers"("cnpj") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cvm_share_capital_facts" ADD CONSTRAINT "cvm_share_capital_facts_ingestionRunId_screener_ingestion_runs_id_fk" FOREIGN KEY ("ingestionRunId") REFERENCES "public"."screener_ingestion_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cvm_share_class_reconciliations" ADD CONSTRAINT "cvm_share_class_reconciliations_ingestionRunId_screener_ingestion_runs_id_fk" FOREIGN KEY ("ingestionRunId") REFERENCES "public"."screener_ingestion_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cvm_share_class_reconciliations" ADD CONSTRAINT "cvm_share_class_reconciliations_issuerCnpj_screener_issuers_cnpj_fk" FOREIGN KEY ("issuerCnpj") REFERENCES "public"."screener_issuers"("cnpj") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cvm_share_capital_issuer_reference_idx" ON "cvm_share_capital_facts" USING btree ("issuerCnpj","referenceDate");--> statement-breakpoint
CREATE INDEX "cvm_share_capital_document_idx" ON "cvm_share_capital_facts" USING btree ("issuerCnpj","documentId","documentVersion");--> statement-breakpoint
CREATE INDEX "cvm_share_capital_received_idx" ON "cvm_share_capital_facts" USING btree ("documentReceivedDate");--> statement-breakpoint
CREATE INDEX "cvm_share_capital_run_idx" ON "cvm_share_capital_facts" USING btree ("ingestionRunId");--> statement-breakpoint
CREATE UNIQUE INDEX "cvm_share_class_run_ticker_uidx" ON "cvm_share_class_reconciliations" USING btree ("ingestionRunId","ticker");--> statement-breakpoint
CREATE INDEX "cvm_share_class_issuer_idx" ON "cvm_share_class_reconciliations" USING btree ("issuerCnpj","ticker");