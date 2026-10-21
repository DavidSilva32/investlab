import { stockManualValuationService } from "@/backend/services/stock-manual-valuation.service";

export class StockManualValuationController {
  async list(ticker: string, requestId: string) {
    const result = await stockManualValuationService.list(ticker);
    return Response.json(
      { ...result, requestId },
      {
        headers: {
          "x-request-id": requestId,
          "cache-control": "private, no-store",
        },
      },
    );
  }

  async save(
    ticker: string,
    inputKey: string,
    request: Request,
    requestId: string,
  ) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const result = await stockManualValuationService.save(
      ticker,
      inputKey,
      body,
    );
    return Response.json({
      ...result,
      ticker: ticker.toUpperCase(),
      requestId,
    });
  }
}

export const stockManualValuationController =
  new StockManualValuationController();
