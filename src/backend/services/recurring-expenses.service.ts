import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { recurringExpensesRepository } from "@/backend/repositories/recurring-expenses.repository";
import {
  getRecurringExpenseOccurrenceDates,
  recurringExpenseFrequencies,
} from "@/backend/services/recurring-expense-schedule";

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

const expenseSchema = z.object({
  description: z.string().trim().min(1).max(120),
  category: z.string().trim().max(80).nullable().optional(),
  amount: amountSchema,
  frequency: z.enum(recurringExpenseFrequencies),
  firstDueDate: dateSchema,
  essential: z.boolean().default(false),
});

const updateSchema = expenseSchema.extend({
  id: z.string().uuid(),
  active: z.boolean().optional(),
});

const realizedSchema = z.object({
  recurringExpenseId: z.string().uuid(),
  dueDate: dateSchema,
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

function asExpenseInput(input: z.infer<typeof expenseSchema>) {
  const firstDueDate = validateIsoDate(input.firstDueDate);
  return {
    description: input.description,
    category: input.category || null,
    amount: amountString(input.amount),
    frequency: input.frequency,
    firstDueDate: firstDueDate.toISOString().slice(0, 10),
    essential: input.essential,
  };
}

export class RecurringExpensesService {
  async getMonthlyOverview(monthValue: string | null | undefined) {
    const month = parseMonth(monthValue);
    const [expenses, savedOccurrences] = await Promise.all([
      recurringExpensesRepository.listExpenses(),
      recurringExpensesRepository.listOccurrencesForMonth(
        month.startDate,
        month.endDate,
      ),
    ]);
    const historicalOccurrences =
      await recurringExpensesRepository.listLatestRealizedBeforeDate(
        expenses.map((expense) => expense.id),
        month.startDate,
      );
    const savedByKey = new Map(
      savedOccurrences.map((occurrence) => [
        `${occurrence.recurringExpenseId}:${occurrence.dueDate}`,
        occurrence,
      ]),
    );
    const occurrenceKeys = new Set<string>();
    const occurrences = [];

    for (const expense of expenses) {
      const dates = expense.active
        ? getRecurringExpenseOccurrenceDates(
            expense.firstDueDate,
            expense.frequency,
            month.year,
            month.month,
          )
        : [];
      for (const dueDate of dates) {
        const key = `${expense.id}:${dueDate}`;
        occurrenceKeys.add(key);
        const saved = savedByKey.get(key);
        occurrences.push({
          id: key,
          recurringExpenseId: expense.id,
          description: expense.description,
          category: expense.category,
          essential: expense.essential,
          dueDate,
          expectedAmount: saved?.expectedAmount ?? expense.amount,
          actualAmount: saved?.actualAmount ?? null,
          status: saved?.realizedAt
            ? ("realized" as const)
            : ("planned" as const),
        });
      }
    }

    for (const saved of savedOccurrences) {
      const key = `${saved.recurringExpenseId}:${saved.dueDate}`;
      if (occurrenceKeys.has(key)) continue;
      const expense = expenses.find(
        (candidate) => candidate.id === saved.recurringExpenseId,
      );
      if (!expense || !saved.realizedAt || !saved.actualAmount) continue;
      occurrences.push({
        id: key,
        recurringExpenseId: expense.id,
        description: expense.description,
        category: expense.category,
        essential: expense.essential,
        dueDate: saved.dueDate,
        expectedAmount: saved.expectedAmount,
        actualAmount: saved.actualAmount,
        status: "realized" as const,
      });
    }

    const latestHistoryByExpense = new Map(
      historicalOccurrences.map((occurrence) => [
        occurrence.recurringExpenseId,
        occurrence,
      ]),
    );
    const occurrencesWithHistory = occurrences.map((occurrence) => {
      const previousWithinMonth = savedOccurrences
        .filter(
          (saved) =>
            saved.recurringExpenseId === occurrence.recurringExpenseId &&
            saved.dueDate < occurrence.dueDate &&
            saved.actualAmount !== null &&
            saved.realizedAt !== null,
        )
        .sort((left, right) => right.dueDate.localeCompare(left.dueDate))[0];
      const previous =
        previousWithinMonth ??
        latestHistoryByExpense.get(occurrence.recurringExpenseId);
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
      expenses,
      occurrences: occurrencesWithHistory,
    };
  }

  async create(body: unknown) {
    const parsed = expenseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError("Revise os dados da despesa recorrente.", 400);
    }
    validateIsoDate(parsed.data.firstDueDate);
    return recurringExpensesRepository.createExpense(
      asExpenseInput(parsed.data),
    );
  }

  async update(body: unknown) {
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError("Revise os dados da despesa recorrente.", 400);
    }
    validateIsoDate(parsed.data.firstDueDate);
    const current = await recurringExpensesRepository.findExpense(
      parsed.data.id,
    );
    if (!current) throw new ApplicationError("Despesa não encontrada.", 404);
    return recurringExpensesRepository.updateExpense(parsed.data.id, {
      ...asExpenseInput(parsed.data),
      active: parsed.data.active ?? current.active,
    });
  }

  async setRealized(body: unknown, now = new Date()) {
    const parsed = realizedSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError("Revise o valor realizado e a data.", 400);
    }
    validateIsoDate(parsed.data.dueDate);
    const expense = await recurringExpensesRepository.findExpense(
      parsed.data.recurringExpenseId,
    );
    if (!expense) throw new ApplicationError("Despesa não encontrada.", 404);
    const [year, month] = parsed.data.dueDate.split("-").map(Number);
    const occurrenceDates = getRecurringExpenseOccurrenceDates(
      expense.firstDueDate,
      expense.frequency,
      year,
      month - 1,
    );
    if (!occurrenceDates.includes(parsed.data.dueDate)) {
      throw new ApplicationError(
        "A data informada não corresponde a uma ocorrência desta despesa.",
        400,
      );
    }
    return recurringExpensesRepository.setRealized({
      recurringExpenseId: expense.id,
      dueDate: parsed.data.dueDate,
      expectedAmount: expense.amount,
      actualAmount: amountString(parsed.data.actualAmount),
      realizedAt: now,
    });
  }
}

export const recurringExpensesService = new RecurringExpensesService();
