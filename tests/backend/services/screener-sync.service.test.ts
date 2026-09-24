import { describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import { ApplicationError } from "@/backend/errors/application-error";
import { calculateScreenerMetrics } from "@/backend/services/screener-metrics";
import {
  BrapiScreenerProviderError,
  type BrapiScreenerProvider,
  type CvmCompanyRecord,
  ScreenerFactRecord,
} from "@/backend/providers/screener-data.provider";
import {
  ScreenerSyncService,
  type ScreenerSyncService as SyncServiceType,
} from "@/backend/services/screener-sync.service";
import type { ScreenerSyncRepository } from "@/backend/repositories/screener-sync.repository";
import { logger } from "@/infrastructure/logging/logger";

const company = (
  cnpj: string,
  cvmCode: string,
  sector: string,
  quantitativeEligible: boolean,
): CvmCompanyRecord => ({
  cnpj,
  cvmCode,
  name: `Issuer ${cvmCode}`,
  sector,
  quantitativeEligible,
});
const stock = (ticker: string, subtype = "stock", active = true) => ({
  ticker,
  name: ticker,
  subtype,
  active,
  cnpj: null,
  changed: false,
});
const fact = (
  version: number,
  sourceFile = "dfp.zip#dfp_con.csv",
  sourceRow = 1,
): ScreenerFactRecord => ({
  issuerCnpj: "33000167000101",
  referenceDate: "2025-12-31",
  accountCode: "3.11",
  accountLabel: "Lucro",
  value: String(version * 10),
  documentType: "DFP",
  statementScope: "CONSOLIDATED",
  exerciseOrder: "ULTIMO",
  version,
  sourceFile,
  sourceRow,
});
const annualFact = (
  year: number,
  accountCode: string,
  value: number,
  version = 1,
  sourceFile?: string,
): ScreenerFactRecord => ({
  ...fact(version, sourceFile),
  referenceDate: `${year}-12-31`,
  accountCode,
  value: String(value),
});

function setup(
  overrides: {
    catalog?: ReturnType<BrapiScreenerProvider["getCatalog"]> extends Promise<
      infer V
    >
      ? V
      : never;
    profile?: (
      ticker: string,
    ) => Promise<
      ReturnType<BrapiScreenerProvider["getProfile"]> extends Promise<infer V>
        ? V
        : never
    >;
    facts?: (year: number) => Promise<ScreenerFactRecord[]>;
    cvmFailure?: Error;
    repositoryFailure?: Error;
    persistedFactCount?: number;
  } = {},
) {
  const registry = new Map<string, CvmCompanyRecord>([
    ["33000167000101", company("33000167000101", "9512", "Petróleo", true)],
    ["11222333000181", company("11222333000181", "1234", "Bancos", false)],
    ["22222333000182", company("22222333000182", "5678", "Industria", true)],
  ]);
  const catalog = overrides.catalog ?? [
    stock("PETR3"),
    stock("PETR4"),
    stock("PETR4F"),
    stock("VALE3"),
    stock("TUPY3"),
    stock("CHANGED3"),
    stock("NOCNPJ3"),
    stock("BADLEN3"),
    stock("MISSING3"),
    stock("BPAC11", "unit"),
    stock("OLD3", "stock", false),
    stock("LOSTF"),
  ];
  const getProfile = vi.fn(async (ticker: string) => {
    if (overrides.profile) return overrides.profile(ticker);
    const profiles = {
      PETR3: {
        ticker: "PETR3",
        name: "Petrobras ON",
        subtype: "stock",
        active: true,
        cnpj: "33000167000101",
        changed: false,
      },
      PETR4: {
        ticker: "PETR4",
        name: "Petrobras PN",
        subtype: "stock",
        active: true,
        cnpj: "33000167000101",
        changed: false,
      },
      VALE3: {
        ticker: "VALE3",
        name: "Vale",
        subtype: "stock",
        active: true,
        cnpj: "11222333000181",
        changed: false,
      },
      TUPY3: {
        ticker: "TUPY3",
        name: "Tupy",
        subtype: "stock",
        active: true,
        cnpj: "84683374000300",
        changed: false,
      },
      CHANGED3: {
        ticker: "CHANGED3",
        name: "Changed",
        subtype: "stock",
        active: true,
        cnpj: "33000167000101",
        changed: true,
      },
      NOCNPJ3: {
        ticker: "NOCNPJ3",
        name: "No CNPJ",
        subtype: "stock",
        active: true,
        cnpj: null,
        changed: false,
      },
      BADLEN3: {
        ticker: "BADLEN3",
        name: "Bad CNPJ",
        subtype: "stock",
        active: true,
        cnpj: "123",
        changed: false,
      },
      MISSING3: {
        ticker: "MISSING3",
        name: "Not found",
        subtype: "stock",
        active: true,
        cnpj: "99999999999999",
        changed: false,
      },
    } as const;
    return profiles[ticker as keyof typeof profiles];
  });
  const brapi = {
    getCatalog: vi.fn().mockResolvedValue(catalog),
    getProfile,
  };
  const cvm = {
    getRegistry: vi
      .fn()
      .mockResolvedValue(
        overrides.cvmFailure ? Promise.reject(overrides.cvmFailure) : registry,
      ),
    getAnnualFacts: vi.fn(async (year: number) => {
      if (overrides.cvmFailure) throw overrides.cvmFailure;
      if (overrides.facts) return overrides.facts(year);
      if (year !== 2025)
        return [
          annualFact(year, "3.01", 100),
          annualFact(year, "3.11", 20),
          annualFact(year, "2.03", 100),
        ];
      return [
        annualFact(2025, "3.11", 20, 2, "a_con.csv"),
        annualFact(2025, "3.01", 100),
        annualFact(2025, "2.03", 100),
      ];
    }),
  };
  const saved: unknown[] = [];
  const repository = {
    startRun: vi.fn().mockResolvedValue("run-1"),
    saveFullSync: vi.fn(async (input) => {
      if (overrides.repositoryFailure) throw overrides.repositoryFailure;
      saved.push(input);
      return {
        persistedFactCount: overrides.persistedFactCount ?? input.facts.length,
      };
    }),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
  const service = new ScreenerSyncService(
    brapi as unknown as BrapiScreenerProvider,
    cvm,
    repository as unknown as ScreenerSyncRepository,
    () => 2026,
  );
  return { service, brapi, cvm, repository, saved, registry };
}

describe("ScreenerSyncService", () => {
  it("projects the last run with safe duration and error text", async () => {
    const repository = {
      getStatus: vi.fn().mockResolvedValue({
        hasSuccessfulSync: true,
        latestRun: {
          status: "FAILED",
          startedAt: new Date("2026-09-24T10:00:00Z"),
          completedAt: new Date("2026-09-24T10:02:00Z"),
          issuerCount: null,
          securityCount: null,
          factCount: null,
          errorCode: "CVM_DFP",
        },
      }),
    };
    const service = new ScreenerSyncService(
      undefined,
      undefined,
      repository as unknown as ScreenerSyncRepository,
    );
    await expect(service.status()).resolves.toMatchObject({
      hasSuccessfulSync: true,
      latestRun: {
        status: "FAILED",
        durationMs: 120000,
        errorMessage:
          "Não foi possível consultar as demonstrações financeiras da CVM.",
      },
    });
  });

  it("omits an error message for a successful run", async () => {
    const repository = {
      getStatus: vi.fn().mockResolvedValue({
        hasSuccessfulSync: true,
        latestRun: {
          status: "COMPLETED",
          startedAt: new Date("2026-09-24T10:00:00Z"),
          completedAt: new Date("2026-09-24T10:00:08Z"),
          issuerCount: 1,
          securityCount: 2,
          factCount: 3,
          errorCode: null,
        },
      }),
    };
    const service = new ScreenerSyncService(
      undefined,
      undefined,
      repository as unknown as ScreenerSyncRepository,
    );
    await expect(service.status()).resolves.toMatchObject({
      latestRun: { durationMs: 8000, errorMessage: null },
    });
  });
  it("handles missing, running, and unknown failed run history safely", async () => {
    const repository = { getStatus: vi.fn() };
    const service = new ScreenerSyncService(
      undefined,
      undefined,
      repository as unknown as ScreenerSyncRepository,
    );
    repository.getStatus.mockResolvedValueOnce({
      hasSuccessfulSync: false,
      latestRun: null,
    });
    await expect(service.status()).resolves.toEqual({
      hasSuccessfulSync: false,
      latestRun: null,
    });
    repository.getStatus.mockResolvedValueOnce({
      hasSuccessfulSync: false,
      latestRun: {
        status: "RUNNING",
        startedAt: new Date(Date.now() + 1000),
        completedAt: null,
        issuerCount: null,
        securityCount: null,
        factCount: null,
        errorCode: "UNEXPECTED_STAGE",
      },
    });
    await expect(service.status()).resolves.toMatchObject({
      latestRun: {
        durationMs: 0,
        errorMessage: "A sincronização foi interrompida.",
      },
    });
    repository.getStatus.mockResolvedValueOnce({
      hasSuccessfulSync: false,
      latestRun: null,
    });
    const withoutStatusRepository = new ScreenerSyncService(
      undefined,
      undefined,
      {
        startRun: vi.fn(),
        saveFullSync: vi.fn(),
        markFailed: vi.fn(),
      } as unknown as ScreenerSyncRepository,
    );
    await expect(withoutStatusRepository.status()).resolves.toEqual({
      hasSuccessfulSync: false,
      latestRun: null,
    });
  });
  it("skips a profile without data and continues to the next ticker", async () => {
    const context = setup({
      catalog: [stock("ITSA4"), stock("PETR3")],
      profile: async (ticker) =>
        ticker === "ITSA4"
          ? stock("ITSA4")
          : { ...stock("PETR3"), cnpj: "33000167000101" },
    });
    await expect(context.service.sync()).resolves.toMatchObject({
      issuers: 1,
      securities: 1,
    });
    expect(
      context.brapi.getProfile.mock.calls.map(([ticker]) => ticker),
    ).toEqual(["ITSA4", "PETR3"]);
    expect(context.saved[0]).toMatchObject({
      securities: [expect.objectContaining({ ticker: "PETR3" })],
    });
  });

  it("synchronizes exact CNPJ issuers, stock classes, fractional aliases and latest consolidated facts sequentially", async () => {
    const context = setup();
    const result = await context.service.sync();
    expect(result).toEqual({
      issuers: 2,
      securities: 4,
      fractionalAliases: 1,
      facts: 15,
      persistedFacts: 15,
      eligibleIssuers: 1,
    });
    expect(
      context.brapi.getProfile.mock.calls.map(([ticker]) => ticker),
    ).toEqual([
      "PETR3",
      "PETR4",
      "VALE3",
      "TUPY3",
      "CHANGED3",
      "NOCNPJ3",
      "BADLEN3",
      "MISSING3",
    ]);
    expect(context.cvm.getAnnualFacts.mock.calls.map(([year]) => year)).toEqual(
      [2021, 2022, 2023, 2024, 2025],
    );
    const saved = context.saved[0] as {
      issuers: CvmCompanyRecord[];
      securities: {
        ticker: string;
        issuerCnpj: string;
        baseTicker: string | null;
      }[];
      facts: ScreenerFactRecord[];
    };
    expect(saved.issuers.map((issuer) => issuer.cnpj)).toEqual([
      "33000167000101",
      "11222333000181",
    ]);
    expect(
      saved.securities.find((security) => security.ticker === "PETR4F"),
    ).toMatchObject({
      issuerCnpj: "33000167000101",
      baseTicker: "PETR4",
    });
    expect(
      saved.securities
        .filter((security) => security.baseTicker === null)
        .map((security) => security.ticker),
    ).toEqual(["PETR3", "PETR4", "VALE3"]);
    expect(
      saved.facts.find(
        (item) =>
          item.accountCode === "3.11" && item.referenceDate === "2025-12-31",
      ),
    ).toMatchObject({
      version: 2,
      sourceFile: "a_con.csv",
      sourceRow: 1,
      value: "20",
      accountCode: "3.11",
    });
    const eligibleFacts = saved.facts.filter(
      (item) => item.issuerCnpj === "33000167000101",
    );
    expect(
      calculateScreenerMetrics(
        eligibleFacts,
        null,
        new Date("2026-09-24T00:00:00Z"),
      ),
    ).toMatchObject({
      latestNetIncome: 20,
      latestRevenue: 100,
      latestEquity: 100,
      positiveProfitYears: 5,
      roe: 20,
      netMargin: 20,
      pe: null,
      pb: null,
    });
    expect({
      withNetIncome: Number(
        eligibleFacts.some((item) => item.accountCode === "3.11"),
      ),
      withEquity: Number(
        eligibleFacts.some((item) => item.accountCode === "2.03"),
      ),
      withRoe: 1,
      withNetMargin: 1,
      withPe: 0,
      withPb: 0,
    }).toEqual({
      withNetIncome: 1,
      withEquity: 1,
      withRoe: 1,
      withNetMargin: 1,
      withPe: 0,
      withPb: 0,
    });
    expect(context.repository.startRun).toHaveBeenCalledWith(
      expect.stringMatching(/^screener:/),
    );
    expect(context.repository.saveFullSync).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        catalogCount: 12,
        profileCount: 8,
      }),
    );
    expect(context.repository.markFailed).not.toHaveBeenCalled();
  });

  it("keeps the first equal-version fact when source filename and row are identical", async () => {
    const context = setup({
      facts: async (year) =>
        year === 2025
          ? [
              fact(2, "same.csv", 1),
              { ...fact(2, "same.csv", 1), value: "999" },
            ]
          : [],
    });
    await context.service.sync();
    const saved = context.saved[0] as { facts: ScreenerFactRecord[] };
    expect(saved.facts[0]?.value).toBe("20");
  });

  it("keeps a higher stored version over lower versions encountered in later archives", async () => {
    const context = setup({
      facts: async (year) =>
        year === 2021
          ? [fact(3, "high.csv", 1)]
          : year === 2025
            ? [fact(2, "low.csv", 1)]
            : [],
    });
    await context.service.sync();
    const saved = context.saved[0] as { facts: ScreenerFactRecord[] };
    expect(saved.facts[0]).toMatchObject({
      version: 3,
      sourceFile: "high.csv",
    });
  });

  it("uses source filename as a deterministic tie break for equal DFP versions", async () => {
    const context = setup({
      facts: async (year) =>
        year === 2025 ? [fact(2, "z_con.csv", 1), fact(2, "a_con.csv", 9)] : [],
    });
    await context.service.sync();
    const saved = context.saved[0] as { facts: ScreenerFactRecord[] };
    expect(saved.facts).toContainEqual(
      expect.objectContaining({
        sourceFile: "a_con.csv",
        sourceRow: 9,
        version: 2,
      }),
    );
  });

  it("keeps the first row when equal-version facts share a source file", async () => {
    const context = setup({
      facts: async (year) =>
        year === 2025 ? [fact(2, "same.csv", 2), fact(2, "same.csv", 1)] : [],
    });
    await context.service.sync();
    const saved = context.saved[0] as { facts: ScreenerFactRecord[] };
    expect(saved.facts[0]).toMatchObject({
      sourceFile: "same.csv",
      sourceRow: 1,
    });
  });

  it("keeps the first filename when the candidate tie sorts later", async () => {
    const context = setup({
      facts: async (year) =>
        year === 2025 ? [fact(2, "a_con.csv", 9), fact(2, "z_con.csv", 1)] : [],
    });
    await context.service.sync();
    const saved = context.saved[0] as { facts: ScreenerFactRecord[] };
    expect(saved.facts[0]).toMatchObject({
      sourceFile: "a_con.csv",
      sourceRow: 9,
    });
  });

  it("logs safe BRAPI profile progress and preserves the underlying failure cause", async () => {
    const externalError = new BrapiScreenerProviderError({
      endpoint: "stocks/profile",
      ticker: "PETR3",
      status: 200,
      durationMs: 125,
      errorType: "ZodError",
      failureKind: "schema_validation",
      responseShape: {
        contentType: "application/json",
        bodyBytes: 34,
        topLevelKeys: ["results"],
        resultsType: "array",
        resultsCount: 0,
      },
      validationIssues: [{ code: "too_small", path: ["results"] }],
    });
    const context = setup({
      profile: async () => Promise.reject(externalError),
    });
    const log = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    try {
      const failure = await context.service
        .sync()
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({ statusCode: 502 });
      expect((failure as Error & { cause?: unknown }).cause).toBe(
        externalError,
      );
      expect(log).toHaveBeenCalledWith(
        "screener_sync_failed",
        expect.objectContaining({
          stage: "brapi_profiles",
          errorType: "BrapiScreenerProviderError",
          profilesAttempted: 1,
          profilesTotal: 8,
          ticker: "PETR3",
          externalEndpoint: "stocks/profile",
          externalStatus: 200,
          durationMs: 125,
          externalErrorType: "ZodError",
          failureKind: "schema_validation",
          validationIssues: [{ code: "too_small", path: ["results"] }],
        }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain("secret-token");
    } finally {
      log.mockRestore();
    }
  });

  it("logs catalog stage context when the catalog response is invalid", async () => {
    const externalError = new BrapiScreenerProviderError({
      endpoint: "tickers",
      page: 1,
      status: 503,
      durationMs: 300,
      errorType: "BrapiHttpError",
      failureKind: "http",
    });
    const context = setup();
    context.brapi.getCatalog.mockRejectedValue(externalError);
    const log = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    try {
      await expect(context.service.sync()).rejects.toMatchObject({
        statusCode: 502,
        cause: externalError,
      });
      expect(log).toHaveBeenCalledWith(
        "screener_sync_failed",
        expect.objectContaining({
          stage: "brapi_catalog",
          catalogCount: 0,
          externalEndpoint: "tickers",
          externalPage: 1,
          externalStatus: 503,
          durationMs: 300,
          externalErrorType: "BrapiHttpError",
          failureKind: "http",
        }),
      );
    } finally {
      log.mockRestore();
    }
  });

  it("logs sanitized diagnostic metadata attached to an application error", async () => {
    const rateLimit = new ApplicationError("safe", 429);
    Object.defineProperty(rateLimit, "diagnostic", {
      value: {
        endpoint: "stocks/profile",
        ticker: "PETR3",
        status: 429,
        durationMs: 90,
        errorType: "BrapiRateLimitError",
        failureKind: "http",
      },
    });
    const context = setup({ profile: async () => Promise.reject(rateLimit) });
    const log = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    try {
      await expect(context.service.sync()).rejects.toBe(rateLimit);
      expect(log).toHaveBeenCalledWith(
        "screener_sync_failed",
        expect.objectContaining({
          externalEndpoint: "stocks/profile",
          externalStatus: 429,
          externalErrorType: "BrapiRateLimitError",
        }),
      );
    } finally {
      log.mockRestore();
    }
  });

  it("marks a failed BRAPI rate limit and preserves the safe application error", async () => {
    const context = setup({
      profile: async () => {
        throw new ApplicationError("A cota BRAPI terminou.", 429);
      },
    });
    await expect(context.service.sync()).rejects.toMatchObject({
      statusCode: 429,
      message: "A cota BRAPI terminou.",
    });
    expect(context.repository.markFailed).toHaveBeenCalledWith(
      "run-1",
      "BRAPI_RATE_LIMIT",
    );
    expect(context.repository.saveFullSync).not.toHaveBeenCalled();
  });

  it("marks a CVM failure and returns a sanitized application error", async () => {
    const context = setup({ cvmFailure: new Error("internal source detail") });
    await expect(context.service.sync()).rejects.toMatchObject({
      statusCode: 502,
      message:
        "A sincronização do screener falhou. Uma nova execução completa pode ser iniciada manualmente.",
    });
    expect(context.repository.markFailed).toHaveBeenCalledWith(
      "run-1",
      "CVM_REGISTRY",
    );
  });

  it("marks a persistence failure, logs audit bookkeeping failure safely, and returns a safe error", async () => {
    const context = setup({ repositoryFailure: new Error("database detail") });
    context.repository.markFailed.mockRejectedValue(
      new Error("audit write secret detail"),
    );
    const log = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    try {
      await expect(context.service.sync()).rejects.toMatchObject({
        statusCode: 502,
      });
      expect(context.repository.markFailed).toHaveBeenCalledWith(
        "run-1",
        "DATABASE_PERSIST",
      );
      expect(log).toHaveBeenCalledWith(
        "screener_sync_failure_recording_failed",
        expect.objectContaining({
          runId: "run-1",
          stage: "mark_failed",
          errorType: "Error",
        }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        "audit write secret detail",
      );
    } finally {
      log.mockRestore();
    }
  });

  it("logs an opaque mark-failed rejection without exposing its value", async () => {
    const context = setup({ repositoryFailure: new Error("database detail") });
    context.repository.markFailed.mockRejectedValue(
      "opaque bookkeeping failure",
    );
    const log = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    try {
      await expect(context.service.sync()).rejects.toMatchObject({
        statusCode: 502,
      });
      expect(log).toHaveBeenCalledWith(
        "screener_sync_failure_recording_failed",
        expect.objectContaining({ stage: "mark_failed", errorType: "unknown" }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        "opaque bookkeeping failure",
      );
    } finally {
      log.mockRestore();
    }
  });
  it("fails when the catalog had profiles but none associated to local issuers", async () => {
    const context = setup({ catalog: [stock("MISSING3")] });
    await expect(context.service.sync()).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(context.repository.saveFullSync).not.toHaveBeenCalled();
    expect(context.repository.markFailed).toHaveBeenCalledWith(
      "run-1",
      "CVM_DFP",
    );
  });

  it("fails when normalized facts have no matching persisted keys", async () => {
    const context = setup({ persistedFactCount: 0 });
    await expect(context.service.sync()).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(context.repository.saveFullSync).toHaveBeenCalledOnce();
    expect(context.repository.markFailed).toHaveBeenCalledWith(
      "run-1",
      "DATABASE_PERSIST",
    );
  });

  it("fails when only some normalized fact keys are represented after persistence", async () => {
    const context = setup({ persistedFactCount: 14 });
    await expect(context.service.sync()).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(context.repository.saveFullSync).toHaveBeenCalledOnce();
    expect(context.repository.markFailed).toHaveBeenCalledWith(
      "run-1",
      "DATABASE_PERSIST",
    );
  });

  it("counts and reports facts superseded across annual archives", async () => {
    const context = setup({
      facts: async (year) => [annualFact(2025, "3.11", year)],
    });
    const log = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    try {
      await expect(context.service.sync()).resolves.toMatchObject({
        facts: 1,
        persistedFacts: 1,
      });
      expect(log).toHaveBeenCalledWith(
        "screener_dfp_dedupe_diagnostics",
        expect.objectContaining({
          discarded: { duplicate_superseded: 4 },
        }),
      );
    } finally {
      log.mockRestore();
    }
  });

  it("supports an empty catalog and persists no inferred issuers", async () => {
    const context = setup({ catalog: [] });
    await expect(context.service.sync()).resolves.toMatchObject({
      issuers: 0,
      securities: 0,
      fractionalAliases: 0,
      facts: 0,
      eligibleIssuers: 0,
      persistedFacts: 0,
    });
    expect(context.brapi.getProfile).not.toHaveBeenCalled();
    expect(context.cvm.getAnnualFacts).toHaveBeenCalledTimes(5);
  });

  it("does not infer the issuer for an unmatched fractional alias", async () => {
    const context = setup({ catalog: [stock("LOSTF")] });
    await expect(context.service.sync()).resolves.toMatchObject({
      issuers: 0,
      securities: 0,
      fractionalAliases: 0,
      facts: 0,
      persistedFacts: 0,
    });
    expect(context.brapi.getProfile).not.toHaveBeenCalled();
  });

  it("does not hide non-application provider errors raised by BRAPI", async () => {
    const context = setup({
      profile: async () => {
        throw "unknown failure";
      },
    });
    await expect(context.service.sync()).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(context.repository.markFailed).toHaveBeenCalledWith(
      "run-1",
      "BRAPI_PROFILES",
    );
  });

  it("uses the default CVM provider and current year to parse five annual archives", async () => {
    const text = new TextEncoder();
    const cad = ["CNPJ_CIA;CD_CVM;DENOM_SOCIAL;SETOR_ATIV"].join("\n");
    const emptyDfp = zipSync({
      "company_con_dfp.csv": text.encode(
        [
          "CNPJ_CIA;CD_CVM;CD_CONTA;DS_CONTA;ORDEM_EXERC;DT_REFER;VL_CONTA;ESCALA_MOEDA;VERSAO",
        ].join("\n"),
      ),
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(text.encode(cad)))
      .mockImplementation(async () => new Response(new Uint8Array(emptyDfp)));
    vi.stubGlobal("fetch", fetcher);
    try {
      const brapi = {
        getCatalog: vi.fn().mockResolvedValue([]),
        getProfile: vi.fn(),
      };
      const repository = {
        startRun: vi.fn().mockResolvedValue("default-run"),
        saveFullSync: vi.fn().mockResolvedValue({ persistedFactCount: 0 }),
        markFailed: vi.fn().mockResolvedValue(undefined),
      };
      const service = new ScreenerSyncService(
        brapi as unknown as BrapiScreenerProvider,
        undefined,
        repository as unknown as ScreenerSyncRepository,
      );

      await expect(service.sync()).resolves.toMatchObject({
        issuers: 0,
        facts: 0,
        persistedFacts: 0,
      });
      expect(fetcher).toHaveBeenCalledTimes(6);
      expect(fetcher.mock.calls[1]?.[0]).toMatch(/dfp_cia_aberta_\d{4}\.zip$/);
      expect(repository.saveFullSync).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fails a run before persistence when no annual DFP facts normalize", async () => {
    const context = setup({ facts: async () => [] });
    const syncService = context.service as unknown as SyncServiceType;
    expect(syncService).toBe(context.service);
    await expect(context.service.sync()).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(context.cvm.getAnnualFacts.mock.calls[0]?.[0]).toBe(2021);
    expect(context.repository.saveFullSync).not.toHaveBeenCalled();
    expect(context.repository.markFailed).toHaveBeenCalledWith(
      "run-1",
      "CVM_DFP",
    );
  });
});
