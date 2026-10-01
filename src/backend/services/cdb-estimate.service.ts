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

export type CdbEstimateStatus = "official" | "unavailable";

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
    `${year}-01-25`, // SÃ£o Paulo market holiday
    `${year}-04-21`,
    `${year}-05-01`,
    `${year}-07-09`, // SÃ£o Paulo market holiday
    `${year}-09-07`,
    `${year}-10-12`,
    `${year}-11-02`,
    `${year}-11-15`,
    `${year}-11-20`,
    `${year}-12-25`,
  ]);
  return fixed.has(date) || movable.has(date);
};

const previousWeekday = (date: string) => {
  let previous = addDays(date, -1);
  while (!isWeekday(previous)) previous = addDays(previous, -1);
  return previous;
};

const missingWeekdaysAfter = (lastRateDate: string, valuationDate: string) => {
  const dates: string[] = [];
  for (
    let date = addDays(lastRateDate, 1);
    date < valuationDate;
    date = addDays(date, 1)
  ) {
    if (isWeekday(date) && !isBrazilCdiHoliday(date)) dates.push(date);
  }
  return dates;
};

const logUnavailable = (phase: "configuration" | "rates" | "cache") =>
  logger.warn("cdb_estimates_unavailable", { phase });

export class CdbEstimateService {
  constructor(
    private readonly getValuationDate: () => string = todayInSaoPaulo,
  ) {}

  async enrich<
    T extends {
      product: string;
      assetCode: string | null;
      indexer: string | null;
      totalValue: string | null;
      referenceDate?: string | null;
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
      return positions.map((position) => ({
        ...position,
        cdiPercentage: null,
        estimatedValue: null,
        estimatedValueCents: null,
      }));
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
        Boolean(percentages.get(position.assetCode!)) &&
        Boolean(position.totalValue) &&
        Boolean(position.referenceDate) &&
        position.referenceDate! < valuationDate,
    );
    const baseDates = [
      ...new Set(eligible.map((position) => position.referenceDate!)),
    ];
    const readCanonicalRates = async () => {
      const ratesByBaseDate = new Map<string, CachedCdiRate[]>();
      await Promise.all(
        baseDates.map(async (baseDate) => {
          const rates = await cdbRateRepository.listRatesFrom(
            baseDate,
            valuationDate,
          );
          ratesByBaseDate.set(baseDate, sortRates(rates));
        }),
      );
      return ratesByBaseDate;
    };

    let cachedRatesByBaseDate: Map<string, CachedCdiRate[]>;
    try {
      cachedRatesByBaseDate = await readCanonicalRates();
    } catch {
      logUnavailable("rates");
      return positions.map((position) => ({
        ...position,
        cdiPercentage: position.assetCode
          ? (percentages.get(position.assetCode) ?? null)
          : null,
        estimatedValue: null,
        estimatedValueCents: null,
      }));
    }

    const missingRateDates = new Set(
      baseDates.flatMap((baseDate) => {
        const lastRateDate = cachedRatesByBaseDate
          .get(baseDate)
          ?.at(-1)?.rateDate;
        return missingWeekdaysAfter(
          lastRateDate ?? previousWeekday(baseDate),
          valuationDate,
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
      return positions.map((position) => ({
        ...position,
        cdiPercentage: position.assetCode
          ? (percentages.get(position.assetCode) ?? null)
          : null,
        estimatedValue: null,
        estimatedValueCents: null,
      }));
    }

    return positions.map((position) => {
      const cdiPercentage = position.assetCode
        ? (percentages.get(position.assetCode) ?? null)
        : null;
      const referenceDate = position.referenceDate;
      if (
        !isDiCdb(position) ||
        !cdiPercentage ||
        !position.totalValue ||
        !referenceDate ||
        referenceDate >= valuationDate
      )
        return {
          ...position,
          cdiPercentage,
          estimatedValue: null,
          estimatedValueCents: null,
          cdbEstimateStatus: null,
        };

      const rates = cachedRatesByBaseDate.get(referenceDate) ?? [];
      const missingDates = missingWeekdaysAfter(
        rates.at(-1)?.rateDate ?? previousWeekday(referenceDate),
        valuationDate,
      );
      if (missingDates.length) {
        return {
          ...position,
          cdiPercentage,
          estimatedValue: null,
          estimatedValueCents: null,
          cdbEstimateStatus: "unavailable" as const,
        };
      }

      try {
        const estimate = estimatePostFixedCdb({
          officialValue: position.totalValue,
          cdiPercentage,
          rates,
        });
        const lastRate = rates.at(-1);
        return {
          ...position,
          cdiPercentage,
          ...estimate,
          ...(lastRate ? { estimatedThrough: lastRate.rateDate } : {}),
          cdbEstimateStatus: "official" as const,
        };
      } catch {
        logUnavailable("rates");
        return {
          ...position,
          cdiPercentage,
          estimatedValue: null,
          estimatedValueCents: null,
          cdbEstimateStatus: "unavailable" as const,
        };
      }
    });
  }
}

export const cdbEstimateService = new CdbEstimateService();
