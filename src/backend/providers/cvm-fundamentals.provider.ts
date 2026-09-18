import { unzipSync } from "fflate";
import type {
  FundamentalPeriod,
  FundamentalsProvider,
} from "./fundamentals.provider";

const accounts = {
  revenue: "3.01",
  netIncome: "3.11",
  equity: "2.03",
  assets: "1",
  liabilities: "2",
  cash: "1.01.01",
  debtCurrent: "2.01.04",
  debtNonCurrent: "2.02.01",
} as const;

type CvmRow = Record<string, string>;

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

function parseCsv(text: string): CvmRow[] {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const columns = splitCsvLine(header);
  return lines.map((line) =>
    Object.fromEntries(
      splitCsvLine(line).map((cell, index) => [columns[index], cell]),
    ),
  );
}

function accountValue(rows: CvmRow[], account: string) {
  return (
    rows.find((row) => row.CD_CONTA === account)?.VL_CONTA?.replace(",", ".") ??
    null
  );
}

function sumAccounts(rows: CvmRow[], accountCodes: string[]) {
  const values = accountCodes.map((account) => accountValue(rows, account));
  if (values.every((value) => value === null)) return null;
  return values
    .reduce((total, value) => total + Number(value ?? 0), 0)
    .toFixed(2);
}

export class CvmFundamentalsProvider implements FundamentalsProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async getByTicker({
    cnpj,
  }: {
    ticker: string;
    cnpj: string | null;
  }): Promise<FundamentalPeriod[]> {
    if (!cnpj) return [];
    const year = new Date().getUTCFullYear() - 1;
    const response = await this.fetcher(
      `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${year}.zip`,
    );
    if (!response.ok) throw new Error(`CVM request failed: ${response.status}`);

    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const rows = Object.entries(files)
      .flatMap(([name, bytes]) =>
        name.includes("_con_") ? parseCsv(new TextDecoder("iso-8859-1").decode(bytes)) : [],
      )
      .filter(
        (row) =>
          row.CNPJ_CIA.replace(/\D/g, "") === cnpj &&
          row.ORDEM_EXERC === "ÚLTIMO",
      );
    const dates = [...new Set(rows.map((row) => row.DT_REFER))]
      .sort()
      .reverse();

    return dates.map((referenceDate) => {
      const periodRows = rows.filter((row) => row.DT_REFER === referenceDate);
      return {
        referenceDate,
        periodType: "annual" as const,
        revenue: accountValue(periodRows, accounts.revenue),
        netIncome: accountValue(periodRows, accounts.netIncome),
        equity: accountValue(periodRows, accounts.equity),
        assets: accountValue(periodRows, accounts.assets),
        liabilities: accountValue(periodRows, accounts.liabilities),
        cash: accountValue(periodRows, accounts.cash),
        debt: sumAccounts(periodRows, [
          accounts.debtCurrent,
          accounts.debtNonCurrent,
        ]),
      };
    });
  }
}
