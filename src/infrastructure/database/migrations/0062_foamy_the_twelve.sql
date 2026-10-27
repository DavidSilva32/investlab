ALTER TABLE "recurring_expenses" RENAME TO "financial_recurrences";--> statement-breakpoint
ALTER TABLE "recurring_expense_occurrences" RENAME TO "recurring_financial_occurrences";--> statement-breakpoint
ALTER TABLE "recurring_financial_occurrences" RENAME COLUMN "recurringExpenseId" TO "recurrenceId";--> statement-breakpoint
ALTER TABLE "recurring_financial_occurrences" RENAME CONSTRAINT "recurring_expense_occurrences_userId_auth_users_id_fk" TO "recurring_financial_occurrences_userId_auth_users_id_fk";--> statement-breakpoint
ALTER TABLE "recurring_financial_occurrences" RENAME CONSTRAINT "recurring_expense_occurrences_recurringExpenseId_recurring_expenses_id_fk" TO "recurring_financial_occurrences_recurrenceId_financial_recurrences_id_fk";--> statement-breakpoint
ALTER INDEX "recurring_expense_occurrences_user_expense_date_uidx" RENAME TO "recurring_financial_occurrences_user_recurrence_date_uidx";--> statement-breakpoint
ALTER INDEX "recurring_expense_occurrences_user_due_idx" RENAME TO "recurring_financial_occurrences_user_due_idx";--> statement-breakpoint
ALTER TABLE "financial_recurrences" DROP CONSTRAINT "recurring_expenses_userId_auth_users_id_fk";
--> statement-breakpoint
ALTER TABLE "financial_recurrences" DROP CONSTRAINT "recurring_expenses_categoryId_financial_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "financial_recurrences" ADD CONSTRAINT "financial_recurrences_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_recurrences" ADD CONSTRAINT "financial_recurrences_categoryId_financial_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."financial_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_recurrences" DROP COLUMN "category";--> statement-breakpoint
