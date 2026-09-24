import {
  screenerSyncService,
  type ScreenerSyncService,
} from "@/backend/services/screener-sync.service";

export class ScreenerSyncController {
  constructor(
    private readonly service: Pick<
      ScreenerSyncService,
      "sync"
    > = screenerSyncService,
  ) {}

  async sync() {
    return this.service.sync();
  }
}

export const screenerSyncController = new ScreenerSyncController();
