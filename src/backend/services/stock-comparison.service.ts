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
  accountProvenance: string | null;
  unavailableReason: string | null;
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
  accountProvenance: null,
  unavailableReason: reason,
  ...values,
});

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

function supportsFinancialMetric(
  candidate: Candidate,
  metric: "roe" | "netMargin",
  indicator: AnalysisIndicator | undefined,
) {
  const flow = getFlow(candidate, indicator);
  if (
    !indicator ||
    indicator.value === null ||
    !Number.isFinite(indicator.value) ||
    !flow
  )
    return {
      flow: undefined,
      reason:
        indicator?.unavailableReason ??
        "A fonte CVM não disponibilizou a métrica.",
    };
  if (
    !flow.netIncomeConcept ||
    !flow.netIncomeAccount ||
    (metric === "roe" && (!flow.equityConcept || !flow.equityAccount))
  )
    return {
      flow: undefined,
      reason:
        "A origem e o conceito das contas CVM não permitem confirmar esta métrica.",
    };
  if (metric === "netMargin" && !flow.revenueAccountLabel)
    return {
      flow: undefined,
      reason: "A conta de receita do demonstrativo não está identificada.",
    };
  return { flow, reason: null };
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
  const comparisonReason = financialBaseReason(candidates);
  if (comparisonReason)
    return candidates.map((candidate) =>
      unavailable(metricBaseReason(candidate) ?? comparisonReason),
    );

  const sector = normalizeSector(candidates[0]?.metadata.sector);
  const classification = classifyCvmSector(candidates[0]?.metadata.sector);
  if (classification === "financial" && sector !== "BANCOS")
    return candidates.map(() =>
      unavailable(
        "A metodologia aprovada não permite atribuir métricas financeiras ou de seguradoras ao ticker.",
      ),
    );
  if (classification !== "non_financial" && sector !== "BANCOS")
    return candidates.map(() =>
      unavailable("O setor CVM não possui metodologia comparável aprovada."),
    );
  if (sector === "BANCOS" && metric !== "roe")
    return candidates.map(() =>
      unavailable("Margem bancária sem definição comparável aprovada."),
    );

  const pairs = candidates.map((candidate) => {
    const indicator = getIndicator(candidate, metric);
    const supported = supportsFinancialMetric(candidate, metric, indicator);
    return { candidate, indicator, ...supported };
  });
  const missing = pairs.find((pair) => !pair.indicator || !pair.flow);
  if (missing)
    return pairs.map((pair) =>
      unavailable(pair.reason!, {
        referenceDate: pair.indicator?.referenceDate ?? null,
        periodBasis: pair.indicator?.periodBasis ?? null,
        sourceDocument: pair.indicator?.sourceDocument ?? null,
      }),
    );

  const validPairs = pairs.map(
    (pair) =>
      pair as typeof pair & {
        indicator: AnalysisIndicator;
        flow: NonNullable<ReturnType<typeof getFlow>>;
      },
  );
  if (!samePeriod(validPairs))
    return validPairs.map(({ indicator }) =>
      unavailable("As métricas usam períodos ou datas-base incompatíveis.", {
        referenceDate: indicator.referenceDate,
        periodBasis: indicator.periodBasis,
        sourceDocument: indicator.sourceDocument,
      }),
    );
  if (sector !== "BANCOS" && !accountSetMatches(validPairs, metric))
    return validPairs.map(({ indicator }) =>
      unavailable(
        "As contas e os conceitos CVM não têm a mesma origem semântica entre os emissores.",
        {
          referenceDate: indicator.referenceDate,
          periodBasis: indicator.periodBasis,
          sourceDocument: indicator.sourceDocument,
        },
      ),
    );
  if (
    sector === "BANCOS" &&
    validPairs.some(
      ({ indicator, flow }) =>
        indicator.periodBasis !== "trailing_twelve_months" ||
        flow.netIncomeConcept !== "consolidated_net_income" ||
        !["3.09", "3.11"].includes(flow.netIncomeAccount ?? "") ||
        flow.equityConcept !== "consolidated_equity" ||
        !["2.03", "2.07", "2.08"].includes(flow.equityAccount!),
    )
  )
    return validPairs.map(({ indicator }) =>
      unavailable(
        "O ROE bancário exige lucro e patrimônio líquidos consolidados em LTM compatível com a metodologia aprovada.",
        {
          referenceDate: indicator.referenceDate,
          periodBasis: indicator.periodBasis,
          sourceDocument: indicator.sourceDocument,
        },
      ),
    );

  const sourceSummaries = validPairs.map(({ candidate, flow }) =>
    ltmSourceSummary(candidate, flow, metric),
  );
  if (sourceSummaries.some((summary) => summary === null))
    return validPairs.map(({ indicator }) =>
      unavailable(
        "Não foi possível confirmar os documentos e períodos usados para esta métrica.",
        {
          referenceDate: indicator.referenceDate,
          periodBasis: indicator.periodBasis,
          sourceDocument: indicator.sourceDocument,
        },
      ),
    );

  return validPairs.map(({ indicator, flow }, index) => ({
    value: indicator.value,
    referenceDate: indicator.referenceDate,
    periodStart: flow.periodStart ?? null,
    periodBasis: indicator.periodBasis!,
    sourceDocument: indicator.sourceDocument,
    sourceSummary: sourceSummaries[index]!,
    marketDataDate: null,
    accountProvenance:
      metric === "roe"
        ? `CVM consolidado · lucro ${flow.netIncomeAccount} · patrimônio ${flow.equityAccount}`
        : `CVM consolidado · receita 3.01 (${flow.revenueAccountLabel}) · lucro ${flow.netIncomeAccount}`,
    unavailableReason: null,
  }));
}

function buildValuationCells(candidates: Candidate[], metric: "pe" | "pb") {
  return candidates.map((candidate) => {
    const indicator = getIndicator(candidate, metric);
    return unavailable(
      metricBaseReason(candidate) ??
        "Data-base de mercado e classe da ação sem reconciliação.",
      {
        referenceDate: indicator?.referenceDate ?? null,
        periodBasis: indicator?.periodBasis ?? null,
        sourceDocument: indicator?.sourceDocument ?? null,
        marketDataDate: candidate.analysis?.priceUpdatedAt ?? null,
      },
    );
  });
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
      "getFundamentalsByIssuer"
    > = stockAnalysisService,
  ) {}

  async compare(rawRequest: unknown, requestId?: string) {
    const parsed = comparisonRequestSchema.safeParse(rawRequest);
    if (!parsed.success)
      throw new ApplicationError(
        "Selecione de 2 a 5 tickers diferentes para comparar.",
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

    const loaded = await Promise.all(
      selectedMetadata.map(async (metadata): Promise<Candidate> => {
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
            selectedTickers: [metadata.ticker],
            analysis,
            analysisError: null,
            identityVerified,
          };
        } catch (error) {
          return {
            metadata,
            selectedTickers: [metadata.ticker],
            analysis: null,
            analysisError:
              error instanceof ApplicationError
                ? error.message
                : "Não foi possível consultar os dados CVM e de mercado deste emissor.",
            identityVerified: false,
          };
        }
      }),
    );

    const byCnpj = new Map<string, Candidate[]>();
    for (const candidate of loaded) {
      const cnpj = normalizeCnpj(candidate.metadata.cnpj);
      const group = byCnpj.get(cnpj) ?? [];
      group.push(candidate);
      byCnpj.set(cnpj, group);
    }
    const candidates = [...byCnpj.values()].map((group) => {
      const chosen = group[0]!;
      return {
        ...chosen,
        metadata: {
          ...chosen.metadata,
          cnpj: normalizeCnpj(chosen.metadata.cnpj),
        },
        selectedTickers: group.map((item) => item.metadata.ticker),
        identityVerified: group.every((item) => item.identityVerified),
        analysisError:
          group.find((item) => item.analysisError)?.analysisError ?? null,
      };
    });
    const rows = compareCandidates(candidates);
    const roe = buildFundamentalCells(candidates, "roe");
    const netMargin = buildFundamentalCells(candidates, "netMargin");
    const pe = buildValuationCells(candidates, "pe");
    const pb = buildValuationCells(candidates, "pb");
    const companies = rows.map((row, index) => ({
      ...row,
      fundamentals: { roe: roe[index]!, netMargin: netMargin[index]! },
      valuation: { pe: pe[index]!, pb: pb[index]! },
    }));
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
