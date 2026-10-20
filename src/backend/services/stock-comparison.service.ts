import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  stockAnalysisService,
  type AnalysisIndicator,
} from "@/backend/services/stock-analysis.service";
import {
  screenerRepository,
  type ScreenerRepository,
} from "@/backend/repositories/screener.repository";
import { logger } from "@/infrastructure/logging/logger";
import { classifyCvmSector } from "@/lib/cvm-sector-classification";

const comparisonRequestSchema = z.object({
  tickers: z
    .array(
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{4}[0-9]{1,2}$/),
    )
    .min(2)
    .max(5)
    .refine((tickers) => new Set(tickers).size === tickers.length),
});

type Metadata = Awaited<
  ReturnType<ScreenerRepository["getComparisonMetadata"]>
>[number];
type StockAnalysis = Awaited<
  ReturnType<typeof stockAnalysisService.getFundamentalsByIssuer>
>;
type MetricKey = "roe" | "netMargin" | "pe" | "pb";
type MetricCell = {
  value: number | null;
  referenceDate: string | null;
  periodStart: string | null;
  periodBasis: string | null;
  sourceDocument: "DFP" | "ITR" | null;
  sourceSummary: string | null;
  marketDataDate: string | null;
  valuationSource: string | null;
  valuationMethod: string | null;
  accountProvenance: string | null;
  unavailableReason: string | null;
  comparisonStatus: "comparable" | "not_comparable";
  comparisonReason: string | null;
};
type Candidate = {
  metadata: Metadata;
  selectedTickers: string[];
  analysis: StockAnalysis | null;
  analysisError: string | null;
  identityVerified: boolean;
};

const unavailable = (
  reason: string,
  values?: Partial<MetricCell>,
): MetricCell => ({
  value: null,
  referenceDate: null,
  periodStart: null,
  periodBasis: null,
  sourceDocument: null,
  sourceSummary: null,
  marketDataDate: null,
  valuationSource: null,
  valuationMethod: null,
  accountProvenance: null,
  unavailableReason: reason,
  comparisonStatus: "not_comparable",
  comparisonReason: null,
  ...values,
});

function applyComparability(cells: MetricCell[], reason: string | null) {
  return cells.map((cell) => ({
    ...cell,
    comparisonStatus: reason
      ? ("not_comparable" as const)
      : ("comparable" as const),
    comparisonReason: reason,
  }));
}

function normalizeCnpj(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeSector(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

function normalizeAccountLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

function marketTradingDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map(({ type, value }) => [type, value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function getIndicator(candidate: Candidate, key: MetricKey) {
  return candidate.analysis?.indicators.find(
    (indicator) => indicator.key === key,
  );
}

function getFlow(
  candidate: Candidate,
  indicator: AnalysisIndicator | undefined,
) {
  if (
    !candidate.analysis ||
    !indicator?.referenceDate ||
    !indicator.periodBasis
  )
    return undefined;
  return candidate.analysis.fundamentals.find(
    (period) =>
      period.referenceDate === indicator.referenceDate &&
      period.sourceDocument === indicator.sourceDocument &&
      period.periodBasis === indicator.periodBasis &&
      (indicator.periodBasis === "trailing_twelve_months"
        ? period.isDerived === true
        : period.isDerived !== true),
  );
}

function metricBaseReason(candidate: Candidate) {
  if (candidate.analysisError) return candidate.analysisError;
  if (!candidate.identityVerified)
    return "O ticker não pôde ser reconciliado com o CNPJ cadastrado na CVM.";
  if (!candidate.metadata.sector)
    return "O setor CVM deste emissor não está informado.";
  return null;
}

type FinancialMetricSupport =
  | {
      flow: undefined;
      indicator: AnalysisIndicator | undefined;
      reason: string;
    }
  | {
      flow: NonNullable<ReturnType<typeof getFlow>>;
      indicator: AnalysisIndicator;
      reason: null;
    };

function supportsFinancialMetric(
  candidate: Candidate,
  metric: "roe" | "netMargin",
  indicator: AnalysisIndicator | undefined,
): FinancialMetricSupport {
  const unsupported = (reason: string): FinancialMetricSupport => ({
    flow: undefined,
    indicator,
    reason,
  });
  if (candidate.analysis?.fundamentalsIsStale)
    return unsupported(
      "Demonstrativos CVM desatualizados; o indicador não foi apresentado como atual.",
    );
  const flow = getFlow(candidate, indicator);
  if (
    !indicator ||
    indicator.value === null ||
    !Number.isFinite(indicator.value) ||
    !flow
  )
    return unsupported(
      indicator?.unavailableReason ??
        "A fonte CVM não disponibilizou a métrica.",
    );
  if (
    !flow.netIncomeConcept ||
    !flow.netIncomeAccount ||
    (metric === "roe" && (!flow.equityConcept || !flow.equityAccount))
  )
    return unsupported(
      "A origem e o conceito das contas CVM não permitem confirmar esta métrica.",
    );
  if (metric === "netMargin" && !flow.revenueAccountLabel)
    return unsupported(
      "A conta de receita do demonstrativo não está identificada.",
    );
  return { flow, indicator, reason: null };
}

function financialBaseReason(candidates: Candidate[]) {
  const firstSector = normalizeSector(candidates[0]?.metadata.sector);
  if (!firstSector)
    return "O setor CVM exato não está disponível para comparar os emissores.";
  if (
    candidates.some(
      (candidate) => normalizeSector(candidate.metadata.sector) !== firstSector,
    )
  )
    return "Os emissores selecionados têm setores CVM diferentes; esta comparação exige o mesmo setor exato.";
  for (const candidate of candidates) {
    const reason = metricBaseReason(candidate);
    if (reason)
      return "A comparação exige identidade ticker/CNPJ e cadastro CVM válidos para todos os emissores.";
  }
  return null;
}

function samePeriod(
  pairs: Array<{
    indicator: AnalysisIndicator;
    flow: NonNullable<ReturnType<typeof getFlow>>;
  }>,
) {
  const first = pairs[0];
  return Boolean(
    first &&
    pairs.every(
      ({ indicator, flow }) =>
        indicator.referenceDate === first.indicator.referenceDate &&
        indicator.periodBasis === first.indicator.periodBasis &&
        indicator.sourceDocument === first.indicator.sourceDocument &&
        flow.periodBasis === first.flow.periodBasis &&
        flow.sourceDocument === first.flow.sourceDocument &&
        flow.periodStart === first.flow.periodStart &&
        flow.periodEnd === first.flow.periodEnd,
    ),
  );
}

function ltmSourceSummary(
  candidate: Candidate,
  flow: NonNullable<ReturnType<typeof getFlow>>,
  metric: "roe" | "netMargin",
) {
  if (flow.periodBasis !== "trailing_twelve_months")
    return `CVM ${flow.sourceDocument}`;
  if (
    !candidate.analysis ||
    !flow.periodStart ||
    !flow.periodEnd ||
    !flow.filingReferenceDate
  )
    return null;

  const year = Number(flow.periodEnd.slice(0, 4));
  const previousYear = year - 1;
  const comparativeEnd = `${previousYear}-${flow.periodEnd.slice(5)}`;
  const rows = candidate.analysis.fundamentals;
  const annual = rows.filter(
    (period) =>
      period.sourceDocument === "DFP" &&
      period.periodType === "annual" &&
      period.periodBasis === "annual" &&
      period.periodStart === `${previousYear}-01-01` &&
      period.periodEnd === `${previousYear}-12-31` &&
      period.exerciseOrder === "last" &&
      period.isDerived !== true,
  );
  const current = rows.filter(
    (period) =>
      period.sourceDocument === "ITR" &&
      period.periodBasis === "year_to_date" &&
      period.periodStart === `${year}-01-01` &&
      period.periodEnd === flow.periodEnd &&
      period.exerciseOrder === "last" &&
      period.filingReferenceDate === flow.filingReferenceDate &&
      period.isDerived !== true,
  );
  const comparative = rows.filter(
    (period) =>
      period.sourceDocument === "ITR" &&
      period.periodBasis === "year_to_date" &&
      period.periodStart === `${previousYear}-01-01` &&
      period.periodEnd === comparativeEnd &&
      period.exerciseOrder === "previous" &&
      period.filingReferenceDate === flow.filingReferenceDate &&
      period.isDerived !== true,
  );
  if (annual.length !== 1 || current.length !== 1 || comparative.length !== 1)
    return null;
  const sourceRows = [annual[0]!, current[0]!, comparative[0]!];
  const netIncomeConcepts = sourceRows.map(
    (period) => period.netIncomeConcept ?? "",
  );
  const annualAccount = sourceRows[0]?.netIncomeAccount;
  const currentAccount = sourceRows[1]?.netIncomeAccount;
  const comparativeAccount = sourceRows[2]?.netIncomeAccount;
  if (
    !netIncomeConcepts[0] ||
    netIncomeConcepts.some((concept) => concept !== netIncomeConcepts[0]) ||
    !["3.09", "3.11"].includes(annualAccount ?? "") ||
    !["3.09", "3.11"].includes(currentAccount ?? "") ||
    currentAccount !== comparativeAccount
  )
    return null;
  if (
    metric === "netMargin" &&
    sourceRows.some(
      (period) =>
        !period.revenueAccountLabel ||
        normalizeAccountLabel(period.revenueAccountLabel!) !==
          normalizeAccountLabel(flow.revenueAccountLabel!),
    )
  )
    return null;
  return `DFP ${previousYear} + ITR acumulado ${year} − comparativo ${previousYear}`;
}

function accountSetMatches(
  pairs: Array<{ flow: NonNullable<ReturnType<typeof getFlow>> }>,
  metric: "roe" | "netMargin",
) {
  const hasVerifiedAccounts = pairs.every(
    ({ flow }) =>
      flow.netIncomeConcept === "consolidated_net_income" &&
      ["3.09", "3.11"].includes(flow.netIncomeAccount ?? "") &&
      (metric !== "roe" ||
        (flow.equityConcept === "consolidated_equity" &&
          ["2.03", "2.07", "2.08"].includes(flow.equityAccount ?? ""))),
  );
  const identities = pairs.map(({ flow }) =>
    metric === "roe"
      ? `${flow.netIncomeConcept}|${flow.equityConcept}`
      : `${normalizeAccountLabel(flow.revenueAccountLabel!)}|${flow.netIncomeConcept}`,
  );
  return (
    hasVerifiedAccounts &&
    identities.every(Boolean) &&
    new Set(identities).size === 1
  );
}

function buildFundamentalCells(
  candidates: Candidate[],
  metric: "roe" | "netMargin",
): MetricCell[] {
  type FinancialPair = {
    candidate: Candidate;
    indicator: AnalysisIndicator;
    flow: NonNullable<ReturnType<typeof getFlow>>;
  };

  const evaluated = candidates.map((candidate) => {
    const sector = normalizeSector(candidate.metadata.sector);
    const classification = classifyCvmSector(candidate.metadata.sector);
    const support = supportsFinancialMetric(
      candidate,
      metric,
      getIndicator(candidate, metric),
    );
    const baseReason = metricBaseReason(candidate);
    const contextualValues = {
      referenceDate: support.indicator?.referenceDate ?? null,
      periodBasis: support.indicator?.periodBasis ?? null,
      sourceDocument: support.indicator?.sourceDocument ?? null,
    };

    if (baseReason)
      return { cell: unavailable(baseReason, contextualValues), pair: null };
    if (classification === "financial" && sector !== "BANCOS")
      return {
        cell: unavailable(
          "A metodologia aprovada não permite atribuir métricas financeiras ou de seguradoras ao ticker.",
        ),
        pair: null,
      };
    if (classification !== "non_financial" && sector !== "BANCOS")
      return {
        cell: unavailable(
          "O setor CVM não possui metodologia comparável aprovada.",
        ),
        pair: null,
      };
    if (sector === "BANCOS" && metric !== "roe")
      return {
        cell: unavailable("Margem bancária sem definição comparável aprovada."),
        pair: null,
      };
    if (!support.flow)
      return {
        cell: unavailable(support.reason, contextualValues),
        pair: null,
      };

    const { flow, indicator } = support;
    const pair: FinancialPair = {
      candidate,
      indicator,
      flow,
    };
    if (sector !== "BANCOS" && !accountSetMatches([pair], metric))
      return {
        cell: unavailable(
          "As contas e os conceitos CVM não permitem validar esta métrica isoladamente.",
          contextualValues,
        ),
        pair: null,
      };
    if (
      sector === "BANCOS" &&
      (indicator.periodBasis !== "trailing_twelve_months" ||
        pair.flow.netIncomeConcept !== "consolidated_net_income" ||
        !["3.09", "3.11"].includes(pair.flow.netIncomeAccount ?? "") ||
        pair.flow.equityConcept !== "consolidated_equity" ||
        !["2.03", "2.07", "2.08"].includes(pair.flow.equityAccount ?? ""))
    )
      return {
        cell: unavailable(
          "O ROE bancário exige lucro e patrimônio líquidos consolidados em LTM compatível com a metodologia aprovada.",
          contextualValues,
        ),
        pair: null,
      };

    const sourceSummary = ltmSourceSummary(candidate, pair.flow, metric);
    if (sourceSummary === null)
      return {
        cell: unavailable(
          "Não foi possível confirmar os documentos e períodos usados para esta métrica.",
          contextualValues,
        ),
        pair: null,
      };

    return {
      cell: {
        value: indicator.value,
        referenceDate: indicator.referenceDate,
        periodStart: pair.flow.periodStart ?? null,
        periodBasis: indicator.periodBasis!,
        sourceDocument: indicator.sourceDocument,
        sourceSummary,
        marketDataDate: null,
        valuationSource: null,
        valuationMethod: null,
        accountProvenance:
          metric === "roe"
            ? "CVM consolidado · lucro " +
              pair.flow.netIncomeAccount +
              " · patrimônio " +
              pair.flow.equityAccount
            : "CVM consolidado · receita 3.01 (" +
              pair.flow.revenueAccountLabel +
              ") · lucro " +
              pair.flow.netIncomeAccount,
        unavailableReason: null,
        comparisonStatus: "not_comparable" as const,
        comparisonReason: null,
      },
      pair,
    };
  });

  const validPairs = evaluated.flatMap(({ pair }) => (pair ? [pair] : []));
  let comparisonReason = financialBaseReason(candidates);
  const missing = evaluated.find(({ pair }) => pair === null);
  if (!comparisonReason && missing)
    comparisonReason =
      "Um ou mais emissores não têm esta métrica validada: " +
      missing.cell.unavailableReason;
  if (!comparisonReason && validPairs.length === candidates.length) {
    if (!samePeriod(validPairs))
      comparisonReason =
        "As métricas usam períodos ou datas-base incompatíveis.";
    else if (
      normalizeSector(candidates[0]?.metadata.sector) !== "BANCOS" &&
      !accountSetMatches(validPairs, metric)
    )
      comparisonReason =
        "As contas e os conceitos CVM não têm a mesma origem semântica entre os emissores.";
  }

  return applyComparability(
    evaluated.map(({ cell }) => cell),
    comparisonReason,
  );
}
function buildValuationCells(candidates: Candidate[], metric: "pe" | "pb") {
  const cells = candidates.map((candidate) => {
    const indicator = getIndicator(candidate, metric);
    if (candidate.analysis?.fundamentalsIsStale)
      return unavailable(
        "Demonstrativos CVM desatualizados; o indicador não foi apresentado como atual.",
        {
          referenceDate: indicator?.referenceDate ?? null,
          periodBasis: indicator?.periodBasis ?? null,
          sourceDocument: indicator?.sourceDocument ?? null,
          marketDataDate: indicator?.marketDataDate ?? null,
        },
      );
    if (
      candidate.identityVerified &&
      candidate.analysis?.marketCapIdentityVerified === true &&
      indicator?.value !== null &&
      indicator?.value !== undefined &&
      Number.isFinite(indicator.value) &&
      marketTradingDate(indicator.marketDataDate) &&
      indicator.valuationSource &&
      indicator.valuationMethod &&
      indicator.referenceDate &&
      indicator.sourceDocument &&
      (metric === "pe"
        ? indicator.periodBasis === "annual" ||
          indicator.periodBasis === "trailing_twelve_months"
        : indicator.periodBasis === "point_in_time")
    )
      return {
        value: indicator.value,
        referenceDate: indicator.referenceDate,
        periodStart: null,
        periodBasis: indicator.periodBasis!,
        sourceDocument: indicator.sourceDocument,
        sourceSummary:
          indicator.valuationSource +
          " · " +
          indicator.valuationMethod +
          " · " +
          indicator.marketDataDate +
          " · CVM " +
          indicator.sourceDocument +
          " com data-base " +
          indicator.referenceDate,
        marketDataDate: indicator.marketDataDate,
        valuationSource: indicator.valuationSource,
        valuationMethod: indicator.valuationMethod,
        accountProvenance: null,
        unavailableReason: null,
        comparisonStatus: "not_comparable" as const,
        comparisonReason: null,
      } satisfies MetricCell;
    return unavailable(
      metricBaseReason(candidate) ??
        (candidate.analysis?.marketDataIdentityVerified !== true
          ? "Data-base de mercado e classe da ação sem reconciliação."
          : (indicator?.unavailableReason ??
            "A fonte não disponibilizou a métrica.")),
      {
        referenceDate: indicator?.referenceDate ?? null,
        periodBasis: indicator?.periodBasis ?? null,
        sourceDocument: indicator?.sourceDocument ?? null,
        marketDataDate: candidate.analysis?.priceUpdatedAt ?? null,
      },
    );
  });
  const available = cells.filter((cell) => cell.value !== null);
  const bases = available.map(
    (cell) =>
      cell.periodBasis + "|" + cell.referenceDate + "|" + cell.sourceDocument,
  );
  const marketDays = available.map((cell) =>
    marketTradingDate(cell.marketDataDate),
  );
  const differentMarketDays = new Set(marketDays).size > 1;
  const comparisonReason =
    available.length !== cells.length
      ? "Um ou mais emissores não têm este valuation validado; os valores disponíveis são individuais."
      : available.length > 1 && (new Set(bases).size > 1 || differentMarketDays)
        ? differentMarketDays
          ? "Os indicadores usam datas de mercado diferentes; os valores individuais não são comparáveis."
          : "Os indicadores usam bases ou datas CVM diferentes; os valores individuais não são comparáveis."
        : null;
  return applyComparability(cells, comparisonReason);
}
function compareCandidates(candidates: Candidate[]) {
  return candidates.map((candidate) => ({
    ticker: candidate.metadata.ticker,
    selectedTickers: candidate.selectedTickers,
    name: candidate.metadata.issuerName,
    cnpj: candidate.metadata.cnpj,
    cvmCode: candidate.metadata.cvmCode,
    sector: candidate.metadata.sector,
    metadataUpdatedAt: candidate.metadata.issuerMetadataUpdatedAt.toISOString(),
    identityVerified: candidate.identityVerified,
    fundamentals: {
      roe: unavailable("A comparação não foi calculada."),
      netMargin: unavailable("A comparação não foi calculada."),
    },
    valuation: {
      pe: unavailable("A comparação não foi calculada."),
      pb: unavailable("A comparação não foi calculada."),
    },
  }));
}

export class StockComparisonService {
  constructor(
    private readonly marketRepository: Pick<
      ScreenerRepository,
      "getComparisonMetadata"
    > = screenerRepository,
    private readonly analysisService: Pick<
      typeof stockAnalysisService,
      "getFundamentalsByIssuer" | "getFundamentalsRefreshState"
    > = stockAnalysisService,
  ) {}

  async getRefreshStatus(rawRequest: unknown, requestId?: string) {
    const parsed = comparisonRequestSchema.safeParse(rawRequest);
    if (!parsed.success)
      throw new ApplicationError(
        "Selecione de 2 a 5 tickers diferentes para consultar o andamento.",
        400,
      );

    const tickers = parsed.data.tickers;
    const metadataRows =
      await this.marketRepository.getComparisonMetadata(tickers);
    const rowsByTicker = new Map<string, Metadata[]>();
    for (const row of metadataRows) {
      const rows = rowsByTicker.get(row.ticker) ?? [];
      rows.push(row);
      rowsByTicker.set(row.ticker, rows);
    }
    const companies = await Promise.all(
      tickers.map(async (ticker) => {
        const matches = rowsByTicker.get(ticker) ?? [];
        if (
          matches.length !== 1 ||
          normalizeCnpj(matches[0]?.cnpj).length !== 14
        )
          throw new ApplicationError(
            `Não foi possível confirmar o vínculo CVM de ${ticker}.`,
            422,
          );
        const metadata = matches[0]!;
        return {
          ticker,
          fundamentalsRefresh:
            await this.analysisService.getFundamentalsRefreshState(
              ticker,
              metadata.cnpj,
            ),
        };
      }),
    );
    logger.info("stock_comparison_refresh_status_loaded", {
      requestId,
      selectedTickerCount: tickers.length,
      statusCount: companies.length,
    });
    return { companies };
  }

  async compare(rawRequest: unknown, requestId?: string) {
    const startedAt = Date.now();
    const parsed = comparisonRequestSchema.safeParse(rawRequest);
    if (!parsed.success)
      throw new ApplicationError(
        "Selecione de 2 a 5 tickers diferentes para comparar.",
        400,
      );

    const tickers = parsed.data.tickers;
    const metadataStartedAt = Date.now();
    const metadataRows =
      await this.marketRepository.getComparisonMetadata(tickers);
    const metadataReadMs = Date.now() - metadataStartedAt;
    const rowsByTicker = new Map<string, Metadata[]>();
    for (const row of metadataRows) {
      const rows = rowsByTicker.get(row.ticker) ?? [];
      rows.push(row);
      rowsByTicker.set(row.ticker, rows);
    }
    const selectedMetadata = tickers.map((ticker) => {
      const matches = rowsByTicker.get(ticker) ?? [];
      if (matches.length !== 1 || normalizeCnpj(matches[0]?.cnpj).length !== 14)
        throw new ApplicationError(
          `Não foi possível confirmar o vínculo CVM de ${ticker}.`,
          422,
        );
      return matches[0]!;
    });
    const distinctIssuers = new Set(
      selectedMetadata.map((item) => normalizeCnpj(item.cnpj)),
    );
    if (distinctIssuers.size < 2)
      throw new ApplicationError(
        "Selecione ao menos duas companhias diferentes; classes do mesmo emissor contam uma vez.",
        400,
      );

    const fundamentalsStartedAt = Date.now();
    const metadataByIssuer = new Map<string, Metadata[]>();
    for (const metadata of selectedMetadata) {
      const cnpj = normalizeCnpj(metadata.cnpj);
      const issuerTickers = metadataByIssuer.get(cnpj) ?? [];
      issuerTickers.push(metadata);
      metadataByIssuer.set(cnpj, issuerTickers);
    }

    const loaded = await Promise.all(
      [...metadataByIssuer.values()].map(
        async (issuerTickers): Promise<Candidate> => {
          const metadata = issuerTickers[0]!;
          try {
            const analysis = await this.analysisService.getFundamentalsByIssuer(
              metadata.ticker,
              metadata.cnpj,
              requestId,
            );
            const identityVerified =
              analysis.ticker.toUpperCase() === metadata.ticker.toUpperCase() &&
              normalizeCnpj(analysis.cnpj) === normalizeCnpj(metadata.cnpj);
            return {
              metadata,
              selectedTickers: issuerTickers.map((item) => item.ticker),
              analysis,
              analysisError: null,
              identityVerified,
            };
          } catch (error) {
            return {
              metadata,
              selectedTickers: issuerTickers.map((item) => item.ticker),
              analysis: null,
              analysisError:
                error instanceof ApplicationError
                  ? error.message
                  : "Não foi possível consultar os dados CVM e de mercado deste emissor.",
              identityVerified: false,
            };
          }
        },
      ),
    );
    const fundamentalsLoadMs = Date.now() - fundamentalsStartedAt;

    const calculationStartedAt = Date.now();
    const candidates = loaded.map((candidate) => ({
      ...candidate,
      metadata: {
        ...candidate.metadata,
        cnpj: normalizeCnpj(candidate.metadata.cnpj),
      },
    }));
    const rows = compareCandidates(candidates);
    const roe = buildFundamentalCells(candidates, "roe");
    const netMargin = buildFundamentalCells(candidates, "netMargin");
    const pe = buildValuationCells(candidates, "pe");
    const pb = buildValuationCells(candidates, "pb");
    const companies = rows.map((row, index) => ({
      ...row,
      fundamentals: { roe: roe[index]!, netMargin: netMargin[index]! },
      valuation: { pe: pe[index]!, pb: pb[index]! },
      fundamentalsRefresh: candidates[index]?.analysis?.fundamentalsRefresh ?? {
        status: "idle" as const,
        retryAfter: null,
        errorCode: null,
      },
    }));
    logger.info("stock_comparison_stage_timing", {
      requestId,
      selectedTickerCount: tickers.length,
      issuerCount: companies.length,
      metadataReadMs,
      fundamentalsLoadMs,
      calculationMs: Date.now() - calculationStartedAt,
      totalMs: Date.now() - startedAt,
    });
    const sector = candidates[0]?.metadata.sector ?? null;
    return {
      sector,
      sectorMetadataAsOf:
        candidates[0]!.metadata.issuerMetadataUpdatedAt.toISOString(),
      companies,
    };
  }
}

export const stockComparisonService = new StockComparisonService();
