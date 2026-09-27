CREATE TABLE "study_list_entries" (
	"issuerCnpj" varchar(14) PRIMARY KEY NOT NULL,
	"companyName" text NOT NULL,
	"ticker" varchar(16),
	"reason" text NOT NULL,
	"addedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_list_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuerCnpj" varchar(14) NOT NULL,
	"text" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_list_observations" ADD CONSTRAINT "study_list_observations_issuerCnpj_study_list_entries_issuerCnpj_fk" FOREIGN KEY ("issuerCnpj") REFERENCES "public"."study_list_entries"("issuerCnpj") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_list_observations_entry_created_idx" ON "study_list_observations" USING btree ("issuerCnpj","createdAt");