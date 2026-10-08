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
  "3.09",
  "3.11",
  "2.03",
  "2.07",
  "2.08",
  "1",
  "2",
  "1.01.01",
  "2.01.04",
  "2.02.01",
]);

type CvmRow = Record<string, string>;
type Issuer = { code: string; name: string; status: string | null };
type AccountValue = {
  version: number | null;
  value: string | null;
  label: string | null;
} & (
  | { ambiguous?: false; ambiguousLabels?: never }
  | { ambiguous: true; ambiguousLabels: string[] }
);
type SelectedAccount = AccountValue & { code: string };
type PeriodAccounts = {
  accounts: Map<string, AccountValue>;
  periodStart: string | null;
  periodEnd: string;
  filingReferenceDate: string;
  exerciseOrder: "last" | "previous";
};
type AccountMap = Map<string, AccountValue>;

function normalizedDate(value: string | undefined) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value?.trim() ?? "") ? value!.trim() : null;
}

function normalizedExerciseOrder(value: string | undefined) {
  const order = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (order.includes("ULTIMO") && !order.includes("PENULTIMO")) return "last";
  if (order.includes("PENULTIMO")) return "previous";
  return null;
}

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
  const normalizedScale = scale?.trim().toUpperCase();
  const multiplier =
    normalizedScale === "MIL"
      ? 1_000
      : normalizedScale === "UNIDADE" || normalizedScale === "REAIS"
        ? 1
        : null;
  if (multiplier === null) return null;
  return (amount * multiplier).toFixed(2);
}

function normalizedPeriodBasis(
  document: "DFP" | "ITR",
  periodStart: string | null,
  periodEnd: string,
) {
  const year = periodEnd.slice(0, 4);
  if (
    document === "DFP" &&
    periodStart === `${year}-01-01` &&
    periodEnd === `${year}-12-31`
  )
    return "annual" as const;
  if (document !== "ITR" || !periodStart) return "unknown" as const;
  if (
    periodStart === `${year}-01-01` &&
    [`${year}-03-31`, `${year}-06-30`, `${year}-09-30`].includes(periodEnd)
  )
    return "year_to_date" as const;
  const quarterMonth = ["03-31", "06-30", "09-30", "12-31"].find(
    (end) => `${year}-${end}` === periodEnd,
  );
  if (!quarterMonth) return "unknown" as const;
  const quarterStart =
    quarterMonth === "03-31"
      ? `${year}-01-01`
      : quarterMonth === "06-30"
        ? `${year}-04-01`
        : quarterMonth === "09-30"
          ? `${year}-07-01`
          : `${year}-10-01`;
  return periodStart === quarterStart
    ? ("quarterly" as const)
    : ("unknown" as const);
}

function needsPriorYearLtmRoeBalances(
  annualPeriods: FundamentalPeriod[],
  itrPeriods: FundamentalPeriod[],
) {
  const usableEquity = (period: FundamentalPeriod) =>
    period.equity !== null &&
    Number.isFinite(Number(period.equity)) &&
    Boolean(period.equityVersion) &&
    Boolean(period.equityAccount) &&
    period.equityConcept === "consolidated_equity";
  const hasSupportedNetIncome = (period: FundamentalPeriod) =>
    period.netIncome !== null &&
    Number.isFinite(Number(period.netIncome)) &&
    Boolean(period.netIncomeVersion) &&
    Boolean(period.netIncomeAccount) &&
    period.netIncomeConcept === "consolidated_net_income";
  const currentFlows = itrPeriods.filter(
    (period) =>
      period.sourceDocument === "ITR" &&
      period.periodBasis === "year_to_date" &&
      period.exerciseOrder === "last" &&
      Boolean(period.periodStart) &&
      Boolean(period.periodEnd) &&
      Boolean(period.filingReferenceDate) &&
      period.periodStart === `${period.periodEnd?.slice(0, 4)}-01-01` &&
      hasSupportedNetIncome(period),
  );
  const supportedFlows = currentFlows.filter((current) => {
    const priorDate = `${Number(current.periodEnd!.slice(0, 4)) - 1}${current.periodEnd!.slice(4)}`;
    const annual = annualPeriods.filter(
      (period) =>
        period.sourceDocument === "DFP" &&
        period.periodType === "annual" &&
        period.periodBasis === "annual" &&
        period.exerciseOrder === "last" &&
        period.periodStart === `${priorDate.slice(0, 4)}-01-01` &&
        period.periodEnd === `${priorDate.slice(0, 4)}-12-31` &&
        hasSupportedNetIncome(period) &&
        period.netIncomeConcept === current.netIncomeConcept,
    );
    const comparative = itrPeriods.filter(
      (comparative) =>
        comparative.sourceDocument === "ITR" &&
        comparative.periodBasis === "year_to_date" &&
        comparative.exerciseOrder === "previous" &&
        comparative.filingReferenceDate === current.filingReferenceDate &&
        comparative.periodStart === `${priorDate.slice(0, 4)}-01-01` &&
        (comparative.periodEnd ?? comparative.referenceDate) === priorDate &&
        hasSupportedNetIncome(comparative) &&
        comparative.netIncomeVersion === current.netIncomeVersion &&
        comparative.netIncomeAccount === current.netIncomeAccount &&
        comparative.netIncomeConcept === current.netIncomeConcept,
    );
    return annual.length === 1 && comparative.length === 1;
  });
  if (supportedFlows.length === 0) return false;
  const latestSupportedFlow = supportedFlows.sort((left, right) =>
    right.periodEnd!.localeCompare(left.periodEnd!),
  )[0]!;
  const endingBalance = itrPeriods.find(
    (balance) =>
      balance.sourceDocument === "ITR" &&
      balance.exerciseOrder === "last" &&
      balance.filingReferenceDate === latestSupportedFlow.filingReferenceDate &&
      (balance.periodEnd ?? balance.referenceDate) ===
        latestSupportedFlow.periodEnd &&
      usableEquity(balance),
  );
  if (!endingBalance) return false;
  const priorDate = `${Number(latestSupportedFlow.periodEnd!.slice(0, 4)) - 1}${latestSupportedFlow.periodEnd!.slice(4)}`;
  return !itrPeriods.some(
    (opening) =>
      opening.sourceDocument === "ITR" &&
      opening.exerciseOrder === "previous" &&
      opening.filingReferenceDate === latestSupportedFlow.filingReferenceDate &&
      (opening.periodEnd ?? opening.referenceDate) === priorDate &&
      usableEquity(opening) &&
      opening.equityAccount === endingBalance.equityAccount &&
      opening.equityConcept === endingBalance.equityConcept &&
      opening.equityVersion === endingBalance.equityVersion,
  );
}

function accountValue(period: AccountMap, account: string) {
  return period.get(account)?.value ?? null;
}

function accountLabel(period: AccountMap, account: string) {
  return period.get(account)?.label ?? null;
}

function accountVersion(period: AccountMap, account: string) {
  const version = period.get(account)?.version;
  return version === null || version === undefined ? null : String(version);
}

function normalizedAccountLabel(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isExplicitlyIndividualEquityLabel(value: string) {
  return /^PATRIMONIO LIQUIDO INDIVIDUAL(?:\s|$)/.test(
    normalizedAccountLabel(value),
  );
}

function selectedAccount(
  accounts: AccountMap,
  acceptedCodes: string[],
  acceptedLabels: string[],
  ambiguityByAcceptedLabel = false,
): SelectedAccount | null {
  const acceptedAccounts = [...accounts.entries()].filter(([code]) =>
    acceptedCodes.includes(code),
  );
  if (
    acceptedAccounts.some(
      ([, account]) =>
        account.ambiguous &&
        (!ambiguityByAcceptedLabel ||
          account.ambiguousLabels.some(
            (label) => !isExplicitlyIndividualEquityLabel(label),
          )),
    )
  )
    return null;
  const candidates = acceptedAccounts
    .filter(
      ([, account]) =>
        !account.ambiguous &&
        acceptedLabels.includes(
          normalizedAccountLabel(account.label ?? undefined),
        ),
    )
    .map(([code, account]) => ({ ...account, code }));
  return candidates.length === 1 ? candidates[0]! : null;
}

const consolidatedNetIncomeLabels = [
  "LUCRO/PREJUIZO CONSOLIDADO DO PERIODO",
  "LUCRO OU PREJUIZO CONSOLIDADO DO PERIODO",
  "LUCRO OU PREJUIZO LIQUIDO CONSOLIDADO DO PERIODO",
];
const consolidatedEquityLabels = ["PATRIMONIO LIQUIDO CONSOLIDADO"];

function sumAccountValues(period: AccountMap, accounts: string[]) {
  const values = accounts.map((account) => accountValue(period, account));
  if (values.some((value) => value === null)) return null;
  return (values as string[])
    .reduce((total, value) => total + Number(value), 0)
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
    pending = lines.pop()!;
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
          const exerciseOrder = normalizedExerciseOrder(row.ORDEM_EXERC);
          if (
            !exerciseOrder ||
            (document === "DFP" && exerciseOrder !== "last")
          )
            return;
          latestPeriodMatches += 1;
          if (!requiredAccounts.has(row.CD_CONTA ?? "")) return;
          requiredAccountMatches += 1;
          const filingReferenceDate = normalizedDate(row.DT_REFER);
          const periodEnd =
            normalizedDate(row.DT_FIM_EXERC) ?? filingReferenceDate;
          const periodStart = normalizedDate(row.DT_INI_EXERC);
          if (!filingReferenceDate || !periodEnd) return;
          const parsedVersion = Number(row.VERSAO ?? "");
          const version = Number.isFinite(parsedVersion) ? parsedVersion : null;
          const periodKey = `${periodEnd}:${periodStart}:${exerciseOrder}:${filingReferenceDate}`;
          const period = periods.get(periodKey) ?? {
            accounts: new Map<string, AccountValue>(),
            periodStart,
            periodEnd,
            filingReferenceDate,
            exerciseOrder,
          };
          const current = period.accounts.get(row.CD_CONTA);
          if (
            !current ||
            (version !== null &&
              (current.version === null || version > current.version))
          ) {
            period.accounts.set(row.CD_CONTA, {
              version,
              value: normalizedValue(row.VL_CONTA, row.ESCALA_MOEDA),
              label: row.DS_CONTA ?? null,
            });
            periods.set(periodKey, period);
          } else if (version === current.version) {
            const rowLabel = row.DS_CONTA ?? "";
            const rowValue = normalizedValue(row.VL_CONTA, row.ESCALA_MOEDA);
            if (current.ambiguous) {
              const labels = current.ambiguousLabels;
              if (
                !labels.some(
                  (label) =>
                    normalizedAccountLabel(label) ===
                    normalizedAccountLabel(rowLabel),
                )
              ) {
                period.accounts.set(row.CD_CONTA, {
                  ...current,
                  ambiguousLabels: [...labels, rowLabel],
                });
                periods.set(periodKey, period);
              }
            } else if (
              current.value !== rowValue ||
              normalizedAccountLabel(current.label ?? undefined) !==
                normalizedAccountLabel(rowLabel)
            ) {
              period.accounts.set(row.CD_CONTA, {
                ...current,
                value: null,
                label: null,
                ambiguous: true,
                ambiguousLabels: [current.label ?? "", rowLabel],
              });
              periods.set(periodKey, period);
            }
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
          pending += decoder.decode(data, { stream: !final });
          const lines = pending.split(/\r?\n/);
          pending = lines.pop()!;
          lines.forEach(consume);
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
    const latestByPeriod = new Map<string, PeriodAccounts>();
    for (const period of periods.values()) {
      const key = `${period.periodEnd}:${period.periodStart}:${period.exerciseOrder}`;
      const existing = latestByPeriod.get(key);
      if (
        !existing ||
        existing.filingReferenceDate < period.filingReferenceDate
      )
        latestByPeriod.set(key, period);
    }
    return [...latestByPeriod.values()].map(
      ({
        accounts,
        periodStart,
        periodEnd,
        filingReferenceDate,
        exerciseOrder,
      }) => {
        const netIncome = selectedAccount(
          accounts,
          ["3.09", "3.11"],
          consolidatedNetIncomeLabels,
        );
        const equity = selectedAccount(
          accounts,
          ["2.03", "2.07", "2.08"],
          consolidatedEquityLabels,
          true,
        );
        return {
          referenceDate: periodEnd,
          periodStart,
          periodEnd,
          periodType:
            document === "DFP" ? ("annual" as const) : ("interim" as const),
          sourceDocument: document,
          exerciseOrder,
          filingReferenceDate,
          periodBasis: normalizedPeriodBasis(document, periodStart, periodEnd),
          isDerived: false,
          revenueVersion: accountVersion(accounts, "3.01"),
          revenueAccountLabel: accountLabel(accounts, "3.01"),
          netIncomeVersion:
            netIncome?.version === null || netIncome === null
              ? null
              : String(netIncome.version),
          netIncomeAccount: netIncome?.code ?? null,
          netIncomeConcept: netIncome ? "consolidated_net_income" : null,
          equityVersion:
            equity?.version === null || equity === null
              ? null
              : String(equity.version),
          equityAccount: equity?.code ?? null,
          equityConcept: equity ? "consolidated_equity" : null,
          revenue: accountValue(accounts, "3.01"),
          netIncome: netIncome?.value ?? null,
          equity: equity?.value ?? null,
          assets: accountValue(accounts, "1"),
          liabilities: accountValue(accounts, "2"),
          cash: accountValue(accounts, "1.01.01"),
          debt: sumAccountValues(accounts, ["2.01.04", "2.02.01"]),
        };
      },
    );
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
    const previousQuarterly = needsPriorYearLtmRoeBalances(annual, quarterly)
      ? await this.readDocument(
          "ITR",
          currentYear - 1,
          normalizedCnpj,
          issuer.code,
          ticker,
        ).catch((error) => {
          logger.warn("stock_fundamentals_cvm_prior_itr_unavailable", {
            ticker,
            cnpj: normalizedCnpj,
            error,
          });
          return [];
        })
      : [];
    const latestByPeriod = new Map<string, FundamentalPeriod>();
    for (const period of [...annual, ...quarterly, ...previousQuarterly]) {
      const key = [
        period.sourceDocument,
        period.periodStart ?? "",
        period.periodEnd ?? period.referenceDate,
        period.exerciseOrder,
      ].join(":");
      const existing = latestByPeriod.get(key);
      if (!existing) {
        latestByPeriod.set(key, period);
        continue;
      }
      const filingReferenceDate = period.filingReferenceDate ?? "";
      const existingFilingReferenceDate = existing.filingReferenceDate ?? "";
      if (filingReferenceDate > existingFilingReferenceDate)
        latestByPeriod.set(key, period);
    }
    const periods = [...latestByPeriod.values()].sort((left, right) =>
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
