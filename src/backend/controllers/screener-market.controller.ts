import {
  screenerMarketService,
  type ScreenerMarketService,
} from "@/backend/services/screener-market.service";

export class ScreenerMarketController {
  constructor(
    private readonly service: Pick<
      ScreenerMarketService,
      "refreshBatch"
    > = screenerMarketService,
  ) {}

  async refresh(requestId: string) {
    return {
      ...(await this.service.refreshBatch(requestId)),
      requestId,
    };
  }
}

export const screenerMarketController = new ScreenerMarketController();
