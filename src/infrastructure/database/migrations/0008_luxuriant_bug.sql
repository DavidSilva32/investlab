CREATE TABLE "screener_financial_facts" (
	"issuerCnpj" varchar(14) NOT NULL,
	"referenceDate" date NOT NULL,
	"accountCode" varchar(24) NOT NULL,
	"accountLabel" text,
	"value" numeric(26, 2) NOT NULL,
	"documentType" varchar(8) NOT NULL,
	"statementScope" varchar(16) NOT NULL,
	"exerciseOrder" varchar(16) NOT NULL,
	"version" integer NOT NULL,
	"sourceFile" varchar(160) NOT NULL,
	"sourceRow" integer NOT NULL,
	"ingestionRunId" uuid NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screener_ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runKey" varchar(160) NOT NULL,
	"status" varchar(16) NOT NULL,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp with time zone,
	"catalogCount" integer,
	"profileCount" integer,
	"issuerCount" integer,
	"securityCount" integer,
	"factCount" integer,
	"errorCode" varchar(80),
	CONSTRAINT "screener_ingestion_runs_runKey_unique" UNIQUE("runKey")
);
--> statement-breakpoint
CREATE TABLE "screener_issuers" (
	"cnpj" varchar(14) PRIMARY KEY NOT NULL,
	"cvmCode" varchar(12) NOT NULL,
	"name" text NOT NULL,
	"sector" text,
	"quantitativeEligible" boolean DEFAULT false NOT NULL,
	"eligibilityReason" varchar(80),
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screener_issuers_cvmCode_unique" UNIQUE("cvmCode")
);
--> statement-breakpoint
CREATE TABLE "screener_market_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuerCnpj" varchar(14) NOT NULL,
	"observedAt" timestamp with time zone NOT NULL,
	"marketCap" numeric(26, 2),
	"price" numeric(24, 8),
	"sourceTicker" varchar(16) NOT NULL,
	"classSemanticsValidated" boolean DEFAULT false NOT NULL,
	"ingestionRunId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screener_securities" (
	"ticker" varchar(16) PRIMARY KEY NOT NULL,
	"issuerCnpj" varchar(14) NOT NULL,
	"name" text NOT NULL,
	"subType" varchar(16) NOT NULL,
	"isActive" boolean NOT NULL,
	"baseTicker" varchar(16),
	"observedAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "screener_financial_facts" ADD CONSTRAINT "screener_financial_facts_issuerCnpj_screener_issuers_cnpj_fk" FOREIGN KEY ("issuerCnpj") REFERENCES "public"."screener_issuers"("cnpj") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screener_financial_facts" ADD CONSTRAINT "screener_financial_facts_ingestionRunId_screener_ingestion_runs_id_fk" FOREIGN KEY ("ingestionRunId") REFERENCES "public"."screener_ingestion_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screener_market_snapshots" ADD CONSTRAINT "screener_market_snapshots_issuerCnpj_screener_issuers_cnpj_fk" FOREIGN KEY ("issuerCnpj") REFERENCES "public"."screener_issuers"("cnpj") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screener_market_snapshots" ADD CONSTRAINT "screener_market_snapshots_ingestionRunId_screener_ingestion_runs_id_fk" FOREIGN KEY ("ingestionRunId") REFERENCES "public"."screener_ingestion_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screener_securities" ADD CONSTRAINT "screener_securities_issuerCnpj_screener_issuers_cnpj_fk" FOREIGN KEY ("issuerCnpj") REFERENCES "public"."screener_issuers"("cnpj") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "screener_facts_identity_uidx" ON "screener_financial_facts" USING btree ("issuerCnpj","referenceDate","accountCode","documentType","statementScope","exerciseOrder");--> statement-breakpoint
CREATE INDEX "screener_facts_run_idx" ON "screener_financial_facts" USING btree ("ingestionRunId");--> statement-breakpoint
CREATE INDEX "screener_market_issuer_observed_idx" ON "screener_market_snapshots" USING btree ("issuerCnpj","observedAt");--> statement-breakpoint
CREATE INDEX "screener_securities_issuer_idx" ON "screener_securities" USING btree ("issuerCnpj");