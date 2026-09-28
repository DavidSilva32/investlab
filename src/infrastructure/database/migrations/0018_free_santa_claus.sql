CREATE TABLE "valuation_accounting_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factKey" varchar(64) NOT NULL,
	"issuerCnpj" varchar(14) NOT NULL,
	"ingestionRunId" uuid NOT NULL,
	"documentType" varchar(8) NOT NULL,
	"documentId" text,
	"documentCategory" varchar(8),
	"documentReceivedDate" date,
	"metadataMatch" varchar(12) NOT NULL,
	"referenceDate" date NOT NULL,
	"periodStart" date,
	"periodEnd" date,
	"statement" varchar(12) NOT NULL,
	"accountCode" varchar(24) NOT NULL,
	"accountLabel" text NOT NULL,
	"candidateKind" varchar(48),
	"rawValue" text,
	"currency" varchar(8),
	"scale" varchar(8),
	"statementGroup" text,
	"exerciseOrder" varchar(16),
	"version" varchar(16) NOT NULL,
	"sourceFile" varchar(256) NOT NULL,
	"sourceRow" integer NOT NULL,
	"archiveFetchedAt" timestamp with time zone NOT NULL,
	"recordType" varchar(10) NOT NULL,
	"calculatedValue" text,
	"derivationMethod" varchar(32),
	"derivationCurrentFactKey" varchar(64),
	"derivationPreviousFactKey" varchar(64),
	CONSTRAINT "valuation_accounting_facts_factKey_unique" UNIQUE("factKey")
);
--> statement-breakpoint
ALTER TABLE "valuation_accounting_facts" ADD CONSTRAINT "valuation_accounting_facts_issuerCnpj_screener_issuers_cnpj_fk" FOREIGN KEY ("issuerCnpj") REFERENCES "public"."screener_issuers"("cnpj") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuation_accounting_facts" ADD CONSTRAINT "valuation_accounting_facts_ingestionRunId_screener_ingestion_runs_id_fk" FOREIGN KEY ("ingestionRunId") REFERENCES "public"."screener_ingestion_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "valuation_accounting_issuer_reference_idx" ON "valuation_accounting_facts" USING btree ("issuerCnpj","referenceDate");--> statement-breakpoint
CREATE INDEX "valuation_accounting_received_idx" ON "valuation_accounting_facts" USING btree ("issuerCnpj","documentReceivedDate");