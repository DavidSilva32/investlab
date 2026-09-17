import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { ApplicationError } from "@/backend/errors/application-error";
import { BcbCdiService } from "@/backend/services/bcb-cdi.service";

describe("BcbCdiService", () => {
  beforeEach(() => fetchMock.mockReset());

  it("maps SGS 4389 dates and decimal values", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { data: "17/09/2026", valor: "14,90" },
        { data: "x", valor: "invalid" },
      ],
    });
    await expect(
      new BcbCdiService().fetchRates("2026-09-16", "2026-09-18"),
    ).resolves.toEqual([{ date: "2026-09-17", annualRate: "14.90" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("bcdata.sgs.4389"),
      { next: { revalidate: 3600 } },
    );
  });

  it("returns an operational error when BCB is unavailable", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    await expect(
      new BcbCdiService().fetchRates("2026-09-16", "2026-09-18"),
    ).rejects.toBeInstanceOf(ApplicationError);
  });
});
