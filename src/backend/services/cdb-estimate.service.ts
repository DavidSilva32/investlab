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

const logUnavailable = (phase: "configuration" | "rates" | "cache") =>
  logger.warn("cdb_estimates_unavailable", { phase });

export async function enrichCdbEstimates<
  T extends {
    product: string;
    assetCode: string | null;
    indexer: string | null;
    totalValue: string | null;
    estimationBaseDate?: string | null;
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
      Boolean(position.estimationBaseDate) &&
      position.estimationBaseDate! < today,
  );
  const baseDates = [
    ...new Set(eligible.map((position) => position.estimationBaseDate!)),
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

  if (missingBaseDates.length) {
    const from = missingBaseDates
      .map(
        (baseDate) =>
          cachedRatesByBaseDate.get(baseDate)?.at(-1)?.rateDate ?? baseDate,
      )
      .sort()[0]!;
    try {
      fetchedRates = await bcbCdiService.fetchRates(from, today);
    } catch {
      logUnavailable("rates");
      missingBaseDates.forEach((baseDate) =>
        unavailableBaseDates.add(baseDate),
      );
    }
  }

  if (fetchedRates.length) {
    try {
      await cdbRateRepository.cacheRates(fetchedRates);
    } catch {
      logUnavailable("cache");
    }
  }

  return positions.map((position) => {
    const cdiPercentage = position.assetCode
      ? (percentages.get(position.assetCode) ?? null)
      : null;
    if (
      !isDiCdb(position) ||
      !cdiPercentage ||
      !position.totalValue ||
      !position.estimationBaseDate ||
      position.estimationBaseDate >= today ||
      unavailableBaseDates.has(position.estimationBaseDate)
    )
      return { ...position, cdiPercentage, estimatedValue: null };

    const rates = [
      ...(cachedRatesByBaseDate.get(position.estimationBaseDate) ?? []),
      ...fetchedRates
        .filter((rate) => rate.date >= position.estimationBaseDate!)
        .map((rate) => ({
          rateDate: rate.date,
          annualRate: rate.annualRate,
          fetchedAt: new Date(),
        })),
    ];
    const uniqueRates = Array.from(
      new Map(sortRates(rates).map((rate) => [rate.rateDate, rate])).values(),
    );

    try {
      return {
        ...position,
        cdiPercentage,
        estimatedValue: uniqueRates.length
          ? estimatePostFixedCdb({
              officialValue: position.totalValue,
              cdiPercentage,
              rates: uniqueRates,
            })
          : null,
      };
    } catch {
      logUnavailable("rates");
      return { ...position, cdiPercentage, estimatedValue: null };
    }
  });
}
