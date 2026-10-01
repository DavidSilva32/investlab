CREATE TABLE "portfolio_objective_balance_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batchId" uuid NOT NULL,
	"objectiveId" uuid NOT NULL,
	"amountCents" numeric(20, 0) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_objective_balance_reference_amount_nonnegative_chk" CHECK ("portfolio_objective_balance_references"."amountCents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "portfolio_objective_reference_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observedOn" date NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portfolio_objective_balance_references" ADD CONSTRAINT "portfolio_objective_balance_references_batchId_portfolio_objective_reference_batches_id_fk" FOREIGN KEY ("batchId") REFERENCES "public"."portfolio_objective_reference_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_objective_balance_references" ADD CONSTRAINT "portfolio_objective_balance_references_objectiveId_portfolio_objectives_id_fk" FOREIGN KEY ("objectiveId") REFERENCES "public"."portfolio_objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_objective_balance_reference_batch_objective_uidx" ON "portfolio_objective_balance_references" USING btree ("batchId","objectiveId");--> statement-breakpoint
CREATE INDEX "portfolio_objective_balance_reference_objective_created_idx" ON "portfolio_objective_balance_references" USING btree ("objectiveId","createdAt");