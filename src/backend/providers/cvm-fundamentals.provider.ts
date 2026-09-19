import { Unzip, UnzipInflate } from "fflate";
import { ApplicationError } from "@/backend/errors/application-error";
import { logger } from "@/infrastructure/logging/logger";
import type {
  FundamentalPeriod,
  FundamentalsProvider,
} from "./fundamentals.provider";

const cvmBaseUrl = "https://dados.cvm.gov.br/dados/CIA_ABERTA";
const requiredAccounts = new Set([
  "3.01",
  "3.11",
  "2.03",
  "1",
  "2",
  "1.01.01",
  "2.01.04",
  "2.02.01",
]);

type CvmRow = Record<string, string>;
type Issuer = { code: string; name: string; status: string | null };
type AccountValue = { version: number; value: string | null };
type PeriodAccounts = Map<string, AccountValue>;

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += character;
        index += 1;
      } else quoted = !quoted;
    } else if (character === ";" && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += character;
  }
  cells.push(cell);
  return cells;
}

function rowFromLine(header: string[], line: string): CvmRow {
  return Object.fromEntries(
    splitCsvLine(line).map((cell, index) => [header[index] ?? "", cell]),
  );
}

function normalizeCnpj(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeCvmCode(value: string | undefined) {
  const numeric = Number(value?.trim());
  return Number.isFinite(numeric) ? String(numeric) : (value?.trim() ?? "");
}

function normalizedValue(value: string | undefined, scale: string | undefined) {
  if (!value) return null;
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  const multiplier = scale?.trim().toUpperCase() === "MIL" ? 1_000 : 1;
  return (amount * multiplier).toFixed(2);
}

function accountValue(period: PeriodAccounts, account: string) {
  return period.get(account)?.value ?? null;
}

function sumAccountValues(period: PeriodAccounts, accounts: string[]) {
  const values = accounts.map((account) => accountValue(period, account));
  if (values.every((value) => value === null)) return null;
  return values
    .reduce((total, value) => total + Number(value ?? 0), 0)
    .toFixed(2);
}

async function streamResponse(
  response: Response,
  onLine: (line: string) => void,
) {
  if (!response.body) throw new Error("CVM response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("iso-8859-1");
  let pending = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    lines.forEach(onLine);
  }
  pending += decoder.decode();
  if (pending) onLine(pending);
}

export class CvmFundamentalsProvider implements FundamentalsProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  private async resolveIssuer(cnpj: string, ticker: string) {
    const response = await this.fetcher(
      `${cvmBaseUrl}/CAD/DADOS/cad_cia_aberta.csv`,
    );
    if (!response.ok)
      throw new Error(`CVM CAD request failed: ${response.status}`);
    let header: string[] | null = null;
    let issuer: Issuer | null = null;
    await streamResponse(response, (line) => {
      if (!header) {
        header = splitCsvLine(line);
        return;
      }
      const row = rowFromLine(header, line);
      if (normalizeCnpj(row.CNPJ_CIA ?? "") !== cnpj) return;
      issuer = {
        code: row.CD_CVM ?? "",
        name: row.DENOM_SOCIAL ?? "",
        status: row.SIT ?? null,
      };
    });
    const resolvedIssuer = issuer as Issuer | null;
    if (!resolvedIssuer?.code)
      throw new ApplicationError(
        "A companhia identificada para o ativo não foi encontrada no cadastro da CVM.",
        404,
      );
    logger.info("stock_fundamentals_cvm_issuer_resolved", {
      ticker,
      cnpj,
      cvmCode: resolvedIssuer.code,
      status: resolvedIssuer.status,
    });
    return resolvedIssuer;
  }

  private async readDocument(
    document: "DFP" | "ITR",
    year: number,
    cnpj: string,
    cvmCode: string,
    ticker: string,
  ): Promise<FundamentalPeriod[]> {
    const url = `${cvmBaseUrl}/DOC/${document}/DADOS/${document.toLowerCase()}_cia_aberta_${year}.zip`;
    const startedAt = Date.now();
    logger.info("stock_fundamentals_cvm_document_started", {
      ticker,
      document,
      year,
    });
    const response = await this.fetcher(url);
    if (!response.ok)
      throw new Error(`CVM ${document} request failed: ${response.status}`);
    if (!response.body) throw new Error(`CVM ${document} response has no body`);

    const periods = new Map<string, PeriodAccounts>();
    let matchedRows = 0;
    let cnpjMatches = 0;
    let cvmCodeMatches = 0;
    let latestPeriodMatches = 0;
    let requiredAccountMatches = 0;
    let completedFiles = 0;
    const unzip = new Unzip();
    unzip.register(UnzipInflate);
    await new Promise<void>(async (resolve, reject) => {
      let readerDone = false;
      let activeFiles = 0;
      let settled = false;
      const settle = () => {
        if (!settled && readerDone && activeFiles === 0) {
          settled = true;
          resolve();
        }
      };
      unzip.onfile = (file) => {
        const relevant =
          file.name.includes("_con_") && file.name.endsWith(".csv");
        if (!relevant) {
          file.ondata = () => undefined;
          file.start();
          return;
        }
        activeFiles += 1;
        let header: string[] | null = null;
        let pending = "";
        const decoder = new TextDecoder("iso-8859-1");
        const consume = (line: string) => {
          if (!header) {
            header = splitCsvLine(line);
            return;
          }
          const row = rowFromLine(header, line);
          if (normalizeCnpj(row.CNPJ_CIA ?? "") !== cnpj) return;
          cnpjMatches += 1;
          if (normalizeCvmCode(row.CD_CVM) !== normalizeCvmCode(cvmCode))
            return;
          cvmCodeMatches += 1;
          if (row.ORDEM_EXERC !== "ÚLTIMO") return;
          latestPeriodMatches += 1;
          if (!requiredAccounts.has(row.CD_CONTA ?? "")) return;
          requiredAccountMatches += 1;
          const referenceDate = row.DT_REFER;
          if (!referenceDate) return;
          const version = Number(row.VERSAO ?? "0");
          const key = `${referenceDate}:${row.CD_CONTA}`;
          const period =
            periods.get(referenceDate) ?? new Map<string, AccountValue>();
          const current = period.get(row.CD_CONTA);
          if (!current || version >= current.version) {
            period.set(row.CD_CONTA, {
              version: Number.isFinite(version) ? version : 0,
              value: normalizedValue(row.VL_CONTA, row.ESCALA_MOEDA),
            });
            periods.set(referenceDate, period);
          }
          matchedRows += 1;
        };
        file.ondata = (error, data, final) => {
          if (settled) return;
          if (error) {
            settled = true;
            reject(error);
            return;
          }
          if (data) {
            pending += decoder.decode(data, { stream: !final });
            const lines = pending.split(/\r?\n/);
            pending = lines.pop() ?? "";
            lines.forEach(consume);
          }
          if (final) {
            pending += decoder.decode();
            if (pending) consume(pending);
            completedFiles += 1;
            activeFiles -= 1;
            settle();
          }
        };
        file.start();
      };
      try {
        const reader = response.body!.getReader();
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
          reject(error);
        }
      }
    });
    logger.info("stock_fundamentals_cvm_document_completed", {
      ticker,
      document,
      year,
      matchedRows,
      cnpjMatches,
      cvmCodeMatches,
      latestPeriodMatches,
      requiredAccountMatches,
      completedFiles,
      periods: periods.size,
      durationMs: Date.now() - startedAt,
    });
    return [...periods.entries()].map(([referenceDate, accounts]) => ({
      referenceDate,
      periodType:
        document === "DFP" ? ("annual" as const) : ("interim" as const),
      sourceDocument: document,
      revenue: accountValue(accounts, "3.01"),
      netIncome: accountValue(accounts, "3.11"),
      equity: accountValue(accounts, "2.03"),
      assets: accountValue(accounts, "1"),
      liabilities: accountValue(accounts, "2"),
      cash: accountValue(accounts, "1.01.01"),
      debt: sumAccountValues(accounts, ["2.01.04", "2.02.01"]),
    }));
  }

  async getByTicker({ ticker, cnpj }: { ticker: string; cnpj: string | null }) {
    if (!cnpj)
      throw new ApplicationError(
        "Não foi possível associar o ativo a uma companhia registrada na CVM.",
        422,
      );
    const normalizedCnpj = normalizeCnpj(cnpj);
    const issuer = await this.resolveIssuer(normalizedCnpj, ticker);
    const currentYear = new Date().getUTCFullYear();
    const annual = await this.readDocument(
      "DFP",
      currentYear - 1,
      normalizedCnpj,
      issuer.code,
      ticker,
    );
    const previousAnnual = await Promise.all(
      [currentYear - 2, currentYear - 3].map((year) =>
        this.readDocument(
          "DFP",
          year,
          normalizedCnpj,
          issuer.code,
          ticker,
        ).catch(() => []),
      ),
    );
    annual.push(...previousAnnual.flat());
    const quarterly = await this.readDocument(
      "ITR",
      currentYear,
      normalizedCnpj,
      issuer.code,
      ticker,
    ).catch((error) => {
      logger.warn("stock_fundamentals_cvm_itr_unavailable", {
        ticker,
        cnpj: normalizedCnpj,
        error,
      });
      return [];
    });
    const periods = [...annual, ...quarterly].sort((left, right) =>
      right.referenceDate.localeCompare(left.referenceDate),
    );
    if (!periods.length)
      throw new ApplicationError(
        "A CVM não disponibilizou demonstrativos para a companhia identificada.",
        404,
      );
    logger.info("stock_fundamentals_cvm_normalized", {
      ticker,
      cnpj: normalizedCnpj,
      cvmCode: issuer.code,
      periods: periods.length,
    });
    return periods;
  }
}
