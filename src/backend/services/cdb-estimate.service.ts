import { cdbRateRepository } from "@/backend/repositories/cdb-rate.repository";
import { bcbCdiService } from "@/backend/services/bcb-cdi.service";
import { estimatePostFixedCdb } from "@/backend/services/cdb-cdi-estimator";
import { logger } from "@/infrastructure/logging/logger";

const todayInSaoPaulo = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
const isDiCdb = (position: {
  product: string;
  assetCode: string | null;
  indexer: string | null;
}) =>
  Boolean(
    position.assetCode &&
    /^CDB\b/i.test(position.product) &&
    /^(DI|CDI)$/i.test(position.indexer ?? ""),
  );

type CachedCdiRate = {
  rateDate: string;
  annualRate: string;
  fetchedAt: Date;
};

const sortRates = <T extends { rateDate: string }>(rates: T[]) =>
  [...rates].sort((left, right) => left.rateDate.localeCompare(right.rateDate));

export type CdbEstimateStatus = "complete" | "provisional" | "unavailable";

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const isWeekday = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day > 0 && day < 6;
};

const easterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const isBrazilCdiHoliday = (date: string) => {
  const year = Number(date.slice(0, 4));
  const easter = easterSunday(year);
  const movable = new Set([
    addDays(easter, -48), // Carnival Monday
    addDays(easter, -47), // Carnival Tuesday
    addDays(easter, -2), // Good Friday
    addDays(easter, 60), // Corpus Christi
  ]);
  const fixed = new Set([
    `${year}-01-01`,
    `${year}-01-25`, // São Paulo market holiday
    `${year}-04-21`,
    `${year}-05-01`,
    `${year}-07-09`, // São Paulo market holiday
    `${year}-09-07`,
    `${year}-10-12`,
    `${year}-11-02`,
    `${year}-11-15`,
    `${year}-11-20`,
    `${year}-12-25`,
  ]);
  return fixed.has(date) || movable.has(date);
};

const expectedRateDates = (fromDate: string, toDateExclusive: string) => {
  const dates: string[] = [];
  for (let date = fromDate; date < toDateExclusive; date = addDays(date, 1)) {
    if (isWeekday(date) && !isBrazilCdiHoliday(date)) dates.push(date);
  }
  return dates;
};

const getTrustedRatePrefix = (
  baseDate: string,
  valuationDate: string,
  rates: CachedCdiRate[],
) => {
  const ratesByDate = new Map(rates.map((rate) => [rate.rateDate, rate]));
  const expectedDates = expectedRateDates(addDays(baseDate, 1), valuationDate);
  const prefix: CachedCdiRate[] = [];
  for (const date of expectedDates) {
    const rate = ratesByDate.get(date);
    if (!rate) return { rates: prefix, missingDate: date };
    prefix.push(rate);
  }
  return { rates: prefix, missingDate: null };
};

const logUnavailable = (phase: "configuration" | "rates" | "cache") =>
  logger.warn("cdb_estimates_unavailable", { phase });

const markUnavailable = <
  T extends Parameters<typeof isDiCdb>[0] & {
    totalValue: string | null;
  },
>(
  position: T,
  cdiPercentage: string | null,
  limitation: string,
) => ({
  ...position,
  cdiPercentage,
  estimatedValue: null,
  estimatedValueCents: null,
  ...(isDiCdb(position) && position.totalValue
    ? {
        cdbEstimateStatus: "unavailable" as const,
        cdbEstimateLimitation: limitation,
      }
    : {}),
});

export class CdbEstimateService {
  constructor(
    private readonly getValuationDate: () => string = todayInSaoPaulo,
  ) {}

  async enrich<
    T extends {
      product: string;
      assetCode: string | null;
      indexer: string | null;
      valuationSource?: string | null;
      totalValue: string | null;
      referenceDate?: string | null;
      estimationBaseDate?: string | null;
    },
  >(positions: T[], executionValuationDate?: string) {
    const valuationDate = executionValuationDate ?? this.getValuationDate();
    const cdbs = positions.filter(isDiCdb);
    let configurations: Array<{ assetCode: string; cdiPercentage: string }>;
    try {
      configurations = await cdbRateRepository.listConfigurations(
        cdbs.map((position) => position.assetCode!),
      );
    } catch {
      logUnavailable("configuration");
      return positions.map((position) =>
        markUnavailable(
          position,
          null,
          "Não foi possível carregar a configuração da taxa CDI.",
        ),
      );
    }

    const percentages = new Map(
      configurations.map((configuration) => [
        configuration.assetCode,
        configuration.cdiPercentage,
      ]),
    );
    const eligible = positions.filter(
      (position) =>
        isDiCdb(position) &&
        position.valuationSource === "CURVA" &&
        Boolean(percentages.get(position.assetCode!)) &&
        Boolean(position.totalValue) &&
        Boolean(position.estimationBaseDate) &&
        position.estimationBaseDate! < valuationDate,
    );
    const baseDates = [
      ...new Set(eligible.map((position) => position.estimationBaseDate!)),
    ];
    const readCanonicalRates = async () => {
      const ratesByBaseDate = new Map<string, CachedCdiRate[]>();
      await Promise.all(
        baseDates.map(async (baseDate) => {
          const rates = await cdbRateRepository.listRatesFrom(
            baseDate,
            valuationDate,
          );
          ratesByBaseDate.set(
            baseDate,
            sortRates(rates.filter((rate) => rate.rateDate > baseDate)),
          );
        }),
      );
      return ratesByBaseDate;
    };

    let cachedRatesByBaseDate: Map<string, CachedCdiRate[]>;
    try {
      cachedRatesByBaseDate = await readCanonicalRates();
    } catch {
      logUnavailable("rates");
      return positions.map((position) =>
        markUnavailable(
          position,
          position.assetCode
            ? (percentages.get(position.assetCode) ?? null)
            : null,
          "Não foi possível acessar as taxas CDI salvas.",
        ),
      );
    }

    const missingRateDates = new Set(
      baseDates.flatMap((baseDate) => {
        const cachedDates = new Set(
          cachedRatesByBaseDate.get(baseDate)!.map((rate) => rate.rateDate),
        );
        return expectedRateDates(addDays(baseDate, 1), valuationDate).filter(
          (date) => !cachedDates.has(date),
        );
      }),
    );

    if (missingRateDates.size) {
      const from = [...missingRateDates].sort()[0]!;
      try {
        const fetchedRates = await bcbCdiService.fetchRates(
          from,
          valuationDate,
        );
        const ratesToCache = Array.from(
          new Map(
            fetchedRates
              .filter(
                (rate) =>
                  rate.date < valuationDate && missingRateDates.has(rate.date),
              )
              .map((rate) => [rate.date, rate]),
          ).values(),
        );
        if (ratesToCache.length) {
          try {
            await cdbRateRepository.cacheRates(ratesToCache);
          } catch {
            logUnavailable("cache");
          }
        }
      } catch {
        logUnavailable("rates");
      }
    }

    try {
      // Always calculate from the canonical persisted set, including after a concurrent insert.
      cachedRatesByBaseDate = await readCanonicalRates();
    } catch {
      logUnavailable("rates");
      return positions.map((position) =>
        markUnavailable(
          position,
          position.assetCode
            ? (percentages.get(position.assetCode) ?? null)
            : null,
          "Não foi possível acessar as taxas CDI salvas.",
        ),
      );
    }

    return positions.map((position) => {
      const cdiPercentage = position.assetCode
        ? (percentages.get(position.assetCode) ?? null)
        : null;
      const estimationBaseDate = position.estimationBaseDate;
      if (
        !isDiCdb(position) ||
        !cdiPercentage ||
        !position.totalValue ||
        position.valuationSource !== "CURVA" ||
        !estimationBaseDate ||
        estimationBaseDate >= valuationDate
      )
        return {
          ...position,
          cdiPercentage,
          estimatedValue: null,
          estimatedValueCents: null,
          cdbEstimateStatus:
            isDiCdb(position) && position.totalValue
              ? ("unavailable" as const)
              : null,
          cdbEstimateLimitation:
            isDiCdb(position) && position.totalValue
              ? !cdiPercentage
                ? "Percentual do CDI não configurado para esta posição."
                : !estimationBaseDate
                  ? "A data-base do valor CURVA ainda não foi confirmada."
                  : position.valuationSource !== "CURVA"
                    ? "O valor selecionado não é CURVA; a estimativa CDI não foi aplicada."
                    : "A data-base CURVA precisa ser anterior à data da avaliação."
              : null,
        };

      const rates = cachedRatesByBaseDate.get(estimationBaseDate)!;
      const expectedAccrualDates = expectedRateDates(
        addDays(estimationBaseDate, 1),
        valuationDate,
      );
      const noAccrualDateAvailable = expectedAccrualDates.length === 0;
      const trustedPrefix = getTrustedRatePrefix(
        estimationBaseDate,
        valuationDate,
        rates,
      );
      const lastRateDate = trustedPrefix.rates.at(-1)?.rateDate;
      if (!noAccrualDateAvailable && trustedPrefix.rates.length === 0) {
        return {
          ...position,
          cdiPercentage,
          estimatedValue: null,
          estimatedValueCents: null,
          cdbEstimateStatus: "unavailable" as const,
          cdbEstimateLimitation: rates.length
            ? "Há lacunas nas taxas CDI do período; a estimativa não foi calculada."
            : "Não há taxas CDI oficiais persistidas para a data-base informada.",
        };
      }

      try {
        const estimate = estimatePostFixedCdb({
          officialValue: position.totalValue,
          cdiPercentage,
          rates: trustedPrefix.rates,
        });
        const incompleteDates = trustedPrefix.missingDate
          ? [trustedPrefix.missingDate]
          : [];
        return {
          ...position,
          cdiPercentage,
          ...estimate,
          estimatedThrough: lastRateDate ?? estimationBaseDate,
          cdbEstimateStatus: incompleteDates.length
            ? ("provisional" as const)
            : ("complete" as const),
          cdbEstimateComparisonApproximate: true,
          cdbEstimateLimitation: incompleteDates.length
            ? "Estimativa parcial: ainda não há taxa CDI oficial para as datas seguintes."
            : "Comparação aproximada: a última avaliação confiável disponível é anterior à data informada.",
        };
      } catch {
        logUnavailable("rates");
        return {
          ...position,
          cdiPercentage,
          estimatedValue: null,
          estimatedValueCents: null,
          cdbEstimateStatus: "unavailable" as const,
          cdbEstimateLimitation:
            "Não foi possível calcular com as taxas CDI disponíveis.",
        };
      }
    });
  }
}

export const cdbEstimateService = new CdbEstimateService();
