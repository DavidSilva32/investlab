import { stockComparisonService } from "@/backend/services/stock-comparison.service";
import { stockAnalysisService } from "@/backend/services/stock-analysis.service";
import { logger } from "@/infrastructure/logging/logger";

export class StockComparisonController {
  async getRefreshStatus(body: unknown, requestId: string) {
    const status = await stockComparisonService.getRefreshStatus(
      body,
      requestId,
    );
    return Response.json(status, {
      headers: {
        "x-request-id": requestId,
        "cache-control": "private, no-store",
      },
    });
  }

  async compare(
    body: unknown,
    requestId: string,
    scheduleAfterResponse?: (work: () => Promise<void>) => void,
  ) {
    const result = await stockComparisonService.compare(body, requestId);
    const refreshRuns: Array<() => Promise<void>> = [];
    const companies = scheduleAfterResponse
      ? await Promise.all(
          result.companies.map(async (company) => {
            if (company.fundamentalsRefresh.status !== "idle") return company;
            try {
              const refresh =
                await stockAnalysisService.requestFundamentalsRefresh(
                  company.ticker,
                  company.cnpj,
                  requestId,
                );
              if (refresh.run) refreshRuns.push(refresh.run);
              return { ...company, fundamentalsRefresh: refresh.state };
            } catch (error) {
              logger.error("stock_comparison_fundamentals_refresh_failed", {
                requestId,
                ticker: company.ticker,
                errorType: error instanceof Error ? error.name : typeof error,
              });
              return company;
            }
          }),
        )
      : result.companies;
    if (scheduleAfterResponse && refreshRuns.length)
      scheduleAfterResponse(async () => {
        await Promise.all(refreshRuns.map((run) => run()));
      });
    logger.info("stock_comparison_completed", {
      requestId,
      issuerCount: result.companies.length,
      sector: result.sector,
    });
    return Response.json(
      { ...result, companies },
      { headers: { "x-request-id": requestId } },
    );
  }
}

export const stockComparisonController = new StockComparisonController();
