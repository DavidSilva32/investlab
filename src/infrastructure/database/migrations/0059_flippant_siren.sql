CREATE TABLE "recurring_expense_occurrences" (
	"userId" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurringExpenseId" uuid NOT NULL,
	"dueDate" date NOT NULL,
	"expectedAmount" numeric(14, 2) NOT NULL,
	"actualAmount" numeric(14, 2),
	"realizedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_expenses" (
	"userId" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" varchar(120) NOT NULL,
	"category" varchar(80),
	"amount" numeric(14, 2) NOT NULL,
	"frequency" varchar(16) NOT NULL,
	"firstDueDate" date NOT NULL,
	"essential" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_expense_occurrences" ADD CONSTRAINT "recurring_expense_occurrences_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expense_occurrences" ADD CONSTRAINT "recurring_expense_occurrences_recurringExpenseId_recurring_expenses_id_fk" FOREIGN KEY ("recurringExpenseId") REFERENCES "public"."recurring_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_expense_occurrences_user_expense_date_uidx" ON "recurring_expense_occurrences" USING btree ("userId","recurringExpenseId","dueDate");--> statement-breakpoint
CREATE INDEX "recurring_expense_occurrences_user_due_idx" ON "recurring_expense_occurrences" USING btree ("userId","dueDate");--> statement-breakpoint
CREATE INDEX "recurring_expenses_user_active_idx" ON "recurring_expenses" USING btree ("userId","active");