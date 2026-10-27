import { logger } from "@/infrastructure/logging/logger";
import { recurringExpensesService } from "@/backend/services/recurring-expenses.service";

export class RecurringExpensesController {
  async get(month: string | null, requestId: string) {
    const data = await recurringExpensesService.getMonthlyOverview(month);
    logger.info("recurring_expenses_loaded", {
      requestId,
      expenses: data.expenses.length,
      occurrences: data.occurrences.length,
      month: data.month,
    });
    return Response.json(data);
  }

  async create(body: unknown, requestId: string) {
    const expense = await recurringExpensesService.create(body);
    logger.info("recurring_expense_created", {
      requestId,
      recurringExpenseId: expense.id,
    });
    return Response.json(
      { ...expense, message: "Despesa recorrente cadastrada." },
      { status: 201 },
    );
  }

  async update(body: unknown, requestId: string) {
    const expense = await recurringExpensesService.update(body);
    logger.info("recurring_expense_updated", {
      requestId,
      recurringExpenseId: expense?.id,
    });
    return Response.json({
      ...expense,
      message: "Despesa recorrente atualizada.",
    });
  }

  async realize(body: unknown, requestId: string) {
    const occurrence = await recurringExpensesService.setRealized(body);
    logger.info("recurring_expense_occurrence_realized", {
      requestId,
      recurringExpenseId: occurrence.recurringExpenseId,
      dueDate: occurrence.dueDate,
    });
    return Response.json({
      ...occurrence,
      message: "Valor realizado registrado.",
    });
  }
}

export const recurringExpensesController = new RecurringExpensesController();
