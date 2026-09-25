import { ApplicationError } from "@/backend/errors/application-error";
import {
  assessCompanyForDiscovery,
  filterScreenerCompanies,
  screenerFilterSchema,
} from "@/backend/services/screener-metrics";
import {
  screenerRepository,
  type ScreenerRepository,
} from "@/backend/repositories/screener.repository";
import { logger } from "@/infrastructure/logging/logger";

export class ScreenerService {
  constructor(
    private readonly repository: Pick<
      ScreenerRepository,
      "getUniverse" | "hasSuccessfulSync"
    > = screenerRepository,
  ) {}

  async search(rawFilters: unknown, requestId?: string) {
    const parsed = screenerFilterSchema.safeParse(rawFilters);
    if (!parsed.success)
      throw new ApplicationError("Revise os filtros do screener.", 400);
    const [universe, hasSuccessfulSync] = await Promise.all([
      this.repository.getUniverse(),
      this.repository.hasSuccessfulSync(),
    ]);
    const all = filterScreenerCompanies(universe, {});
    const results = filterScreenerCompanies(universe, parsed.data);
    const counts = {
      issuers: all.length,
      withNetIncome: all.filter((item) => item.metrics.latestNetIncome !== null)
        .length,
      withEquity: all.filter((item) => item.metrics.latestEquity !== null)
        .length,
      withRoe: all.filter((item) => item.metrics.roe !== null).length,
      withNetMargin: all.filter((item) => item.metrics.netMargin !== null)
        .length,
      withPe: all.filter((item) => item.metrics.pe !== null).length,
      withPb: all.filter((item) => item.metrics.pb !== null).length,
    };
    logger.info("screener_query_completed", {
      requestId,
      resultCount: results.length,
      activeFilterCount: Object.values(parsed.data).filter(
        (value) => value !== undefined,
      ).length,
      counts,
    });
    return { results, counts, filters: parsed.data, hasSuccessfulSync };
  }

  async discover(requestId?: string) {
    const [universe, hasSuccessfulSync] = await Promise.all([
      this.repository.getUniverse(),
      this.repository.hasSuccessfulSync(),
    ]);
    const sourceByCnpj = new Map(
      universe.map((company) => [company.cnpj, company]),
    );
    const results = filterScreenerCompanies(universe, {}).map((company) => {
      const { metrics: _metrics, ...identity } = company;
      const source = sourceByCnpj.get(company.cnpj)!;
      return { ...identity, assessment: assessCompanyForDiscovery(source) };
    });
    logger.info("screener_discovery_completed", {
      requestId,
      resultCount: results.length,
      hasSuccessfulSync,
    });
    return { results, hasSuccessfulSync };
  }
}

export function filtersFromSearchParams(params: URLSearchParams) {
  const filters: Record<string, unknown> = {};
  const numberKeys = [
    "positiveProfitYears",
    "minimumRoe",
    "minimumNetMargin",
    "maximumPe",
    "maximumPb",
  ] as const;
  for (const key of numberKeys) {
    const value = params.get(key);
    if (value !== null && value.trim() !== "") filters[key] = Number(value);
  }
  const equityPositive = params.get("equityPositive");
  if (equityPositive === "true") filters.equityPositive = true;
  if (equityPositive === "false") filters.equityPositive = false;
  return filters;
}

export const screenerService = new ScreenerService();
