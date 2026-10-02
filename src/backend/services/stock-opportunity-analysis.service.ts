import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { BrapiMarketDataProvider } from "@/backend/providers/brapi-market-data.provider";
import type { MarketDataProvider } from "@/backend/providers/market-data.provider";
import {
  brapiDividendsProvider,
  type BrapiDividendsProvider,
} from "@/backend/providers/brapi-dividends.provider";
import {
  stockFundamentalsRepository,
  type StockFundamentalsRepository,
} from "@/backend/repositories/stock-fundamentals.repository";
import {
  stockOpportunityManualInputRepository,
  type StockOpportunityInputKey,
  type StockOpportunityManualInput,
  type StockOpportunityManualInputRepository,
} from "@/backend/repositories/stock-opportunity-manual-input.repository";
import {
  stockOpportunityAnalysisSettingsRepository,
  type StockOpportunityAnalysisSettingsRepository,
} from "@/backend/repositories/stock-opportunity-analysis-settings.repository";
import { portfolioPositionService } from "@/backend/services/portfolio-position.service";
import type { PortfolioPositionService } from "@/backend/services/portfolio-position.service";
import { logger } from "@/infrastructure/logging/logger";

const tickerPattern = /^[A-Z]{4}[0-9]{1,2}$/;
const todayUtc = () => new Date().toISOString().slice(0, 10);
const keys: StockOpportunityInputKey[] = [
  "graham_eps",
  "graham_book_value_per_share",
  "bazin_dividend_per_share",
];
const inputSchema = z.object({
  ticker: z.string().trim().toUpperCase().regex(tickerPattern),
  inputKey: z.enum(
    keys as [StockOpportunityInputKey, ...StockOpportunityInputKey[]],
  ),
  value: z.number().finite().positive().max(1_000_000_000),
  source: z.string().trim().min(2).max(160),
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value &&
        value <= todayUtc()
      );
    }),
});
const targetYieldSchema = z.number().finite().positive().max(100);

type OpportunityInput = {
  inputKey: StockOpportunityInputKey;
  value: number;
  source: string;
  asOf: string;
};

export function calculateOpportunityMethods(
  inputs: OpportunityInput[],
  price: number | null,
  bazinTargetYield: number,
) {
  const byKey = new Map(inputs.map((input) => [input.inputKey, input]));
  const eps = byKey.get("graham_eps");
  const bookValue = byKey.get("graham_book_value_per_share");
  const annualDividend = byKey.get("bazin_dividend_per_share");
  const grahamValue =
    eps &&
    bookValue &&
    eps.asOf === bookValue.asOf &&
    eps.value > 0 &&
    bookValue.value > 0
      ? Math.sqrt(22.5 * eps.value * bookValue.value)
      : null;
  const bazinValue =
    annualDividend && bazinTargetYield > 0
      ? annualDividend.value / (bazinTargetYield / 100)
      : null;
  const compare = (reference: number | null) =>
    reference !== null && reference > 0 && price !== null && price > 0
      ? ((reference - price) / reference) * 100
      : null;
  return {
    graham: {
      value: Number.isFinite(grahamValue) ? grahamValue : null,
      differencePercent: compare(
        Number.isFinite(grahamValue) ? grahamValue : null,
      ),
      asOf: eps && bookValue ? [eps.asOf, bookValue.asOf].sort().at(-1)! : null,
      source: eps && bookValue ? `${eps.source}; ${bookValue.source}` : null,
      unavailableReason:
        !eps || !bookValue
          ? "Informe lucro por ação (LPA) e valor patrimonial por ação (VPA), com origem e data. Os totais da CVM não foram convertidos por ação porque o número de ações por classe não está conciliado."
          : eps.asOf !== bookValue.asOf
            ? "LPA e VPA precisam ter a mesma data-base para esta referência."
            : price === null || price <= 0
              ? "Referência calculada; a cotação atual está indisponível para comparação."
              : null,
    },
    bazin: {
      value: Number.isFinite(bazinValue) ? bazinValue : null,
      differencePercent: compare(
        Number.isFinite(bazinValue) ? bazinValue : null,
      ),
      asOf: annualDividend?.asOf ?? null,
      source: annualDividend
        ? `${annualDividend.source}; taxa global ${bazinTargetYield}% a.a.`
        : null,
      unavailableReason: !annualDividend
        ? "Informe dividendos anuais por ação, com origem e data. A observação automática da BRAPI não comprova a completude da janela de 12 meses."
        : bazinTargetYield <= 0
          ? "A taxa global configurada não é válida para o cálculo."
          : price === null || price <= 0
            ? "Referência calculada; a cotação atual está indisponível para comparação."
            : null,
    },
  };
}

function toInput(row: {
  inputKey: string;
  value: string;
  source: string;
  asOf: string;
}): OpportunityInput {
  return {
    inputKey: row.inputKey as StockOpportunityInputKey,
    value: Number(row.value),
    source: row.source,
    asOf: row.asOf,
  };
}

export class StockOpportunityAnalysisService {
  constructor(
    private readonly positions: Pick<
      PortfolioPositionService,
      "listCurrent"
    > = portfolioPositionService,
    private readonly market: Pick<
      MarketDataProvider,
      "searchTickers" | "getQuoteByTicker"
    > = new BrapiMarketDataProvider(),
    private readonly fundamentals: Pick<
      StockFundamentalsRepository,
      "listByTicker"
    > = stockFundamentalsRepository,
    private readonly manualInputs: Pick<
      StockOpportunityManualInputRepository,
      "listByTickers" | "listByTicker" | "upsert" | "delete"
    > = stockOpportunityManualInputRepository,
    private readonly settings: Pick<
      StockOpportunityAnalysisSettingsRepository,
      "get" | "saveBazinTargetYield"
    > = stockOpportunityAnalysisSettingsRepository,
    private readonly dividends: Pick<
      BrapiDividendsProvider,
      "getLastTwelveMonths"
    > = brapiDividendsProvider,
  ) {}

  async list(requestId?: string) {
    const current = await this.positions.listCurrent(requestId);
    const importedPositions = current.flatMap((position) => {
      if (
        position.source !== "B3" ||
        !position.assetCode ||
        !tickerPattern.test(position.assetCode.toUpperCase())
      )
        return [];
      return [
        {
          ticker: position.assetCode.toUpperCase(),
          name: position.product,
          quantity: Number(position.quantity),
          referenceDate: position.referenceDate ?? null,
        },
      ];
    });
    const candidateTickers = [
      ...new Set(importedPositions.map(({ ticker }) => ticker)),
    ];
    let classificationLookupFailures = 0;
    const verifiedTickers = await Promise.all(
      candidateTickers.map(async (ticker) => {
        try {
          const matches = await this.market.searchTickers(ticker);
          return {
            ticker: matches.some(
              (match) => match.ticker.trim().toUpperCase() === ticker,
            )
              ? ticker
              : null,
            failed: false,
          };
        } catch {
          classificationLookupFailures += 1;
          logger.warn("stock_opportunity_ticker_classification_failed", {
            requestId,
            ticker,
          });
          return { ticker: null, failed: true };
        }
      }),
    );
    const verifiedSet = new Set(
      verifiedTickers.flatMap(({ ticker }) =>
        ticker === null ? [] : [ticker],
      ),
    );
    const positions = importedPositions.filter(({ ticker }) =>
      verifiedSet.has(ticker),
    );
    const tickers = [...new Set(positions.map(({ ticker }) => ticker))];
    const [manual, settings] = await Promise.all([
      this.manualInputs.listByTickers(tickers),
      this.settings.get(),
    ]);
    const bazinTargetYield = Number(settings.bazinTargetYield);
    const inputsByTicker = new Map<string, OpportunityInput[]>();
    for (const row of manual) {
      const list = inputsByTicker.get(row.ticker) ?? [];
      list.push(toInput(row));
      inputsByTicker.set(row.ticker, list);
    }
    const opportunities = await Promise.all(
      tickers.map(async (ticker) => {
        const relatedPositions = positions.filter(
          (position) => position.ticker === ticker,
        );
        const [market, fundamentals, automaticDividend] = await Promise.all([
          this.market.getQuoteByTicker(ticker).catch(() => null),
          this.fundamentals.listByTicker(ticker).catch(() => []),
          this.dividends.getLastTwelveMonths(ticker).catch(() => null),
        ]);
        const manualInputs = inputsByTicker.get(ticker) ?? [];
        return {
          ticker,
          name: relatedPositions[0]?.name ?? ticker,
          quantity: relatedPositions.reduce(
            (total, position) => total + position.quantity,
            0,
          ),
          positionDate: relatedPositions[0]?.referenceDate ?? null,
          price: market?.price ?? null,
          priceAsOf: market?.observedAt?.toISOString() ?? null,
          fundamentalsAsOf: fundamentals[0]?.referenceDate ?? null,
          automaticDividend,
          financialPeriods: fundamentals.map((period) => ({
            referenceDate: period.referenceDate,
            sourceDocument: period.sourceDocument,
          })),
          inputs: keys.map((inputKey) => {
            const entry = manualInputs.find(
              (input) => input.inputKey === inputKey,
            );
            return entry
              ? {
                  inputKey,
                  value: entry.value,
                  source: entry.source,
                  asOf: entry.asOf,
                }
              : { inputKey, value: null, source: null, asOf: null };
          }),
          methods: calculateOpportunityMethods(
            manualInputs,
            market?.price ?? null,
            bazinTargetYield,
          ),
        };
      }),
    );
    return {
      opportunities,
      asOf: todayUtc(),
      classificationStatus:
        candidateTickers.length > 0 &&
        classificationLookupFailures === candidateTickers.length
          ? "unavailable"
          : classificationLookupFailures > 0
            ? "partial"
            : "resolved",
      classificationLookupFailures,
      settings: {
        bazinTargetYield,
        initializedAt: settings.updatedAt?.toISOString().slice(0, 10) ?? null,
      },
    };
  }

  async saveBazinTargetYield(raw: unknown, requestId?: string) {
    const parsed = targetYieldSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApplicationError(
        "Informe uma taxa anual entre 0% e 100%.",
        400,
      );
    const saved = await this.settings.saveBazinTargetYield(parsed.data);
    logger.info("stock_opportunity_bazin_yield_updated", { requestId });
    return {
      bazinTargetYield: Number(saved.bazinTargetYield),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async saveInput(raw: unknown, requestId?: string) {
    const parsed = inputSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApplicationError(
        "Revise o valor, a origem e a data informados.",
        400,
      );
    const { ticker, ...value } = parsed.data;
    const positions = await this.positions.listCurrent(requestId);
    if (
      !positions.some(
        (position) =>
          position.source === "B3" &&
          position.assetCode?.toUpperCase() === ticker,
      )
    )
      throw new ApplicationError(
        "A ação não foi encontrada nas posições importadas.",
        404,
      );
    const saved = await this.manualInputs.upsert({ ticker, ...value });
    logger.info("stock_opportunity_manual_input_saved", {
      requestId,
      ticker,
      inputKey: value.inputKey,
    });
    return {
      inputKey: saved.inputKey,
      value: Number(saved.value),
      source: saved.source,
      asOf: saved.asOf,
    };
  }

  async deleteInput(
    ticker: string,
    inputKey: StockOpportunityInputKey,
    requestId?: string,
  ) {
    const normalizedTicker = ticker.trim().toUpperCase();
    if (!tickerPattern.test(normalizedTicker) || !keys.includes(inputKey))
      throw new ApplicationError("A entrada informada não é válida.", 400);
    const deleted = await this.manualInputs.delete(normalizedTicker, inputKey);
    if (!deleted)
      throw new ApplicationError("Esta entrada não existe mais.", 404);
    logger.info("stock_opportunity_manual_input_deleted", {
      requestId,
      ticker: normalizedTicker,
      inputKey,
    });
    return { ticker: normalizedTicker, inputKey };
  }
}

export const stockOpportunityAnalysisService =
  new StockOpportunityAnalysisService();
