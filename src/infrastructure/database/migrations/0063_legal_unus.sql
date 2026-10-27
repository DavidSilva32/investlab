ALTER TABLE "financial_recurrences" DROP CONSTRAINT "recurring_expenses_kind_check";--> statement-breakpoint
ALTER TABLE "financial_recurrences" DROP CONSTRAINT "recurring_expenses_income_not_essential_check";--> statement-breakpoint
DROP INDEX "recurring_expenses_user_active_idx";--> statement-breakpoint
CREATE INDEX "financial_recurrences_user_active_idx" ON "financial_recurrences" USING btree ("userId","active");--> statement-breakpoint
ALTER TABLE "financial_recurrences" ADD CONSTRAINT "financial_recurrences_kind_check" CHECK ("financial_recurrences"."kind" in ('INCOME', 'EXPENSE'));--> statement-breakpoint
ALTER TABLE "financial_recurrences" ADD CONSTRAINT "financial_recurrences_income_not_essential_check" CHECK ("financial_recurrences"."kind" = 'EXPENSE' or "financial_recurrences"."essential" = false);