CREATE TABLE "financial_entry_relations" (
	"userId" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(16) NOT NULL,
	"entryId" uuid NOT NULL,
	"relatedEntryId" uuid NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_entry_relations_kind_check" CHECK ("financial_entry_relations"."kind" in ('TRANSFER', 'REVERSAL')),
	CONSTRAINT "financial_entry_relations_distinct_entries_check" CHECK ("financial_entry_relations"."entryId" <> "financial_entry_relations"."relatedEntryId")
);
--> statement-breakpoint
ALTER TABLE "financial_entries" ADD COLUMN "accountAlias" varchar(80);--> statement-breakpoint
ALTER TABLE "financial_entries" ADD COLUMN "reviewStatus" varchar(24) DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_statement_imports" ADD COLUMN "accountAlias" varchar(80);--> statement-breakpoint
ALTER TABLE "financial_entry_relations" ADD CONSTRAINT "financial_entry_relations_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_entry_relations" ADD CONSTRAINT "financial_entry_relations_entry_owner_fk" FOREIGN KEY ("userId","entryId") REFERENCES "public"."financial_entries"("userId","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_entry_relations" ADD CONSTRAINT "financial_entry_relations_related_owner_fk" FOREIGN KEY ("userId","relatedEntryId") REFERENCES "public"."financial_entries"("userId","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_entry_relations_pair_uidx" ON "financial_entry_relations" USING btree ("userId","kind","entryId","relatedEntryId");--> statement-breakpoint
CREATE INDEX "financial_entry_relations_user_related_idx" ON "financial_entry_relations" USING btree ("userId","relatedEntryId");--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_review_status_check" CHECK ("financial_entries"."reviewStatus" in ('NONE', 'REVERSAL_PENDING'));--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_account_alias_check" CHECK ("financial_entries"."accountAlias" is null or length(trim("financial_entries"."accountAlias")) > 0);