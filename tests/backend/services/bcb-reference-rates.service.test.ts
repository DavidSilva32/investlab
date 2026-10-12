import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { BcbReferenceRatesService } from "@/backend/services/bcb-reference-rates.service";

describe("BcbReferenceRatesService.getReferenceRates", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });

  it("skips network access under test", async () => {
    vi.stubEnv("NODE_ENV", "test");
    await expect(
      new BcbReferenceRatesService().getReferenceRates(),
    ).resolves.toEqual({
      selic: null,
      cdi: null,
      ipca: null,
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

    await expect(
      new BcbReferenceRatesService().getReferenceRates(),
    ).resolves.toEqual({
      selic: { date: "2026-09-18", annualRate: "15.00" },
      cdi: null,
      ipca: null,
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

    await expect(
      new BcbReferenceRatesService().getReferenceRates(),
    ).resolves.toEqual({
      selic: { date: "2099-01-01", annualRate: "15.00" },
      cdi: null,
      ipca: null,
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

    await expect(
      new BcbReferenceRatesService().getReferenceRates(),
    ).resolves.toEqual({
      selic: null,
      cdi: null,
      ipca: null,
    });

    fetchMock.mockReset().mockRejectedValue(new Error("network"));
    await expect(
      new BcbReferenceRatesService().getReferenceRates(),
    ).resolves.toEqual({
      selic: null,
      cdi: null,
      ipca: null,
    });
  });

  it("calculates monthly and rolling 12-month IPCA from official SGS 433 data", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const observations = Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, "0");
      return { data: `01/${month}/2025`, valor: "0,50" };
    });
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => observations });

    await expect(
      new BcbReferenceRatesService().getReferenceRates(),
    ).resolves.toEqual({
      selic: null,
      cdi: null,
      ipca: {
        date: "2025-12-01",
        monthlyRate: "0.5",
        rollingAnnualRate: "6.17",
      },
    });
    expect(fetchMock.mock.calls[2]?.[0]).toContain(
      "bcdata.sgs.433/dados/ultimos/12",
    );
  });

  it("keeps IPCA unavailable when any month in its 12-month window is invalid", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const observations = Array.from({ length: 11 }, (_, index) => {
      const month = String(index + 1).padStart(2, "0");
      return { data: `01/${month}/2025`, valor: "0,50" };
    });
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => observations });

    await expect(
      new BcbReferenceRatesService().getReferenceRates(),
    ).resolves.toEqual({ selic: null, cdi: null, ipca: null });
  });

  it.each([
    {
      name: "an invalid calendar date",
      observations: Array.from({ length: 12 }, (_, index) => ({
        data:
          index === 0
            ? "31/02/2025"
            : `01/${String(index + 1).padStart(2, "0")}/2025`,
        valor: "0,50",
      })),
    },
    {
      name: "a malformed observation date",
      observations: Array.from({ length: 12 }, (_, index) => ({
        data:
          index === 0
            ? "inválida"
            : `01/${String(index + 1).padStart(2, "0")}/2025`,
        valor: "0,50",
      })),
    },
    {
      name: "a gap between monthly observations",
      observations: Array.from({ length: 12 }, (_, index) => {
        const monthIndex = index < 5 ? index + 1 : index + 2;
        const year = monthIndex > 12 ? 2026 : 2025;
        const month = monthIndex > 12 ? 1 : monthIndex;
        return {
          data: `01/${String(month).padStart(2, "0")}/${year}`,
          valor: "0,50",
        };
      }),
    },
    {
      name: "a future reference month",
      observations: Array.from({ length: 12 }, (_, index) => ({
        data: `01/${String(index + 1).padStart(2, "0")}/2099`,
        valor: "0,50",
      })),
    },
  ])("keeps IPCA unavailable for $name", async ({ observations }) => {
    vi.stubEnv("NODE_ENV", "development");
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => observations });

    await expect(
      new BcbReferenceRatesService().getReferenceRates(),
    ).resolves.toEqual({ selic: null, cdi: null, ipca: null });
  });

  it("rejects an official rate with an unusable reference date", async () => {
    vi.stubEnv("NODE_ENV", "development");
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ data: "", valor: "15,00" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ data: "18/09/2026", valor: "14,90" }],
      })
      .mockResolvedValueOnce({ ok: false, status: 503 });

    await expect(
      new BcbReferenceRatesService().getReferenceRates(),
    ).resolves.toEqual({
      selic: null,
      cdi: { date: "2026-09-18", annualRate: "14.90" },
      ipca: null,
    });
  });
});
