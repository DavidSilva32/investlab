import { cdbRateRepository } from "@/backend/repositories/cdb-rate.repository";
import { bcbCdiService } from "@/backend/services/bcb-cdi.service";
import { estimatePostFixedCdb } from "@/backend/services/cdb-cdi-estimator";

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
  const configurations = await cdbRateRepository.listConfigurations(
    cdbs.map((position) => position.assetCode!),
  );
  const percentages = new Map(
    configurations.map((configuration) => [
      configuration.assetCode,
      configuration.cdiPercentage,
    ]),
  );
  const today = todayInSaoPaulo();

  return Promise.all(
    positions.map(async (position) => {
      const cdiPercentage = position.assetCode
        ? percentages.get(position.assetCode)
        : undefined;
      if (
        !isDiCdb(position) ||
        !cdiPercentage ||
        !position.totalValue ||
        !position.estimationBaseDate ||
        position.estimationBaseDate >= today
      )
        return {
          ...position,
          cdiPercentage: cdiPercentage ?? null,
          estimatedValue: null,
        };

      const estimationBaseDate = position.estimationBaseDate;
      let rates = await cdbRateRepository.listRatesFrom(
        estimationBaseDate,
        today,
      );
      const lastCachedDate = rates.at(-1)?.rateDate;
      if (!lastCachedDate || lastCachedDate < today) {
        const fetched = await bcbCdiService.fetchRates(
          lastCachedDate ?? estimationBaseDate,
          today,
        );
        await cdbRateRepository.cacheRates(fetched);
        rates = [
          ...rates,
          ...fetched
            .filter((rate) => rate.date >= estimationBaseDate)
            .map((rate) => ({
              rateDate: rate.date,
              annualRate: rate.annualRate,
              fetchedAt: new Date(),
            })),
        ];
      }
      const uniqueRates = Array.from(
        new Map(rates.map((rate) => [rate.rateDate, rate])).values(),
      ).sort((left, right) => left.rateDate.localeCompare(right.rateDate));
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
    }),
  );
}
