import {
  filtersFromSearchParams,
  screenerService,
} from "@/backend/services/screener.service";

export class ScreenerController {
  async search(params: URLSearchParams, requestId: string) {
    const result = await screenerService.search(
      filtersFromSearchParams(params),
      requestId,
    );
    return Response.json({ ...result, requestId });
  }
}

export const screenerController = new ScreenerController();
