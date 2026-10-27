import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { financialRecurrencesRepository } from "@/backend/repositories/financial-recurrences.repository";
import {
  getFinancialRecurrenceDates,
  isProjectionMonth,
  financialRecurrenceFrequencies,
} from "@/backend/services/financial-recurrence-schedule";

const maximumAmount = 999_999_999_999.99;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amountSchema = z
  .number()
  .finite()
  .positive()
  .max(maximumAmount)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
    "Use no máximo duas casas decimais.",
  );

const recurrenceSchema = z.object({
  kind: z.enum(["INCOME", "EXPENSE"]).default("EXPENSE"),
  description: z.string().trim().min(1).max(120),
  category: z.string().trim().max(80).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  amount: amountSchema,
  frequency: z.enum(financialRecurrenceFrequencies),
  firstDueDate: dateSchema,
  essential: z.boolean().default(false),
});

const recurrenceUpdateSchema = recurrenceSchema.extend({
  kind: z.enum(["INCOME", "EXPENSE"]).optional(),
  id: z.string().uuid(),
  active: z.boolean().optional(),
});

const realizedSchema = z.object({
  recurrenceId: z.string().uuid(),
  dueDate: dateSchema,
  actualDate: dateSchema.optional(),
  actualAmount: amountSchema,
});

function validateIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new ApplicationError("Informe uma data válida.", 400);
  return date;
}

function parseMonth(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    throw new ApplicationError("Informe o mês no formato AAAA-MM.", 400);
  }
  const [year, monthNumber] = value.split("-").map(Number);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthNumber) ||
    year < 1900 ||
    year > 9998 ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    throw new ApplicationError("Informe um mês válido.", 400);
  }
  const startDate = `${value}-01`;
  const endDate = new Date(Date.UTC(year, monthNumber, 0))
    .toISOString()
    .slice(0, 10);
  return { year, month: monthNumber - 1, startDate, endDate };
}

function amountString(value: number) {
  return value.toFixed(2);
}

function asRecurrenceInput(
  input: z.infer<typeof recurrenceSchema>,
  categoryId: string | null,
) {
  const firstDueDate = validateIsoDate(input.firstDueDate);
  return {
    description: input.description,
    amount: amountString(input.amount),
    frequency: input.frequency,
    firstDueDate: firstDueDate.toISOString().slice(0, 10),
    essential: input.essential,
    kind: input.kind,
    categoryId,
  };
}

export class FinancialRecurrencesService {
  async getMonthlyOverview(monthValue: string | null | undefined) {
    const month = parseMonth(monthValue);
    const [recurrences, savedOccurrences] = await Promise.all([
      financialRecurrencesRepository.listRecurrences(),
      financialRecurrencesRepository.listOccurrencesForMonth(
        month.startDate,
        month.endDate,
      ),
    ]);
    const historicalOccurrences =
      await financialRecurrencesRepository.listLatestRealizedBeforeDate(
        recurrences.map((recurrence) => recurrence.id),
        month.startDate,
      );
    const savedByKey = new Map(
      savedOccurrences.map((occurrence) => [
        `${occurrence.recurrenceId}:${occurrence.dueDate}`,
        occurrence,
      ]),
    );
    const occurrenceKeys = new Set<string>();
    const occurrences = [];

    for (const recurrence of recurrences) {
      const dates =
        recurrence.active && isProjectionMonth(monthValue!)
          ? getFinancialRecurrenceDates(
              recurrence.firstDueDate,
              recurrence.frequency,
              month.year,
              month.month,
            )
          : [];
      for (const dueDate of dates) {
        const key = `${recurrence.id}:${dueDate}`;
        occurrenceKeys.add(key);
        const saved = savedByKey.get(key);
        occurrences.push({
          id: key,
          recurrenceId: recurrence.id,
          kind: recurrence.kind,
          description: recurrence.description,
          category: recurrence.category,
          essential: recurrence.essential,
          dueDate,
          expectedAmount: saved?.expectedAmount ?? recurrence.amount,
          actualAmount: saved?.actualAmount ?? null,
          actualDate: saved?.actualDate ?? null,
          status: saved?.realizedAt
            ? ("realized" as const)
            : ("planned" as const),
        });
      }
    }

    for (const saved of savedOccurrences) {
      const key = `${saved.recurrenceId}:${saved.dueDate}`;
      if (occurrenceKeys.has(key)) continue;
      const recurrence = recurrences.find(
        (candidate) => candidate.id === saved.recurrenceId,
      );
      if (!recurrence || !saved.realizedAt || !saved.actualAmount) continue;
      occurrences.push({
        id: key,
        recurrenceId: recurrence.id,
        kind: recurrence.kind,
        description: recurrence.description,
        category: recurrence.category,
        essential: recurrence.essential,
        dueDate: saved.dueDate,
        expectedAmount: saved.expectedAmount,
        actualAmount: saved.actualAmount,
        actualDate: saved.actualDate,
        status: "realized" as const,
      });
    }

    const latestHistoryByRecurrence = new Map(
      historicalOccurrences.map((occurrence) => [
        occurrence.recurrenceId,
        occurrence,
      ]),
    );
    const occurrencesWithHistory = occurrences.map((occurrence) => {
      const previousWithinMonth = savedOccurrences
        .filter(
          (saved) =>
            saved.recurrenceId === occurrence.recurrenceId &&
            saved.dueDate < occurrence.dueDate &&
            saved.actualAmount !== null &&
            saved.realizedAt !== null,
        )
        .sort((left, right) => right.dueDate.localeCompare(left.dueDate))[0];
      const previous =
        previousWithinMonth ??
        latestHistoryByRecurrence.get(occurrence.recurrenceId);
      return {
        ...occurrence,
        previousActualAmount: previous?.actualAmount ?? null,
        previousDueDate: previous?.dueDate ?? null,
      };
    });
    occurrencesWithHistory.sort((left, right) =>
      left.dueDate.localeCompare(right.dueDate),
    );
    return {
      month: monthValue,
      recurrences,
      recurrenceOccurrences: occurrencesWithHistory,
    };
  }

  async create(body: unknown) {
    const parsed = recurrenceSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError(
        "Revise os dados da recorrência financeira.",
        400,
      );
    }
    validateIsoDate(parsed.data.firstDueDate);
    if (parsed.data.kind === "INCOME" && parsed.data.essential) {
      throw new ApplicationError(
        "Receitas recorrentes não podem ser marcadas como essenciais.",
        400,
      );
    }
    const categoryId = await this.resolveCategory(parsed.data);
    return financialRecurrencesRepository.createRecurrence(
      asRecurrenceInput(parsed.data, categoryId),
    );
  }

  async update(body: unknown) {
    const parsed = recurrenceUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError(
        "Revise os dados da recorrência financeira.",
        400,
      );
    }
    validateIsoDate(parsed.data.firstDueDate);
    const current = await financialRecurrencesRepository.findRecurrence(
      parsed.data.id,
    );
    if (!current)
      throw new ApplicationError("Recorrência não encontrada.", 404);
    const kind = parsed.data.kind ?? (current.kind as "INCOME" | "EXPENSE");
    if (kind === "INCOME" && parsed.data.essential) {
      throw new ApplicationError(
        "Receitas recorrentes não podem ser marcadas como essenciais.",
        400,
      );
    }
    if (
      current.kind !== kind &&
      (await financialRecurrencesRepository.hasRealizedOccurrences(current.id))
    ) {
      throw new ApplicationError(
        "O tipo da recorrência não pode ser alterado depois do registro de um valor realizado.",
        409,
      );
    }
    const recurrenceInput = { ...parsed.data, kind };
    const categoryId = await this.resolveCategory(recurrenceInput);
    return financialRecurrencesRepository.updateRecurrence(parsed.data.id, {
      ...asRecurrenceInput(recurrenceInput, categoryId),
      active: parsed.data.active ?? current.active,
    });
  }

  async realizeOccurrence(body: unknown, now = new Date()) {
    const parsed = realizedSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError(
        "Revise o valor realizado e a data da recorrência.",
        400,
      );
    }
    validateIsoDate(parsed.data.dueDate);
    const actualDate = parsed.data.actualDate
      ? validateIsoDate(parsed.data.actualDate).toISOString().slice(0, 10)
      : null;
    const recurrence = await financialRecurrencesRepository.findRecurrence(
      parsed.data.recurrenceId,
    );
    if (!recurrence)
      throw new ApplicationError("Recorrência não encontrada.", 404);
    const [year, month] = parsed.data.dueDate.split("-").map(Number);
    const occurrenceDates = getFinancialRecurrenceDates(
      recurrence.firstDueDate,
      recurrence.frequency,
      year,
      month - 1,
    );
    if (!occurrenceDates.includes(parsed.data.dueDate)) {
      throw new ApplicationError(
        "A data informada não corresponde a uma ocorrência desta recorrência.",
        400,
      );
    }
    return financialRecurrencesRepository.realizeOccurrence({
      recurrenceId: recurrence.id,
      dueDate: parsed.data.dueDate,
      actualDate,
      expectedAmount: recurrence.amount,
      actualAmount: amountString(parsed.data.actualAmount),
      realizedAt: now,
    });
  }

  private async resolveCategory(input: z.infer<typeof recurrenceSchema>) {
    if (input.categoryId) {
      const categoryId =
        await financialRecurrencesRepository.findCategoryForUser(
          input.categoryId,
          input.kind,
        );
      if (!categoryId)
        throw new ApplicationError(
          "Selecione uma categoria válida para esta movimentação.",
          400,
        );
      return categoryId;
    }
    return financialRecurrencesRepository.findOrCreateCategory(
      input.kind,
      input.category ?? null,
    );
  }
}

export const financialRecurrencesService = new FinancialRecurrencesService();
