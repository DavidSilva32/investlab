CREATE TABLE "mcp_mutation_replays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"operation" varchar(80) NOT NULL,
	"idempotencyKey" varchar(128) NOT NULL,
	"payloadHash" varchar(64) NOT NULL,
	"result" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portfolio_objective_balance_references" ADD COLUMN "mcpOperation" text;--> statement-breakpoint
ALTER TABLE "portfolio_objective_balance_references" ADD COLUMN "mcpIdempotencyKey" text;--> statement-breakpoint
ALTER TABLE "portfolio_objective_balance_references" ADD COLUMN "mcpPayloadHash" text;--> statement-breakpoint
ALTER TABLE "portfolio_objective_balance_references" ADD COLUMN "mcpReplayResult" jsonb;--> statement-breakpoint
ALTER TABLE "mcp_mutation_replays" ADD CONSTRAINT "mcp_mutation_replays_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_mutation_replays_user_operation_key_uidx" ON "mcp_mutation_replays" USING btree ("userId","operation","idempotencyKey");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_objective_balance_reference_mcp_replay_uidx" ON "portfolio_objective_balance_references" USING btree ("userId","mcpOperation","mcpIdempotencyKey") WHERE "portfolio_objective_balance_references"."mcpIdempotencyKey" IS NOT NULL;