import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { getBcbReferenceRates } from "@/backend/services/bcb-reference-rates.service";

describe("getBcbReferenceRates", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });

  it("skips network access under test", async () => {
    vi.stubEnv("NODE_ENV", "test");
    await expect(getBcbReferenceRates()).resolves.toEqual({
      selic: null,
      cdi: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps official Selic and CDI values and tolerates unavailable data", async () => {
    vi.stubEnv("NODE_ENV", "development");
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ data: "18/09/2026", valor: "15,00" }],
      })
      .mockResolvedValueOnce({ ok: false, status: 503 });

    await expect(getBcbReferenceRates()).resolves.toEqual({
      selic: { date: "2026-09-18", annualRate: "15.00" },
      cdi: null,
    });
  });

  it("keeps the Selic validity date and rejects a future CDI date", async () => {
    vi.stubEnv("NODE_ENV", "development");
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ data: "01/01/2099", valor: "15,00" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ data: "01/01/2099", valor: "14,90" }],
      });

    await expect(getBcbReferenceRates()).resolves.toEqual({
      selic: { date: "2099-01-01", annualRate: "15.00" },
      cdi: null,
    });
  });
  it("rejects invalid official values and network errors without exposing them", async () => {
    vi.stubEnv("NODE_ENV", "development");
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ data: "18/09/2026", valor: "inválido" }],
      });

    await expect(getBcbReferenceRates()).resolves.toEqual({
      selic: null,
      cdi: null,
    });

    fetchMock.mockReset().mockRejectedValue(new Error("network"));
    await expect(getBcbReferenceRates()).resolves.toEqual({
      selic: null,
      cdi: null,
    });
  });
});
