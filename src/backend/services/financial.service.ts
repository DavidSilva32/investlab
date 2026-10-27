import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  financialRepository,
  type FinancialEntryInput as RepositoryFinancialEntryInput,
} from "@/backend/repositories/financial.repository";
import { financialRecurrencesRepository } from "@/backend/repositories/financial-recurrences.repository";
import {
  financialCategoryCreateSchema,
  financialCategoryUpdateSchema,
  financialEntryCreateSchema,
  financialEntryUpdateSchema,
} from "@/backend/schemas/financial.schema";
import {
  getFinancialRecurrenceDates,
  isProjectionMonth,
} from "@/backend/services/financial-recurrence-schedule";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function validateIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new ApplicationError("Informe uma data válida.", 400);
  return value;
}

function parseMonth(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    throw new ApplicationError("Informe o mês no formato AAAA-MM.", 400);
  }
  const [year, month] = value.split("-").map(Number);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    year < 1900 ||
    year > 9998 ||
    month < 1 ||
    month > 12
  ) {
    throw new ApplicationError("Informe um mês válido.", 400);
  }
  const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const index = year * 12 + month - 1;
  const historyStartIndex = index - 11;
  const historyStartYear = Math.floor(historyStartIndex / 12);
  const historyStartMonth = ((historyStartIndex % 12) + 12) % 12;
  const historyStart = new Date(
    Date.UTC(historyStartYear, historyStartMonth, 1),
  );
  return {
    year,
    monthIndex: month - 1,
    startDate: `${value}-01`,
    endDate,
    historyStartDate: historyStart.toISOString().slice(0, 10),
  };
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    startDate: `${month}-01`,
    endDate: new Date(Date.UTC(year, monthNumber, 0))
      .toISOString()
      .slice(0, 10),
  };
}

function monthKeysThrough(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastIndex = year * 12 + monthNumber - 1;
  return Array.from({ length: 12 }, (_, offset) => {
    const index = lastIndex - 11 + offset;
    const targetYear = Math.floor(index / 12);
    const targetMonth = (((index % 12) + 12) % 12) + 1;
    return `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
  });
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function parseCents(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
}

function formatCents(value: bigint) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

function sumAmounts(values: Array<string | null | undefined>) {
  const amounts = values.filter(
    (value): value is string => value !== null && value !== undefined,
  );
  if (amounts.length === 0) return null;
  return formatCents(
    amounts.reduce((total, value) => total + parseCents(value), 0n),
  );
}

function difference(left: string | null, right: string | null) {
  if (left === null || right === null) return null;
  return formatCents(parseCents(left) - parseCents(right));
}

function isWithin(value: string | null, startDate: string, endDate: string) {
  return value !== null && value >= startDate && value <= endDate;
}

function amountDateInput(
  input: z.infer<typeof financialEntryCreateSchema>,
): RepositoryFinancialEntryInput {
  const expectedDate = input.expectedDate ?? null;
  const actualDate = input.actualDate ?? null;
  return {
    kind: input.kind,
    description: input.description,
    categoryId: input.categoryId,
    expectedAmount: input.expectedAmount?.toFixed(2) ?? null,
    expectedDate: expectedDate ? validateIsoDate(expectedDate) : null,
    actualAmount: input.actualAmount?.toFixed(2) ?? null,
    actualDate: actualDate ? validateIsoDate(actualDate) : null,
  };
}

function assertSchema<T>(
  schema: z.ZodType<T>,
  input: unknown,
  message: string,
) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ApplicationError(message, 400);
  return parsed.data;
}

export class FinancialService {
  async listCategories() {
    return financialRepository.listCategories();
  }

  async createCategory(body: unknown) {
    const input = assertSchema(
      financialCategoryCreateSchema,
      body,
      "Revise os dados da categoria.",
    );
    const duplicate = (await financialRepository.listCategories()).some(
      (category) =>
        category.kind === input.kind &&
        normalizeName(category.name) === normalizeName(input.name),
    );
    if (duplicate) {
      throw new ApplicationError("Já existe uma categoria com esse nome.", 409);
    }
    return financialRepository.createCategory(input);
  }

  async updateCategory(body: unknown) {
    const input = assertSchema(
      financialCategoryUpdateSchema,
      body,
      "Revise os dados da categoria.",
    );
    const current = await financialRepository.findCategory(input.id);
    if (!current) throw new ApplicationError("Categoria não encontrada.", 404);
    const name = input.name ?? current.name;
    const duplicate = (await financialRepository.listCategories()).some(
      (category) =>
        category.id !== current.id &&
        category.kind === current.kind &&
        normalizeName(category.name) === normalizeName(name),
    );
    if (input.name !== undefined && duplicate) {
      throw new ApplicationError("Já existe uma categoria com esse nome.", 409);
    }
    const active = input.active ?? current.active;
    if (current.isDefault) {
      return financialRepository.saveDefaultCategoryPreference(current.id, {
        nameOverride: name === current.originalName ? null : name,
        active,
      });
    }
    if (current.userId === null) {
      throw new ApplicationError(
        "Não foi possível atualizar a categoria.",
        500,
      );
    }
    if (input.name !== undefined) {
      await financialRepository.updateOwnedCategory(current.id, {
        kind: current.kind,
        name,
      });
    }
    if (input.active !== undefined) {
      await financialRepository.setOwnedCategoryActive(current.id, active);
    }
    return (await financialRepository.findCategory(current.id)) ?? null;
  }

  async deleteCategory(id: string | null) {
    if (!id || !z.string().uuid().safeParse(id).success) {
      throw new ApplicationError("Informe uma categoria válida.", 400);
    }
    return this.updateCategory({ id, active: false });
  }

  async listEntries(monthValue: string | null | undefined) {
    parseMonth(monthValue);
    const range = monthRange(monthValue!);
    const rows = await financialRepository.listEntries(
      range.startDate,
      range.endDate,
    );
    return {
      month: monthValue,
      entries: rows,
    };
  }

  async createEntry(body: unknown) {
    const parsed = assertSchema(
      financialEntryCreateSchema,
      body,
      "Revise os dados do lançamento.",
    );
    const category = await financialRepository.findCategory(parsed.categoryId);
    if (!category) throw new ApplicationError("Categoria não encontrada.", 404);
    if (!category.active) {
      throw new ApplicationError("A categoria está desativada.", 400);
    }
    if (category.kind !== parsed.kind) {
      throw new ApplicationError(
        "A categoria não corresponde ao tipo do lançamento.",
        400,
      );
    }
    return financialRepository.createEntry(amountDateInput(parsed));
  }

  async updateEntry(body: unknown) {
    const parsed = assertSchema(
      financialEntryUpdateSchema,
      body,
      "Revise os dados do lançamento.",
    );
    const current = await financialRepository.findEntry(parsed.id);
    if (!current) throw new ApplicationError("Lançamento não encontrado.", 404);
    const category = await financialRepository.findCategory(parsed.categoryId);
    if (!category) throw new ApplicationError("Categoria não encontrada.", 404);
    if (!category.active && category.id !== current.categoryId) {
      throw new ApplicationError("A categoria está desativada.", 400);
    }
    if (category.kind !== parsed.kind) {
      throw new ApplicationError(
        "A categoria não corresponde ao tipo do lançamento.",
        400,
      );
    }
    const updated = await financialRepository.updateEntry(
      parsed.id,
      amountDateInput(parsed),
    );
    if (!updated) throw new ApplicationError("Lançamento não encontrado.", 404);
    return updated;
  }

  async deleteEntry(id: string | null) {
    if (!id || !z.string().uuid().safeParse(id).success) {
      throw new ApplicationError("Informe um lançamento válido.", 400);
    }
    const deleted = await financialRepository.deleteEntry(id);
    if (!deleted) throw new ApplicationError("Lançamento não encontrado.", 404);
    return deleted;
  }

  async getMonthlyOverview(monthValue: string | null | undefined) {
    const month = parseMonth(monthValue);
    const historyEndDate = month.endDate;
    const [entries, recurrences, savedOccurrences, categories] =
      await Promise.all([
        financialRepository.listEntries(month.historyStartDate, historyEndDate),
        financialRecurrencesRepository.listRecurrences(),
        financialRecurrencesRepository.listOccurrencesForFinancialPeriod(
          month.historyStartDate,
          historyEndDate,
        ),
        financialRepository.listCategories(),
      ]);
    const currentRange = { startDate: month.startDate, endDate: month.endDate };
    const occurrenceByKey = new Map(
      savedOccurrences.map((occurrence) => [
        `${occurrence.recurrenceId}:${occurrence.dueDate}`,
        occurrence,
      ]),
    );
    const occurrenceDetails = new Map(
      recurrences.map((recurrence) => [recurrence.id, recurrence]),
    );
    const knownSavedOccurrences = savedOccurrences.filter((occurrence) =>
      occurrenceDetails.has(occurrence.recurrenceId),
    );
    const monthlyOccurrences = new Map<
      string,
      {
        id: string;
        recurrenceId: string;
        description: string;
        category: string | null;
        kind: "INCOME" | "EXPENSE";
        essential: boolean;
        dueDate: string;
        expectedAmount: string | null;
        actualAmount: string | null;
        actualDate: string | null;
      }
    >();

    for (const recurrence of recurrences) {
      if (!recurrence.active) continue;
      if (!isProjectionMonth(monthValue!)) continue;
      const dates = getFinancialRecurrenceDates(
        recurrence.firstDueDate,
        recurrence.frequency,
        month.year,
        month.monthIndex,
      );
      for (const dueDate of dates) {
        const key = `${recurrence.id}:${dueDate}`;
        const saved = occurrenceByKey.get(key);
        monthlyOccurrences.set(key, {
          id: key,
          recurrenceId: recurrence.id,
          description: recurrence.description,
          category: recurrence.category,
          kind: recurrence.kind as "INCOME" | "EXPENSE",
          essential: recurrence.essential,
          dueDate,
          expectedAmount: saved?.expectedAmount ?? recurrence.amount,
          actualAmount: saved?.actualAmount ?? null,
          actualDate: saved?.actualDate ?? null,
        });
      }
    }

    for (const saved of savedOccurrences) {
      const recurrence = occurrenceDetails.get(saved.recurrenceId);
      if (!recurrence) continue;
      if (
        isWithin(saved.dueDate, currentRange.startDate, currentRange.endDate) ||
        isWithin(saved.actualDate, currentRange.startDate, currentRange.endDate)
      ) {
        const key = `${saved.recurrenceId}:${saved.dueDate}`;
        monthlyOccurrences.set(key, {
          id: key,
          recurrenceId: recurrence.id,
          description: recurrence.description,
          category: recurrence.category,
          kind: recurrence.kind as "INCOME" | "EXPENSE",
          essential: recurrence.essential,
          dueDate: saved.dueDate,
          expectedAmount: saved.expectedAmount,
          actualAmount: saved.actualAmount,
          actualDate: saved.actualDate,
        });
      }
    }

    const currentEntries = entries.filter(
      (entry) =>
        isWithin(
          entry.expectedDate,
          currentRange.startDate,
          currentRange.endDate,
        ) ||
        isWithin(
          entry.actualDate,
          currentRange.startDate,
          currentRange.endDate,
        ),
    );
    const history = monthKeysThrough(monthValue!).map((historyMonth) => {
      const range = monthRange(historyMonth);
      const expectedEntries = entries.filter((entry) =>
        isWithin(entry.expectedDate, range.startDate, range.endDate),
      );
      const actualEntries = entries.filter((entry) =>
        isWithin(entry.actualDate, range.startDate, range.endDate),
      );
      const dueOccurrences = knownSavedOccurrences.filter((occurrence) =>
        isWithin(occurrence.dueDate, range.startDate, range.endDate),
      );
      const actualOccurrences = knownSavedOccurrences.filter((occurrence) =>
        isWithin(occurrence.actualDate, range.startDate, range.endDate),
      );
      const expectedIncomeOccurrences = dueOccurrences.filter(
        (occurrence) =>
          occurrenceDetails.get(occurrence.recurrenceId)?.kind === "INCOME",
      );
      const realizedIncomeOccurrences = actualOccurrences.filter(
        (occurrence) =>
          occurrenceDetails.get(occurrence.recurrenceId)?.kind === "INCOME",
      );
      const expectedExpenseOccurrences = dueOccurrences.filter(
        (occurrence) =>
          occurrenceDetails.get(occurrence.recurrenceId)?.kind === "EXPENSE",
      );
      const realizedExpenseOccurrences = actualOccurrences.filter(
        (occurrence) =>
          occurrenceDetails.get(occurrence.recurrenceId)?.kind === "EXPENSE",
      );
      const expectedIncome = sumAmounts([
        ...expectedEntries
          .filter((entry) => entry.kind === "INCOME")
          .map((entry) => entry.expectedAmount),
        ...expectedIncomeOccurrences.map(
          (occurrence) => occurrence.expectedAmount,
        ),
      ]);
      const realizedIncome = sumAmounts([
        ...actualEntries
          .filter((entry) => entry.kind === "INCOME")
          .map((entry) => entry.actualAmount),
        ...realizedIncomeOccurrences.map(
          (occurrence) => occurrence.actualAmount,
        ),
      ]);
      const expectedExpenses = sumAmounts([
        ...expectedEntries
          .filter((entry) => entry.kind === "EXPENSE")
          .map((entry) => entry.expectedAmount),
        ...expectedExpenseOccurrences.map(
          (occurrence) => occurrence.expectedAmount,
        ),
      ]);
      const realizedExpenses = sumAmounts([
        ...actualEntries
          .filter((entry) => entry.kind === "EXPENSE")
          .map((entry) => entry.actualAmount),
        ...realizedExpenseOccurrences.map(
          (occurrence) => occurrence.actualAmount,
        ),
      ]);
      return {
        month: historyMonth,
        expectedIncome,
        realizedIncome,
        expectedExpenses,
        realizedExpenses,
        recordedBalance: difference(realizedIncome, realizedExpenses),
        expectedRecordCount: expectedEntries.length + dueOccurrences.length,
        actualRecordCount: actualEntries.length + actualOccurrences.length,
        undatedRecurringRealizations: dueOccurrences.filter(
          (occurrence) =>
            occurrence.actualAmount !== null && occurrence.actualDate === null,
        ).length,
        completeness: "recorded_only" as const,
      };
    });

    const expectedEntries = currentEntries.filter((entry) =>
      isWithin(
        entry.expectedDate,
        currentRange.startDate,
        currentRange.endDate,
      ),
    );
    const actualEntries = currentEntries.filter((entry) =>
      isWithin(entry.actualDate, currentRange.startDate, currentRange.endDate),
    );
    const expectedOccurrences = [...monthlyOccurrences.values()].filter(
      (occurrence) =>
        isWithin(
          occurrence.dueDate,
          currentRange.startDate,
          currentRange.endDate,
        ),
    );
    const actualOccurrences = [...monthlyOccurrences.values()].filter(
      (occurrence) =>
        isWithin(
          occurrence.actualDate,
          currentRange.startDate,
          currentRange.endDate,
        ),
    );
    const expectedExpenses = sumAmounts([
      ...expectedEntries
        .filter((entry) => entry.kind === "EXPENSE")
        .map((entry) => entry.expectedAmount),
      ...expectedOccurrences
        .filter((occurrence) => occurrence.kind === "EXPENSE")
        .map((occurrence) => occurrence.expectedAmount),
    ]);
    const expectedIncomeWithRecurrences = sumAmounts([
      ...expectedEntries
        .filter((entry) => entry.kind === "INCOME")
        .map((entry) => entry.expectedAmount),
      ...expectedOccurrences
        .filter((occurrence) => occurrence.kind === "INCOME")
        .map((occurrence) => occurrence.expectedAmount),
    ]);
    const realizedIncomeWithRecurrences = sumAmounts([
      ...actualEntries
        .filter((entry) => entry.kind === "INCOME")
        .map((entry) => entry.actualAmount),
      ...actualOccurrences
        .filter((occurrence) => occurrence.kind === "INCOME")
        .map((occurrence) => occurrence.actualAmount),
    ]);
    const realizedExpenses = sumAmounts([
      ...actualEntries
        .filter((entry) => entry.kind === "EXPENSE")
        .map((entry) => entry.actualAmount),
      ...actualOccurrences
        .filter((occurrence) => occurrence.kind === "EXPENSE")
        .map((occurrence) => occurrence.actualAmount),
    ]);
    const expectedIncome = expectedIncomeWithRecurrences;
    const realizedIncome = realizedIncomeWithRecurrences;
    const hasAnyData = [
      expectedIncome,
      realizedIncome,
      expectedExpenses,
      realizedExpenses,
    ].some((value) => value !== null);
    const undatedRecurringRealizations = knownSavedOccurrences.filter(
      (occurrence) =>
        isWithin(
          occurrence.dueDate,
          currentRange.startDate,
          currentRange.endDate,
        ) &&
        occurrence.actualAmount !== null &&
        occurrence.actualDate === null,
    ).length;

    return {
      month: monthValue,
      summary: {
        expectedIncome,
        realizedIncome,
        expectedExpenses,
        realizedExpenses,
        expectedBalance: difference(expectedIncome, expectedExpenses),
        recordedBalance: difference(realizedIncome, realizedExpenses),
        undatedRecurringRealizations,
        completeness: hasAnyData
          ? ("recorded_only" as const)
          : ("no_data" as const),
      },
      entries: currentEntries,
      recurringOccurrences: [...monthlyOccurrences.values()].sort(
        (left, right) => left.dueDate.localeCompare(right.dueDate),
      ),
      history: {
        months: history,
        completeness: "recorded_only" as const,
        explanation:
          "Os totais dos meses anteriores usam somente registros e ocorrências salvos; as configurações atuais de recorrência não são projetadas para trás. As recorrências geram previsão apenas no mês selecionado atual ou futuro. Realizações sem data realizada ficam fora do total mensal até que essa data seja informada. Meses sem registros permanecem sem valor e não são tratados como zero nem como períodos completos.",
      },
      categories,
    };
  }
}

export const financialService = new FinancialService();
