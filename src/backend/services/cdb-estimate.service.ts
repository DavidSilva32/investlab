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

const sortRates = <T extends { rateDate: string }>(rates: T[]) =>
  [...rates].sort((left, right) => left.rateDate.localeCompare(right.rateDate));

export type CdbEstimateStatus = "official" | "provisional" | "unavailable";

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const isWeekday = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day > 0 && day < 6;
};

const previousWeekday = (date: string) => {
  let previous = addDays(date, -1);
  while (!isWeekday(previous)) previous = addDays(previous, -1);
  return previous;
};

const missingWeekdaysAfter = (lastRateDate: string, today: string) => {
  const missing: string[] = [];
  for (
    let date = addDays(lastRateDate, 1);
    date < today;
    date = addDays(date, 1)
  ) {
    if (isWeekday(date)) missing.push(date);
  }
  return missing;
};
const logUnavailable = (phase: "configuration" | "rates" | "cache") =>
  logger.warn("cdb_estimates_unavailable", { phase });

export class CdbEstimateService {
  async enrich<
    T extends {
      product: string;
      assetCode: string | null;
      indexer: string | null;
      totalValue: string | null;
      referenceDate?: string | null;
    },
  >(positions: T[]) {
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
      }));
    }

    const percentages = new Map(
      configurations.map((configuration) => [
        configuration.assetCode,
        configuration.cdiPercentage,
      ]),
    );
    const today = todayInSaoPaulo();
    const eligible = positions.filter(
      (position) =>
        isDiCdb(position) &&
        Boolean(percentages.get(position.assetCode!)) &&
        Boolean(position.totalValue) &&
        Boolean(position.referenceDate) &&
        position.referenceDate! < today,
    );
    const baseDates = [
      ...new Set(eligible.map((position) => position.referenceDate!)),
    ];
    const cachedRatesByBaseDate = new Map<
      string,
      Array<{ rateDate: string; annualRate: string; fetchedAt: Date }>
    >();

    try {
      await Promise.all(
        baseDates.map(async (baseDate) => {
          const rates = await cdbRateRepository.listRatesFrom(baseDate, today);
          cachedRatesByBaseDate.set(baseDate, sortRates(rates));
        }),
      );
    } catch {
      logUnavailable("rates");
      return positions.map((position) => ({
        ...position,
        cdiPercentage: position.assetCode
          ? (percentages.get(position.assetCode) ?? null)
          : null,
        estimatedValue: null,
      }));
    }

    const missingBaseDates = baseDates.filter((baseDate) => {
      const lastCachedDate = cachedRatesByBaseDate
        .get(baseDate)
        ?.at(-1)?.rateDate;
      return !lastCachedDate || lastCachedDate < today;
    });
    const unavailableBaseDates = new Set<string>();
    let fetchedRates: Array<{ date: string; annualRate: string }> = [];
    const provisionalRatesByBaseDate = new Map<
      string,
      { rateDate: string; annualRate: string; fetchedAt: Date }
    >();

    if (missingBaseDates.length) {
      const from = missingBaseDates
        .map(
          (baseDate) =>
            cachedRatesByBaseDate.get(baseDate)?.at(-1)?.rateDate ??
            previousWeekday(baseDate),
        )
        .sort()[0]!;
      try {
        fetchedRates = await bcbCdiService.fetchRates(from, today);
      } catch {
        logUnavailable("rates");
        missingBaseDates.forEach((baseDate) => {
          const lastRate = cachedRatesByBaseDate.get(baseDate)?.at(-1);
          if (!lastRate) {
            unavailableBaseDates.add(baseDate);
            return;
          }
          const missingWeekdays = missingWeekdaysAfter(
            lastRate.rateDate,
            today,
          );
          if (missingWeekdays.length === 1) {
            provisionalRatesByBaseDate.set(baseDate, {
              rateDate: missingWeekdays[0]!,
              annualRate: lastRate.annualRate,
              fetchedAt: new Date(),
            });
            return;
          }

          unavailableBaseDates.add(baseDate);
        });
      }
    }

    if (fetchedRates.length) {
      try {
        await cdbRateRepository.cacheRates(fetchedRates);
      } catch {
        logUnavailable("cache");
      }
    }

    missingBaseDates.forEach((baseDate) => {
      if (unavailableBaseDates.has(baseDate)) return;
      const confirmedRates = sortRates([
        ...cachedRatesByBaseDate.get(baseDate)!,
        ...fetchedRates
          .filter((rate) => rate.date >= baseDate)
          .map((rate) => ({
            rateDate: rate.date,
            annualRate: rate.annualRate,
            fetchedAt: new Date(),
          })),
      ]);
      const lastRate = confirmedRates.at(-1);
      if (!lastRate) {
        const seedDate = previousWeekday(baseDate);
        const seedRate = fetchedRates.find((rate) => rate.date === seedDate);
        const missingWeekdays = missingWeekdaysAfter(seedDate, today);
        if (seedRate && missingWeekdays.length === 1) {
          provisionalRatesByBaseDate.set(baseDate, {
            rateDate: missingWeekdays[0]!,
            annualRate: seedRate.annualRate,
            fetchedAt: new Date(),
          });
          return;
        }
        unavailableBaseDates.add(baseDate);
        return;
      }
      const missingWeekdays = missingWeekdaysAfter(lastRate.rateDate, today);
      if (missingWeekdays.length === 1) {
        if (!provisionalRatesByBaseDate.has(baseDate)) {
          provisionalRatesByBaseDate.set(baseDate, {
            rateDate: missingWeekdays[0]!,
            annualRate: lastRate.annualRate,
            fetchedAt: new Date(),
          });
        }
        return;
      }
      if (missingWeekdays.length > 1) unavailableBaseDates.add(baseDate);
    });

    return positions.map((position) => {
      const cdiPercentage = position.assetCode
        ? (percentages.get(position.assetCode) ?? null)
        : null;
      if (
        !isDiCdb(position) ||
        !cdiPercentage ||
        !position.totalValue ||
        !position.referenceDate ||
        position.referenceDate >= today ||
        unavailableBaseDates.has(position.referenceDate)
      )
        return {
          ...position,
          cdiPercentage,
          estimatedValue: null,
          cdbEstimateStatus:
            isDiCdb(position) && cdiPercentage && position.totalValue
              ? ("unavailable" as const)
              : null,
        };

      const rates = [
        ...cachedRatesByBaseDate.get(position.referenceDate)!,
        ...fetchedRates
          .filter((rate) => rate.date >= position.referenceDate!)
          .map((rate) => ({
            rateDate: rate.date,
            annualRate: rate.annualRate,
            fetchedAt: new Date(),
          })),
        ...(provisionalRatesByBaseDate.get(position.referenceDate)
          ? [provisionalRatesByBaseDate.get(position.referenceDate)!]
          : []),
      ];
      const uniqueRates = Array.from(
        new Map(sortRates(rates).map((rate) => [rate.rateDate, rate])).values(),
      );

      try {
        // Eligible positions reach this point with confirmed or provisional rates.
        const lastRate = uniqueRates.at(-1)!;
        return {
          ...position,
          cdiPercentage,
          estimatedValue: estimatePostFixedCdb({
            officialValue: position.totalValue,
            cdiPercentage,
            rates: uniqueRates,
          }),
          estimatedThrough: lastRate.rateDate,
          cdbEstimateStatus:
            provisionalRatesByBaseDate.has(position.referenceDate) ||
            missingWeekdaysAfter(lastRate.rateDate, today).length
              ? ("provisional" as const)
              : ("official" as const),
        };
      } catch {
        logUnavailable("rates");
        return {
          ...position,
          cdiPercentage,
          estimatedValue: null,
          cdbEstimateStatus: "unavailable" as const,
        };
      }
    });
  }
}

export const cdbEstimateService = new CdbEstimateService();
