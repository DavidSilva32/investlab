import { afterEach, describe, expect, it, vi } from "vitest";
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
import { getBcbReferenceRates } from "@/backend/services/bcb-reference-rates.service";
describe("getBcbReferenceRates", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });
  it("maps official Selic and CDI values and tolerates unavailable data", async () => {
    vi.stubEnv("NODE_ENV", "development");
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ data: "18/09/2026", valor: "15,00" }],
      })
      .mockResolvedValueOnce({ ok: false });
    await expect(getBcbReferenceRates()).resolves.toEqual({
      selic: { date: "2026-09-18", annualRate: "15.00" },
      cdi: null,
    });
    fetchMock.mockRejectedValue(new Error("network"));
    await expect(getBcbReferenceRates()).resolves.toEqual({
      selic: null,
      cdi: null,
    });
  });
});
