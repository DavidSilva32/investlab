import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  financialRepository,
  type FinancialEntryRecurrenceInput as RepositoryFinancialEntryRecurrenceInput,
  type FinancialEntryInput as RepositoryFinancialEntryInput,
} from "@/backend/repositories/financial.repository";
import { financialRecurrencesRepository } from "@/backend/repositories/financial-recurrences.repository";
import {
  financialMonthCloseRepository,
  type FinancialCloseTotals,
} from "@/backend/repositories/financial-month-close.repository";
import {
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

function currentFinancialMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
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

function parseCents(value: string) {
  const [whole, fraction = ""] = value.split(".");
  const sign = whole.startsWith("-") ? -1n : 1n;
  const absoluteWhole = whole.startsWith("-") ? whole.slice(1) : whole;
  const absoluteCents =
    BigInt(absoluteWhole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  return sign * absoluteCents;
}

function formatCents(value: bigint) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

const capacityCentsSchema = z.string().regex(/^(?:0|[1-9]\d{0,13})$/);
const capacitySimulationSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    incomeCents: capacityCentsSchema.optional(),
    expenseCents: capacityCentsSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.incomeCents === undefined) !==
      (value.expenseCents === undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe renda e despesas juntas.",
      });
    }
  });
const financialMonthCloseSchema = z
  .object({ month: z.string().regex(/^\d{4}-\d{2}$/) })
  .strict();

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
    recurrenceId: input.recurrenceId ?? null,
    expectedAmount: input.expectedAmount?.toFixed(2) ?? null,
    expectedDate: expectedDate ? validateIsoDate(expectedDate) : null,
    actualAmount: input.actualAmount?.toFixed(2) ?? null,
    actualDate: actualDate ? validateIsoDate(actualDate) : null,
  };
}

function recurrenceInput(
  input: z.infer<typeof financialEntryCreateSchema> & {
    recurrence: NonNullable<
      z.infer<typeof financialEntryCreateSchema>["recurrence"]
    >;
  },
): RepositoryFinancialEntryRecurrenceInput {
  const recurrence = input.recurrence;
  if (input.kind === "INCOME" && recurrence.essential) {
    throw new ApplicationError(
      "Receitas recorrentes não podem ser marcadas como essenciais.",
      400,
    );
  }
  // financialEntryCreateSchema requires at least one amount before this helper runs.
  const amount = (input.expectedAmount ?? input.actualAmount)!;
  const firstDueDate = validateIsoDate(recurrence.firstDueDate);
  const latestEntryDate = [input.expectedDate, input.actualDate]
    .filter((date): date is string => date !== null && date !== undefined)
    .sort()
    .at(-1);
  if (latestEntryDate && firstDueDate <= latestEntryDate) {
    throw new ApplicationError(
      "A primeira ocorrência precisa ser posterior às datas do lançamento.",
      400,
    );
  }
  return {
    amount: amount.toFixed(2),
    categoryId: input.categoryId,
    description: input.description.trim(),
    essential: recurrence.essential,
    firstDueDate,
    frequency: recurrence.frequency,
    kind: input.kind,
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
    if (parsed.recurrence) {
      if (parsed.recurrenceId) {
        throw new ApplicationError(
          "O lançamento já está vinculado a uma recorrência.",
          409,
        );
      }
      return financialRepository.saveEntryWithRecurrence(
        null,
        amountDateInput(parsed),
        recurrenceInput({ ...parsed, recurrence: parsed.recurrence }),
      );
    }
    await this.assertRecurrenceLink(
      parsed.recurrenceId,
      parsed.kind,
      parsed.categoryId,
    );
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
    if (parsed.recurrence) {
      if (parsed.recurrenceId || current.recurrenceId) {
        throw new ApplicationError(
          "O lançamento já está vinculado a uma recorrência.",
          409,
        );
      }
      return financialRepository.saveEntryWithRecurrence(
        parsed.id,
        amountDateInput(parsed),
        recurrenceInput({ ...parsed, recurrence: parsed.recurrence }),
      );
    }
    await this.assertRecurrenceLink(
      parsed.recurrenceId,
      parsed.kind,
      parsed.categoryId,
    );
    const updated = await financialRepository.updateEntry(
      parsed.id,
      amountDateInput(parsed),
    );
    if (!updated) throw new ApplicationError("Lançamento não encontrado.", 404);
    return updated;
  }

  private async assertRecurrenceLink(
    recurrenceId: string | null | undefined,
    kind: string,
    categoryId: string,
  ) {
    if (recurrenceId == null) return;
    const recurrence =
      await financialRecurrencesRepository.findRecurrence(recurrenceId);
    if (!recurrence)
      throw new ApplicationError("Recorrência não encontrada.", 404);
    if (recurrence.kind !== kind || recurrence.categoryId !== categoryId) {
      throw new ApplicationError(
        "O tipo e a categoria do lançamento devem corresponder à recorrência.",
        400,
      );
    }
  }

  async deleteEntry(id: string | null) {
    if (!id || !z.string().uuid().safeParse(id).success) {
      throw new ApplicationError("Informe um lançamento válido.", 400);
    }
    const deleted = await financialRepository.deleteEntry(id);
    if (!deleted) throw new ApplicationError("Lançamento não encontrado.", 404);
    return deleted;
  }

  async simulateMonthlyCapacity(body: unknown) {
    const parsed = capacitySimulationSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError(
        "Informe um mês atual ou futuro e valores válidos de renda e despesas.",
        400,
      );
    }
    const { month } = parsed.data;
    parseMonth(month);
    if (!isProjectionMonth(month)) {
      throw new ApplicationError(
        "A simulação está disponível apenas para o mês atual ou futuro.",
        400,
      );
    }

    const overview = await this.getMonthlyOverview(month);
    const currentRange = monthRange(month);
    const actualOnlyAmounts =
      month === currentFinancialMonth()
        ? overview.entries.reduce(
            (amounts, entry) => {
              if (
                (entry.kind !== "INCOME" && entry.kind !== "EXPENSE") ||
                entry.expectedAmount !== null ||
                entry.actualAmount === null ||
                !isWithin(
                  entry.actualDate,
                  currentRange.startDate,
                  currentRange.endDate,
                )
              ) {
                return amounts;
              }
              const actualCents = parseCents(entry.actualAmount);
              amounts[entry.kind] += actualCents;
              return amounts;
            },
            { INCOME: 0n, EXPENSE: 0n },
          )
        : { INCOME: 0n, EXPENSE: 0n };
    const addActualOnly = (expected: string | null, actualOnly: bigint) =>
      expected === null ? null : (parseCents(expected) + actualOnly).toString();
    const baselineIncomeCents = addActualOnly(
      overview.summary.expectedIncome,
      actualOnlyAmounts.INCOME,
    );
    const baselineExpenseCents = addActualOnly(
      overview.summary.expectedExpenses,
      actualOnlyAmounts.EXPENSE,
    );
    const baseBalanceInCents =
      baselineIncomeCents === null || baselineExpenseCents === null
        ? null
        : (
            BigInt(baselineIncomeCents) - BigInt(baselineExpenseCents)
          ).toString();
    const incomeCents = parsed.data.incomeCents ?? null;
    const expenseCents = parsed.data.expenseCents ?? null;
    const simulatedBalanceCents =
      incomeCents === null || expenseCents === null
        ? null
        : (BigInt(incomeCents) - BigInt(expenseCents)).toString();

    return {
      month,
      baselineIncomeCents,
      baselineExpenseCents,
      baseBalanceCents: baseBalanceInCents,
      incomeCents,
      expenseCents,
      simulatedBalanceCents,
      status:
        simulatedBalanceCents === null
          ? "unavailable"
          : BigInt(simulatedBalanceCents) > 0n
            ? "positive"
            : BigInt(simulatedBalanceCents) < 0n
              ? "negative"
              : "zero",
      completeness: overview.summary.completeness,
      canSimulateStrategy:
        incomeCents !== null &&
        expenseCents !== null &&
        simulatedBalanceCents !== null &&
        BigInt(simulatedBalanceCents) > 0n,
    } as const;
  }

  async getMonthlyOverview(monthValue: string | null | undefined) {
    const month = parseMonth(monthValue);
    const historyEndDate = month.endDate;
    const [loadedEntries, recurrences, savedOccurrences, categories, close] =
      await Promise.all([
        financialRepository.listEntries(month.historyStartDate, historyEndDate),
        financialRecurrencesRepository.listRecurrences(),
        financialRecurrencesRepository.listOccurrencesForFinancialPeriod(
          month.historyStartDate,
          historyEndDate,
        ),
        financialRepository.listCategories(),
        financialMonthCloseRepository.getCurrent(monthValue!),
      ]);
    const entries = loadedEntries.filter((entry) => entry.channel !== "CARD");
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
      const expectedIncomeOccurrences = dueOccurrences.filter(
        (occurrence) =>
          occurrenceDetails.get(occurrence.recurrenceId)?.kind === "INCOME",
      );
      const expectedExpenseOccurrences = dueOccurrences.filter(
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
      ]);
      const expectedExpenses = sumAmounts([
        ...expectedEntries
          .filter((entry) => entry.kind === "EXPENSE")
          .map((entry) => entry.expectedAmount),
        ...expectedExpenseOccurrences.map(
          (occurrence) => occurrence.expectedAmount,
        ),
      ]);
      const spendEntries = actualEntries.filter(
        (entry) => entry.kind === "EXPENSE",
      );
      const realizedExpenses = sumAmounts(
        spendEntries.map((entry) => entry.actualAmount),
      );
      return {
        month: historyMonth,
        expectedIncome,
        realizedIncome,
        expectedExpenses,
        realizedExpenses,
        recordedBalance: difference(realizedIncome, realizedExpenses),
        expectedRecordCount: expectedEntries.length + dueOccurrences.length,
        actualRecordCount: actualEntries.length,
        undatedRecurringRealizations: 0,
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
    ]);
    const spendEntries = actualEntries.filter(
      (entry) => entry.kind === "EXPENSE",
    );
    const realizedExpenses = sumAmounts(
      spendEntries.map((entry) => entry.actualAmount),
    );
    const expectedIncome = expectedIncomeWithRecurrences;
    const realizedIncome = realizedIncomeWithRecurrences;
    const hasAnyData = [
      expectedIncome,
      realizedIncome,
      expectedExpenses,
      realizedExpenses,
    ].some((value) => value !== null);
    const undatedRecurringRealizations = 0;

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
      close,
      entries: currentEntries,
      history: {
        months: history,
        completeness: "recorded_only" as const,
        explanation:
          "Os valores realizados consideram apenas lançamentos manuais ou importados. Ocorrências antigas de recorrência são preservadas, mas não contam como realizações. As configurações atuais de recorrência entram apenas nas previsões do mês selecionado atual ou futuro. Meses sem registros permanecem sem valor e não são tratados como zero nem como períodos completos.",
      },
      categories,
    };
  }

  async closeMonth(body: unknown) {
    const parsed = financialMonthCloseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError("Informe um mês válido para fechar.", 400);
    }
    parseMonth(parsed.data.month);
    const currentMonth = currentFinancialMonth();
    if (parsed.data.month > currentMonth) {
      throw new ApplicationError(
        "Só é possível fechar um mês atual ou anterior.",
        400,
      );
    }
    const close = await financialMonthCloseRepository.closeMonth(
      parsed.data.month,
      async (): Promise<FinancialCloseTotals> => {
        const overview = await this.getMonthlyOverview(parsed.data.month);
        return overview.summary;
      },
    );
    return { month: parsed.data.month, close };
  }
}

export const financialService = new FinancialService();
