import {
  screenerSyncService,
  type ScreenerSyncService,
} from "@/backend/services/screener-sync.service";

export class ScreenerSyncController {
  constructor(
    private readonly service: Pick<
      ScreenerSyncService,
      "sync" | "status"
    > = screenerSyncService,
  ) {}

  async sync() {
    return this.service.sync();
  }

  async status() {
    return this.service.status();
  }
}

export const screenerSyncController = new ScreenerSyncController();
