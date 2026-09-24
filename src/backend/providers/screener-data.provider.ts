import { Unzip, UnzipInflate } from "fflate";
import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";

export type BrapiRequestDiagnostic = {
  endpoint: "tickers" | "stocks/profile";
  status: number | null;
  durationMs: number;
  errorType: string;
  failureKind: "http" | "json_decode" | "schema_validation" | "network";
  responseShape?: {
    contentType: string | null;
    bodyBytes?: number;
    topLevelKeys?: string[];
    resultsType?: string;
    resultsCount?: number;
    firstResultKeys?: string[];
    dataType?: string;
    dataKeys?: string[];
  };
  validationIssues?: Array<{
    code: string;
    path: (string | number)[];
  }>;
  page?: number;
  ticker?: string;
};

export class BrapiScreenerProviderError extends Error {
  constructor(
    readonly diagnostic: BrapiRequestDiagnostic,
    cause?: unknown,
  ) {
    super("BRAPI Screener request failed", { cause });
    this.name = "BrapiScreenerProviderError";
  }
}

function describeResponseShape(payload: unknown, contentType: string | null) {
  if (!payload || typeof payload !== "object") {
    return { contentType, topLevelKeys: [], resultsType: typeof payload };
  }
  const record = payload as Record<string, unknown>;
  const results = record.results;
  const first = Array.isArray(results) ? results[0] : undefined;
  const firstRecord =
    first && typeof first === "object"
      ? (first as Record<string, unknown>)
      : undefined;
  const data = firstRecord?.data;
  return {
    contentType,
    bodyBytes: new TextEncoder().encode(JSON.stringify(payload)).byteLength,
    topLevelKeys: Object.keys(record),
    resultsType: Array.isArray(results) ? "array" : typeof results,
    ...(Array.isArray(results) ? { resultsCount: results.length } : {}),
    ...(firstRecord ? { firstResultKeys: Object.keys(firstRecord) } : {}),
    ...(data === undefined
      ? {}
      : {
          dataType: data === null ? "null" : typeof data,
          ...(data && typeof data === "object"
            ? { dataKeys: Object.keys(data) }
            : {}),
        }),
  };
}

function sanitizeValidationIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path as (string | number)[],
  }));
}

const cvmBaseUrl = "https://dados.cvm.gov.br/dados/CIA_ABERTA";
const brapiBaseUrl = "https://brapi.dev/api/v2";
const csvAccounts = new Set(["3.01", "3.11", "2.03"]);

export type CvmCompanyRecord = {
  cnpj: string;
  cvmCode: string;
  name: string;
  sector: string | null;
  quantitativeEligible: boolean;
};

export type BrapiStock = {
  ticker: string;
  name: string;
  subtype: string;
  active: boolean;
  cnpj: string | null;
  changed: boolean;
};

export type ScreenerFactRecord = {
  issuerCnpj: string;
  referenceDate: string;
  accountCode: string;
  accountLabel: string | null;
  value: string;
  documentType: "DFP";
  statementScope: "CONSOLIDATED";
  exerciseOrder: "ULTIMO";
  version: number;
  sourceFile: string;
  sourceRow: number;
};

export type CvmRegistry = Map<string, CvmCompanyRecord>;

const catalogEntrySchema = z
  .object({
    stock: z.string().optional(),
    symbol: z.string().optional(),
    ticker: z.string().optional(),
    name: z.string().optional().default(""),
    type: z.string().optional().default(""),
    subType: z.string().optional(),
    subtype: z.string().optional(),
    isActive: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .passthrough();

const catalogSchema = z
  .object({
    results: z.array(catalogEntrySchema).optional(),
    stocks: z.array(catalogEntrySchema).optional(),
    pagination: z
      .object({
        hasNextPage: z.boolean().optional(),
        currentPage: z.number().optional(),
        totalPages: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const profileSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            symbol: z.string().optional(),
            data: z
              .object({
                cnpj: z.string().nullable().optional(),
                longName: z.string().nullable().optional(),
                shortName: z.string().nullable().optional(),
              })
              .passthrough()
              .nullable(),
            changed: z.boolean().optional().default(false),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

function normalizeCnpj(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ";" && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
}

function normalizeSector(value: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const validatedNonFinancialSectors = new Set([
  "PETROLEO",
  "PETROLEO GAS E BIOCOMBUSTIVEIS",
  "MINERACAO",
  "CONSUMO CICLICO",
]);

export function isQuantitativelyEligibleSector(sector: string | null) {
  return validatedNonFinancialSectors.has(normalizeSector(sector));
}

function isValidatedFinancialAccountLabel(accountCode: string, label: string) {
  const normalized = normalizeSector(label)
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  if (accountCode === "3.01")
    return normalized.startsWith("RECEITA DE VENDA DE BENS");
  if (accountCode === "3.11")
    return new Set([
      "LUCRO PREJUIZO DO PERIODO",
      "LUCRO PREJUIZO CONSOLIDADO DO PERIODO",
    ]).has(normalized);
  return accountCode === "2.03" && normalized.startsWith("PATRIMONIO LIQUIDO");
}

export async function readCvmRegistry(
  fetcher: typeof fetch = fetch,
): Promise<CvmRegistry> {
  const response = await fetcher(`${cvmBaseUrl}/CAD/DADOS/cad_cia_aberta.csv`);
  if (!response.ok)
    throw new Error(`CVM CAD request failed: ${response.status}`);
  if (!response.body) throw new Error("CVM CAD response has no body");
  const registry: CvmRegistry = new Map();
  const reader = response.body.getReader();
  const decoder = new TextDecoder("iso-8859-1");
  let pending = "";
  let header: string[] | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop()!;
    for (const line of lines) {
      if (!header) {
        header = parseCsvLine(line);
        continue;
      }
      const row = Object.fromEntries(
        parseCsvLine(line).map((cell, index) => [header![index] ?? "", cell]),
      );
      const cnpj = normalizeCnpj(row.CNPJ_CIA);
      const cvmCode = row.CD_CVM?.trim() ?? "";
      if (cnpj.length !== 14 || !cvmCode) continue;
      const sector = row.SETOR_ATIV?.trim() || null;
      registry.set(cnpj, {
        cnpj,
        cvmCode,
        name: row.DENOM_SOCIAL?.trim() || "",
        sector,
        quantitativeEligible: isQuantitativelyEligibleSector(sector),
      });
    }
  }
  pending += decoder.decode();
  if (pending && header) {
    const row = Object.fromEntries(
      parseCsvLine(pending).map((cell, index) => [header![index] ?? "", cell]),
    );
    const cnpj = normalizeCnpj(row.CNPJ_CIA);
    const cvmCode = row.CD_CVM?.trim() ?? "";
    if (cnpj.length === 14 && cvmCode) {
      const sector = row.SETOR_ATIV?.trim() || null;
      registry.set(cnpj, {
        cnpj,
        cvmCode,
        name: row.DENOM_SOCIAL?.trim() || "",
        sector,
        quantitativeEligible: isQuantitativelyEligibleSector(sector),
      });
    }
  }
  return registry;
}

function parseBrazilianAmount(value: string, scale: string) {
  if (value.trim() === "") return null;
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value.trim();
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return (amount * (scale.trim().toUpperCase() === "MIL" ? 1000 : 1)).toFixed(
    2,
  );
}

function normalizedExerciseOrder(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function compareFactTie(left: ScreenerFactRecord, right: ScreenerFactRecord) {
  if (left.version !== right.version) return left.version > right.version;
  if (left.sourceFile !== right.sourceFile)
    return left.sourceFile.localeCompare(right.sourceFile) < 0;
  return left.sourceRow < right.sourceRow;
}

function addLineDecoder(onLine: (line: string) => void) {
  let pending = "";
  const decoder = new TextDecoder("iso-8859-1");
  return {
    push(bytes: Uint8Array, final: boolean) {
      pending += decoder.decode(bytes, { stream: !final });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop()!;
      for (const line of lines) onLine(line);
      if (final && pending) onLine(pending);
      if (final) pending = "";
    },
  };
}

export async function parseDfpResponse(
  response: Response,
  year: number,
  registryByCvmCode: Map<string, string>,
): Promise<ScreenerFactRecord[]> {
  if (!response.ok)
    throw new Error(`CVM DFP request failed: ${response.status}`);
  if (!response.body) throw new Error("CVM DFP response has no body");
  const best = new Map<string, ScreenerFactRecord>();
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  let readerDone = false;
  let activeFiles = 0;
  let relevantFiles = 0;
  let settled = false;
  let rejectPromise: ((error: unknown) => void) | undefined;
  let resolvePromise: (() => void) | undefined;
  const complete = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const settle = () => {
    if (!settled && readerDone && activeFiles === 0) {
      settled = true;
      resolvePromise!();
    }
  };
  unzip.onfile = (file) => {
    if (!file.name.includes("_con_") || !file.name.endsWith(".csv")) {
      file.ondata = () => undefined;
      file.start();
      return;
    }
    activeFiles += 1;
    relevantFiles += 1;
    let header: string[] | null = null;
    let sourceRow = 0;
    const decoder = addLineDecoder((line) => {
      if (!header) {
        header = parseCsvLine(line);
        return;
      }
      sourceRow += 1;
      const cells = parseCsvLine(line);
      const row = Object.fromEntries(
        cells.map((cell, index) => [header![index] ?? "", cell]),
      );
      const cnpj = normalizeCnpj(row.CNPJ_CIA);
      const issuerCnpj = cnpj.length === 14 ? cnpj : null;
      const cvmCode = row.CD_CVM?.trim() ?? "";
      if (!issuerCnpj || registryByCvmCode.get(cvmCode) !== issuerCnpj) return;
      if (!csvAccounts.has(row.CD_CONTA ?? "")) return;
      if (!isValidatedFinancialAccountLabel(row.CD_CONTA!, row.DS_CONTA ?? ""))
        return;
      if (normalizedExerciseOrder(row.ORDEM_EXERC ?? "") !== "ULTIMO") return;
      const referenceDate = row.DT_REFER?.trim() ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) return;
      const referenceYear = Number(referenceDate.slice(0, 4));
      if (referenceYear < year - 4 || referenceYear > year) return;
      const value = parseBrazilianAmount(
        row.VL_CONTA ?? "",
        row.ESCALA_MOEDA ?? "",
      );
      if (value === null) return;
      const versionValue = Number(row.VERSAO ?? "0");
      const fact: ScreenerFactRecord = {
        issuerCnpj,
        referenceDate,
        accountCode: row.CD_CONTA,
        accountLabel: row.DS_CONTA!.trim(),
        value,
        documentType: "DFP",
        statementScope: "CONSOLIDATED",
        exerciseOrder: "ULTIMO",
        version: Number.isFinite(versionValue) ? versionValue : 0,
        sourceFile: file.name,
        sourceRow,
      };
      const key = [issuerCnpj, referenceDate, fact.accountCode].join(":");
      const current = best.get(key);
      if (!current || compareFactTie(fact, current)) best.set(key, fact);
    });
    file.ondata = (error, data, final) => {
      if (settled) return;
      if (error) {
        settled = true;
        rejectPromise!(error);
        return;
      }
      decoder.push(data, final);
      if (final) {
        activeFiles -= 1;
        settle();
      }
    };
    file.start();
  };
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      unzip.push(value, false);
    }
    unzip.push(new Uint8Array(), true);
    readerDone = true;
    settle();
  } catch (error) {
    if (!settled) {
      settled = true;
      rejectPromise!(error);
    }
  }
  await complete;
  if (relevantFiles === 0)
    throw new Error("CVM DFP archive contained no consolidated CSV");
  return [...best.values()];
}

function retryAfterMilliseconds(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

const sleep = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
};

export class BrapiScreenerProvider {
  private readonly token: string | undefined;

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    token = process.env.BRAPI_TOKEN,
    private readonly wait: (milliseconds: number) => Promise<void> = sleep,
  ) {
    this.token = token?.trim() || undefined;
  }

  private async request(
    url: string,
    endpoint: BrapiRequestDiagnostic["endpoint"],
    context: { ticker?: string; page?: number } = {},
  ): Promise<{
    payload: unknown;
    status: number;
    durationMs: number;
    contentType: string | null;
  }> {
    if (!this.token)
      throw new ApplicationError(
        "BRAPI_TOKEN não está configurado no servidor.",
        503,
      );
    const startedAt = Date.now();
    const fetchOptions = {
      headers: { Authorization: `Bearer ${this.token}` },
      cache: "no-store" as const,
    };
    let response: Response;
    try {
      response = await this.fetcher(url, fetchOptions);
    } catch (cause) {
      throw new BrapiScreenerProviderError(
        {
          endpoint,
          ...context,
          status: null,
          durationMs: Date.now() - startedAt,
          errorType: cause instanceof Error ? cause.name : "unknown",
          failureKind: "network",
        },
        cause,
      );
    }
    let remainingHeader = response.headers.get("ratelimit-remaining");
    let remaining =
      remainingHeader === null ? Number.NaN : Number(remainingHeader);
    let retriedRateLimit = false;
    if (response.status === 429) {
      const delay = retryAfterMilliseconds(response.headers.get("retry-after"));
      if (delay !== null && delay > 0) {
        retriedRateLimit = true;
        await this.wait(delay);
        try {
          response = await this.fetcher(url, fetchOptions);
        } catch (cause) {
          throw new BrapiScreenerProviderError(
            {
              endpoint,
              ...context,
              status: null,
              durationMs: Date.now() - startedAt,
              errorType: cause instanceof Error ? cause.name : "unknown",
              failureKind: "network",
            },
            cause,
          );
        }
        remainingHeader = response.headers.get("ratelimit-remaining");
        remaining =
          remainingHeader === null ? Number.NaN : Number(remainingHeader);
      }
    }
    const contentType = response.headers.get("content-type");
    const makeDiagnostic = (
      failureKind: BrapiRequestDiagnostic["failureKind"],
      errorType: string,
      responseShape?: BrapiRequestDiagnostic["responseShape"],
    ): BrapiRequestDiagnostic => ({
      endpoint,
      ...context,
      status: response.status,
      durationMs: Date.now() - startedAt,
      errorType,
      failureKind,
      ...(responseShape ? { responseShape } : {}),
    });
    if (Number.isFinite(remaining) && remaining <= 0) {
      const error = new ApplicationError("A cota BRAPI terminou.", 429);
      Object.defineProperty(error, "diagnostic", {
        value: makeDiagnostic("http", "BrapiRateLimitError"),
      });
      throw error;
    }
    if (!response.ok) {
      if (response.status === 429 || retriedRateLimit) {
        const error = new ApplicationError(
          "A BRAPI limitou as consultas.",
          429,
        );
        Object.defineProperty(error, "diagnostic", {
          value: makeDiagnostic("http", "BrapiRateLimitError"),
        });
        throw error;
      }
      let responseShape: BrapiRequestDiagnostic["responseShape"];
      try {
        const body = await response.clone().json();
        responseShape = describeResponseShape(body, contentType);
      } catch {
        responseShape = { contentType };
      }
      throw new BrapiScreenerProviderError(
        makeDiagnostic("http", "BrapiHttpError", responseShape),
      );
    }
    try {
      return {
        payload: await response.json(),
        status: response.status,
        durationMs: Date.now() - startedAt,
        contentType,
      };
    } catch (cause) {
      throw new BrapiScreenerProviderError(
        makeDiagnostic(
          "json_decode",
          cause instanceof Error ? cause.name : "unknown",
        ),
        cause,
      );
    }
  }

  async getCatalog(): Promise<BrapiStock[]> {
    const securities = new Map<string, BrapiStock>();
    for (let page = 1; page <= 100; page += 1) {
      const url = brapiBaseUrl + "/tickers?type=stock&limit=2000&page=" + page;
      const response = await this.request(url, "tickers", { page });
      let payload: z.infer<typeof catalogSchema>;
      try {
        payload = catalogSchema.parse(response.payload);
      } catch (cause) {
        const validationError = cause as z.ZodError;
        throw new BrapiScreenerProviderError(
          {
            endpoint: "tickers",
            page,
            status: response.status,
            durationMs: response.durationMs,
            errorType: validationError.name,
            failureKind: "schema_validation",
            responseShape: describeResponseShape(
              response.payload,
              response.contentType,
            ),
            validationIssues: sanitizeValidationIssues(validationError),
          },
          cause,
        );
      }
      const entries = payload.results ?? payload.stocks ?? [];
      if (entries.length === 0 && page === 1)
        throw new Error("BRAPI catalog response did not contain results");
      for (const entry of entries) {
        const ticker = entry.stock ?? entry.symbol ?? entry.ticker;
        const subtype = entry.subType ?? entry.subtype;
        const active = entry.isActive ?? entry.active ?? false;
        if (!ticker || !active || subtype !== "stock") continue;
        securities.set(ticker, {
          ticker,
          name: entry.name,
          subtype,
          active: true,
          cnpj: null,
          changed: false,
        });
      }
      const hasNextPage =
        payload.pagination?.hasNextPage ??
        (payload.pagination?.totalPages !== undefined
          ? (payload.pagination.currentPage ?? page) <
            payload.pagination.totalPages
          : entries.length === 2000);
      if (!hasNextPage) return [...securities.values()];
    }
    throw new Error("BRAPI catalog exceeded the 100-page safety limit");
  }

  async getProfile(ticker: string): Promise<BrapiStock> {
    const symbol = encodeURIComponent(ticker);
    const response = await this.request(
      `${brapiBaseUrl}/stocks/profile?symbols=${symbol}`,
      "stocks/profile",
      { ticker },
    );
    let payload: z.infer<typeof profileSchema>;
    try {
      payload = profileSchema.parse(response.payload);
    } catch (cause) {
      const validationError = cause as z.ZodError;
      throw new BrapiScreenerProviderError(
        {
          endpoint: "stocks/profile",
          ticker,
          status: response.status,
          durationMs: response.durationMs,
          errorType: validationError.name,
          failureKind: "schema_validation",
          responseShape: describeResponseShape(
            response.payload,
            response.contentType,
          ),
          validationIssues: sanitizeValidationIssues(validationError),
        },
        cause,
      );
    }
    const result = payload.results[0]!;
    return {
      ticker: result.symbol ?? ticker,
      name: result.data?.longName ?? result.data?.shortName ?? ticker,
      subtype: "stock",
      active: true,
      cnpj: normalizeCnpj(result.data?.cnpj) || null,
      changed: result.changed,
    };
  }
}

export class CvmDfpProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async getAnnualFacts(year: number, registryByCvmCode: Map<string, string>) {
    const url = `${cvmBaseUrl}/DOC/DFP/DADOS/dfp_cia_aberta_${year}.zip`;
    const response = await this.fetcher(url);
    return parseDfpResponse(response, year, registryByCvmCode);
  }
}
