import { logger } from "@/infrastructure/logging/logger";
import { financialRecurrencesService } from "@/backend/services/financial-recurrences.service";

export class FinancialRecurrencesController {
  async get(month: string | null, requestId: string) {
    const data = await financialRecurrencesService.getMonthlyOverview(month);
    logger.info("financial_recurrences_loaded", {
      requestId,
      recurrences: data.recurrences.length,
      occurrences: data.recurrenceOccurrences.length,
      month: data.month,
    });
    return Response.json(data);
  }

  async create(body: unknown, requestId: string) {
    const recurrence = await financialRecurrencesService.create(body);
    logger.info("financial_recurrence_created", {
      requestId,
      recurrenceId: recurrence.id,
    });
    return Response.json(
      {
        ...recurrence,
        message:
          recurrence.kind === "INCOME"
            ? "Receita recorrente cadastrada."
            : "Despesa recorrente cadastrada.",
      },
      { status: 201 },
    );
  }

  async update(body: unknown, requestId: string) {
    const recurrence = await financialRecurrencesService.update(body);
    logger.info("financial_recurrence_updated", {
      requestId,
      recurrenceId: recurrence?.id,
    });
    return Response.json({
      ...recurrence,
      message:
        recurrence?.kind === "INCOME"
          ? "Receita recorrente atualizada."
          : "Despesa recorrente atualizada.",
    });
  }

  async realize(body: unknown, requestId: string) {
    const occurrence =
      await financialRecurrencesService.realizeOccurrence(body);
    logger.info("financial_recurrence_occurrence_realized", {
      requestId,
      recurrenceId: occurrence.recurrenceId,
      dueDate: occurrence.dueDate,
    });
    return Response.json({
      ...occurrence,
      message: "Valor realizado registrado.",
    });
  }
}

export const financialRecurrencesController =
  new FinancialRecurrencesController();
