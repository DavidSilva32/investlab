import { Buffer } from "node:buffer";
import { zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { CvmFundamentalsProvider } from "@/backend/providers/cvm-fundamentals.provider";
import type { FundamentalPeriod } from "@/backend/providers/fundamentals.provider";

vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const cnpj = "33000167000101";
const cadHeader = "CNPJ_CIA;CD_CVM;DENOM_SOCIAL;SIT";
const documentHeader =
  "CNPJ_CIA;CD_CVM;DT_REFER;DT_INI_EXERC;DT_FIM_EXERC;VERSAO;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA;ESCALA_MOEDA";

const accountLabels: Record<string, string> = {
  "3.01": "Receitas da Intermediação Financeira",
  "3.09": "Lucro/Prejuízo Consolidado do Período",
  "3.11": "Lucro/Prejuízo Consolidado do Período",
  "2.03": "Patrimônio Líquido Consolidado",
  "2.07": "Patrimônio Líquido Consolidado",
  "2.08": "Patrimônio Líquido Consolidado",
};

function csvZip(name: string, csv: string) {
  return zipSync({ [name]: Buffer.from(csv, "latin1") });
}

function row(
  account: string,
  value: string,
  options: Partial<Record<string, string>> = {},
) {
  const fields = {
    CNPJ_CIA: "33.000.167/0001-01",
    CD_CVM: "09512",
    DT_REFER: "2025-12-31",
    DT_INI_EXERC: `${(options.DT_FIM_EXERC ?? options.DT_REFER ?? "2025-12-31").slice(0, 4)}-01-01`,
    DT_FIM_EXERC: options.DT_REFER ?? "2025-12-31",
    VERSAO: "1",
    ORDEM_EXERC: String.fromCharCode(218) + "LTIMO",
    CD_CONTA: account,
    DS_CONTA: accountLabels[account] ?? "Outra conta",
    VL_CONTA: value,
    ESCALA_MOEDA: "MIL",
    ...options,
  };
  return Object.values(fields).join(";");
}

function documentCsv(rows: string[]) {
  return [documentHeader, ...rows].join("\n");
}

function priorAnnualDfpResponse(currentYear: number) {
  const year = currentYear - 1;
  return new Response(
    csvZip(
      `dfp_cia_aberta_DRE_con_${year}.csv`,
      documentCsv([
        row("3.09", "100", {
          DT_REFER: `${year}-12-31`,
          DT_INI_EXERC: `${year}-01-01`,
          DT_FIM_EXERC: `${year}-12-31`,
        }),
        row("2.07", "1.000", {
          DT_REFER: `${year}-12-31`,
          DT_INI_EXERC: `${year}-01-01`,
          DT_FIM_EXERC: `${year}-12-31`,
        }),
      ]),
    ),
  );
}

function documentCsvWithoutAccountLabels(rows: string[]) {
  const cells = documentHeader.split(";");
  const labelIndex = cells.indexOf("DS_CONTA");
  cells.splice(labelIndex, 1);
  return [
    cells.join(";"),
    ...rows.map((line) => {
      const rowCells = line.split(";");
      rowCells.splice(labelIndex, 1);
      return rowCells.join(";");
    }),
  ].join("\n");
}

function issuerCsv(rows: string[]) {
  return [cadHeader, ...rows].join("\n");
}

describe("CvmFundamentalsProvider", () => {
  it("starts the current interim archive while required annual archives load", async () => {
    const currentYear = new Date().getUTCFullYear();
    const currentAnnualUrl = `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${currentYear - 1}.zip`;
    const currentInterimUrl = `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_${currentYear}.zip`;
    const requestedUrls: string[] = [];
    let releaseAnnual!: (response: Response) => void;
    const annualResponse = new Promise<Response>((resolve) => {
      releaseAnnual = resolve;
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith("cad_cia_aberta.csv"))
        return new Response(
          issuerCsv(["33.000.167/0001-01;09512;PETROBRAS;ATIVA"]),
        );
      if (url === currentAnnualUrl) return annualResponse;
      return new Response(null, { status: 404 });
    });

    const result = new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "PETR4",
      cnpj,
    });
    let interimRequested = false;
    try {
      await vi.waitFor(
        () => expect(requestedUrls).toContain(currentInterimUrl),
        { timeout: 100 },
      );
      interimRequested = true;
    } catch {
      // Release the blocked DFP response before asserting so failures settle.
    }
    releaseAnnual(priorAnnualDfpResponse(currentYear));
    expect(interimRequested).toBe(true);
    await expect(result).resolves.toHaveLength(1);
  });

  it("loads the fifth annual archive and only the missing historical balance archive", async () => {
    const currentYear = new Date().getUTCFullYear();
    const requestedUrls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith("cad_cia_aberta.csv"))
        return new Response(
          issuerCsv(["33.000.167/0001-01;09512;PETROBRAS;ATIVA"]),
        );
      if (url.includes("/DFP/")) {
        const year = Number(url.match(/dfp_cia_aberta_(\d{4})\.zip$/)?.[1]);
        const date = `${year}-12-31`;
        const accounts = [
          row("3.01", String(year), {
            DT_REFER: date,
            DT_INI_EXERC: `${year}-01-01`,
            DT_FIM_EXERC: date,
          }),
          row("3.09", String(year / 10), {
            DT_REFER: date,
            DT_INI_EXERC: `${year}-01-01`,
            DT_FIM_EXERC: date,
          }),
        ];
        accounts.push(
          row("2.07", String(year * 10), {
            DT_REFER: date,
            DT_INI_EXERC:
              year === currentYear - 4 ? `${year}-10-01` : `${year}-01-01`,
            DT_FIM_EXERC: date,
          }),
        );
        return new Response(
          csvZip(`dfp_cia_aberta_DRE_con_${year}.csv`, documentCsv(accounts)),
        );
      }
      if (url.endsWith(`/itr_cia_aberta_${currentYear - 4}.zip`))
        return new Response(
          csvZip(
            `itr_cia_aberta_BPA_con_${currentYear - 4}.csv`,
            documentCsv([
              row("2.07", "222", {
                DT_REFER: `${currentYear - 4}-09-30`,
                DT_INI_EXERC: `${currentYear - 4}-01-01`,
                DT_FIM_EXERC: `${currentYear - 4}-09-30`,
              }),
            ]),
          ),
        );
      if (url.endsWith(`/itr_cia_aberta_${currentYear}.zip`))
        return new Response(
          csvZip(`itr_cia_aberta_DRE_con_${currentYear}.csv`, documentCsv([])),
        );
      return new Response(null, { status: 404 });
    });

    const periods = await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "PETR4",
      cnpj: "33.000.167/0001-01",
    });

    expect(requestedUrls).toContain(
      `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${currentYear - 4}.zip`,
    );
    expect(requestedUrls).toContain(
      `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_${currentYear - 4}.zip`,
    );
    expect(
      new Set(requestedUrls.filter((url) => url.includes("/ITR/"))),
    ).toEqual(
      new Set([
        `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_${currentYear - 4}.zip`,
        `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_${currentYear}.zip`,
      ]),
    );
    expect(periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceDocument: "DFP",
          referenceDate: `${currentYear - 4}-12-31`,
          revenue: `${(currentYear - 4) * 1_000}.00`,
          periodBasis: "annual",
          equity: null,
        }),
        expect.objectContaining({
          sourceDocument: "DFP",
          referenceDate: `${currentYear - 4}-12-31`,
          periodStart: `${currentYear - 4}-10-01`,
          periodBasis: "unknown",
          equity: `${(currentYear - 4) * 10_000}.00`,
        }),
        expect.objectContaining({
          sourceDocument: "ITR",
          referenceDate: `${currentYear - 4}-09-30`,
          equity: "222000.00",
        }),
      ]),
    );
  });

  it("uses the latest supported YTD period when deciding whether prior-year ITR is needed", async () => {
    const year = new Date().getUTCFullYear();
    const marchEnd = `${year}-03-31`;
    const currentEnd = `${year}-06-30`;
    const priorMarchEnd = `${year - 1}-03-31`;
    const priorEnd = `${year - 1}-06-30`;
    const currentItrRows = [
      row("3.09", "30", {
        DT_REFER: marchEnd,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: marchEnd,
      }),
      row("2.07", "1050", {
        DT_REFER: marchEnd,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: marchEnd,
      }),
      row("3.09", "20", {
        DT_REFER: marchEnd,
        DT_INI_EXERC: `${year - 1}-01-01`,
        DT_FIM_EXERC: priorMarchEnd,
        ORDEM_EXERC: `PEN${String.fromCharCode(218)}LTIMO`,
      }),
      row("3.09", "60", {
        DT_REFER: currentEnd,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: currentEnd,
      }),
      row("2.07", "1100", {
        DT_REFER: currentEnd,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: currentEnd,
      }),
      row("3.09", "50", {
        DT_REFER: currentEnd,
        DT_INI_EXERC: `${year - 1}-01-01`,
        DT_FIM_EXERC: priorEnd,
        ORDEM_EXERC: `PEN${String.fromCharCode(218)}LTIMO`,
      }),
      row("2.07", "1000", {
        DT_REFER: currentEnd,
        DT_INI_EXERC: `${year - 1}-01-01`,
        DT_FIM_EXERC: priorEnd,
        ORDEM_EXERC: `PEN${String.fromCharCode(218)}LTIMO`,
      }),
    ];
    const requestedUrls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith("cad_cia_aberta.csv"))
        return new Response(
          issuerCsv(["33.000.167/0001-01;09512;PETROBRAS;ATIVA"]),
        );
      if (url.endsWith(`/dfp_cia_aberta_${year - 1}.zip`))
        return priorAnnualDfpResponse(year);
      if (url.includes("/DFP/"))
        return new Response(
          csvZip(`dfp_cia_aberta_DRE_con_${year}.csv`, documentCsv([])),
        );
      if (url.endsWith(`/itr_cia_aberta_${year}.zip`))
        return new Response(
          csvZip(
            `itr_cia_aberta_DRE_con_${year}.csv`,
            documentCsv(currentItrRows),
          ),
        );
      return new Response(null, { status: 404 });
    });

    const periods = await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "PETR4",
      cnpj: "33.000.167/0001-01",
    });

    expect(periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          referenceDate: priorEnd,
          exerciseOrder: "previous",
          equity: "1000000.00",
          equityAccount: "2.07",
          equityConcept: "consolidated_equity",
          filingReferenceDate: currentEnd,
        }),
      ]),
    );
    expect(requestedUrls).not.toContain(
      `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_${year - 1}.zip`,
    );
  });

  it("skips prior-year ITR when an eligible YTD flow has no ending equity", async () => {
    const year = new Date().getUTCFullYear();
    const currentEnd = `${year}-06-30`;
    const priorEnd = `${year - 1}-06-30`;
    const currentItrRows = [
      row("3.09", "60", {
        DT_REFER: currentEnd,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: currentEnd,
      }),
      row("3.09", "50", {
        DT_REFER: currentEnd,
        DT_INI_EXERC: `${year - 1}-01-01`,
        DT_FIM_EXERC: priorEnd,
        ORDEM_EXERC: `PEN${String.fromCharCode(218)}LTIMO`,
      }),
    ];
    const requestedUrls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith("cad_cia_aberta.csv"))
        return new Response(
          issuerCsv(["33.000.167/0001-01;09512;PETROBRAS;ATIVA"]),
        );
      if (url.endsWith(`/dfp_cia_aberta_${year - 1}.zip`))
        return priorAnnualDfpResponse(year);
      if (url.includes("/DFP/"))
        return new Response(
          csvZip(`dfp_cia_aberta_DRE_con_${year}.csv`, documentCsv([])),
        );
      if (url.endsWith(`/itr_cia_aberta_${year}.zip`))
        return new Response(
          csvZip(
            `itr_cia_aberta_DRE_con_${year}.csv`,
            documentCsv(currentItrRows),
          ),
        );
      return new Response(null, { status: 404 });
    });

    const periods = await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "PETR4",
      cnpj: "33.000.167/0001-01",
    });

    expect(requestedUrls).not.toContain(
      `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_${year - 1}.zip`,
    );
    expect(periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          referenceDate: currentEnd,
          netIncome: "60000.00",
          equity: null,
        }),
        expect.objectContaining({
          referenceDate: priorEnd,
          exerciseOrder: "previous",
          netIncome: "50000.00",
          equity: null,
        }),
      ]),
    );
  });

  it("fetches prior-year ITR when a later YTD period lacks opening equity despite an earlier complete period", async () => {
    const year = new Date().getUTCFullYear();
    const marchEnd = `${year}-03-31`;
    const juneEnd = `${year}-06-30`;
    const priorMarchEnd = `${year - 1}-03-31`;
    const priorJuneEnd = `${year - 1}-06-30`;
    let historicalArchiveAvailable = true;
    const currentItrRows = [
      row("3.09", "30", {
        DT_REFER: marchEnd,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: marchEnd,
      }),
      row("2.07", "1050", {
        DT_REFER: marchEnd,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: marchEnd,
      }),
      row("3.09", "20", {
        DT_REFER: marchEnd,
        DT_INI_EXERC: `${year - 1}-01-01`,
        DT_FIM_EXERC: priorMarchEnd,
        ORDEM_EXERC: `PEN${String.fromCharCode(218)}LTIMO`,
      }),
      row("2.07", "1000", {
        DT_REFER: marchEnd,
        DT_INI_EXERC: `${year - 1}-01-01`,
        DT_FIM_EXERC: priorMarchEnd,
        ORDEM_EXERC: `PEN${String.fromCharCode(218)}LTIMO`,
      }),
      row("3.09", "60", {
        DT_REFER: juneEnd,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: juneEnd,
      }),
      row("2.07", "1100", {
        DT_REFER: juneEnd,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: juneEnd,
      }),
      row("3.09", "50", {
        DT_REFER: juneEnd,
        DT_INI_EXERC: `${year - 1}-01-01`,
        DT_FIM_EXERC: priorJuneEnd,
        ORDEM_EXERC: `PEN${String.fromCharCode(218)}LTIMO`,
      }),
    ];
    const requestedUrls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith("cad_cia_aberta.csv"))
        return new Response(
          issuerCsv(["33.000.167/0001-01;09512;PETROBRAS;ATIVA"]),
        );
      if (url.endsWith(`/dfp_cia_aberta_${year - 1}.zip`))
        return priorAnnualDfpResponse(year);
      if (url.includes("/DFP/"))
        return new Response(
          csvZip(`dfp_cia_aberta_DRE_con_${year}.csv`, documentCsv([])),
        );
      if (url.endsWith(`/itr_cia_aberta_${year}.zip`))
        return new Response(
          csvZip(
            `itr_cia_aberta_DRE_con_${year}.csv`,
            documentCsv(currentItrRows),
          ),
        );
      if (url.endsWith(`/itr_cia_aberta_${year - 1}.zip`)) {
        if (!historicalArchiveAvailable)
          return new Response(null, { status: 404 });
        return new Response(
          csvZip(
            `itr_cia_aberta_DRE_con_${year - 1}.csv`,
            documentCsv([
              row("2.07", "1000", {
                DT_REFER: priorJuneEnd,
                DT_INI_EXERC: `${year - 1}-01-01`,
                DT_FIM_EXERC: priorJuneEnd,
              }),
            ]),
          ),
        );
      }
      return new Response(null, { status: 404 });
    });

    const periods = await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "PETR4",
      cnpj: "33.000.167/0001-01",
    });

    expect(requestedUrls).toContain(
      `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_${year - 1}.zip`,
    );
    expect(periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          referenceDate: priorJuneEnd,
          periodEnd: priorJuneEnd,
          exerciseOrder: "last",
          equity: "1000000.00",
          equityAccount: "2.07",
          equityConcept: "consolidated_equity",
        }),
      ]),
    );

    historicalArchiveAvailable = false;
    const fallbackPeriods = await new CvmFundamentalsProvider(
      fetcher,
    ).getByTicker({
      ticker: "PETR4",
      cnpj: "33.000.167/0001-01",
    });

    expect(fallbackPeriods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          referenceDate: juneEnd,
          periodEnd: juneEnd,
          exerciseOrder: "last",
          equity: "1100000.00",
          equityAccount: "2.07",
          equityConcept: "consolidated_equity",
        }),
      ]),
    );
    expect(fallbackPeriods).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          periodEnd: priorJuneEnd,
          exerciseOrder: "last",
          equity: "1000000.00",
          equityAccount: "2.07",
        }),
      ]),
    );
  });

  it("reuses the historical ITR archive when the LTM balance check needs the same year", async () => {
    const year = new Date().getUTCFullYear();
    const currentEnd = `${year}-03-31`;
    const priorEnd = `${year - 1}-03-31`;
    const requestedUrls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith("cad_cia_aberta.csv"))
        return new Response(
          issuerCsv(["33.000.167/0001-01;09512;PETROBRAS;ATIVA"]),
        );
      if (url.includes("/DFP/")) {
        const archiveYear = Number(
          url.match(/dfp_cia_aberta_(\d{4})\.zip$/)?.[1],
        );
        return new Response(
          csvZip(
            `dfp_cia_aberta_DRE_con_${archiveYear}.csv`,
            documentCsv([
              row("3.09", "100", {
                DT_REFER: `${archiveYear}-12-31`,
                DT_INI_EXERC: `${archiveYear}-01-01`,
                DT_FIM_EXERC: `${archiveYear}-12-31`,
              }),
            ]),
          ),
        );
      }
      if (url.endsWith(`/itr_cia_aberta_${year}.zip`))
        return new Response(
          csvZip(
            `itr_cia_aberta_DRE_con_${year}.csv`,
            documentCsv([
              row("3.09", "30", {
                DT_REFER: currentEnd,
                DT_INI_EXERC: `${year}-01-01`,
                DT_FIM_EXERC: currentEnd,
              }),
              row("2.07", "1100", {
                DT_REFER: currentEnd,
                DT_INI_EXERC: `${year}-01-01`,
                DT_FIM_EXERC: currentEnd,
              }),
              row("3.09", "20", {
                DT_REFER: currentEnd,
                DT_INI_EXERC: `${year - 1}-01-01`,
                DT_FIM_EXERC: priorEnd,
                ORDEM_EXERC: `PEN${String.fromCharCode(218)}LTIMO`,
              }),
            ]),
          ),
        );
      if (url.endsWith(`/itr_cia_aberta_${year - 1}.zip`))
        return new Response(
          csvZip(`itr_cia_aberta_DRE_con_${year - 1}.csv`, documentCsv([])),
        );
      return new Response(null, { status: 404 });
    });

    await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "PETR4",
      cnpj: "33.000.167/0001-01",
    });

    const priorItrUrl = `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_${year - 1}.zip`;
    expect(requestedUrls.filter((url) => url === priorItrUrl)).toHaveLength(1);
  });

  it("normalizes issuer data and streamed DFP and ITR accounts, preferring the latest version", async () => {
    const year = new Date().getUTCFullYear();
    const dfpRows = [
      row("3.01", "100", { VERSAO: "abc" }),
      row("3.01", "1.234,50", { VERSAO: "2" }),
      row("3.01", "888", { VERSAO: "" }),
      row("3.01", "1.234,50", { VERSAO: "2" }),
      row("3.01", "999", { VERSAO: "1" }),
      row("3.11", "20"),
      row("2.03", "30"),
      row("2.03", "1.5", { VERSAO: "2", ESCALA_MOEDA: "UNIDADE" }),
      row("1", "40"),
      row("2", "10"),
      row("1.01.01", "5"),
      row("2.01.04", "invalid"),
      row("2.01.04", "3", { VERSAO: "2" }),
      row("2.02.01", "7"),
      row("3.01", "999", { CNPJ_CIA: "00.000.000/0001-00" }),
      row("3.01", "999", { CD_CVM: "123" }),
      row("3.01", "999", {
        ORDEM_EXERC: "PEN" + String.fromCharCode(218) + "LTIMO",
      }),
      row("3.01", "999", { ORDEM_EXERC: "INVALID_ORDER" }),
      row("9.99", "999"),
      row("3.01", "999", { DT_REFER: "" }),
    ];
    const itr = documentCsv([
      row("3.01", "2", { DT_REFER: "2026-03-31" }),
      row("3.01", "1", {
        DT_REFER: "2026-06-30",
        DT_INI_EXERC: "2026-04-01",
        DT_FIM_EXERC: "2026-06-30",
      }),
      row("3.11", "1", {
        DT_REFER: "2026-03-31",
        DT_INI_EXERC: "2025-01-01",
        DT_FIM_EXERC: "2025-03-31",
        ORDEM_EXERC: `PEN${String.fromCharCode(218)}LTIMO`,
      }),
      row("1.01.01", "", { DT_REFER: "2026-03-31", ESCALA_MOEDA: " reais " }),
      row("3.01", "3", {
        DT_REFER: "2026-06-30",
        DT_INI_EXERC: "2026-05-01",
        DT_FIM_EXERC: "2026-06-30",
      }),
      row("3.01", "4", {
        DT_REFER: "2026-09-30",
        DT_INI_EXERC: "2026-07-01",
        DT_FIM_EXERC: "2026-09-30",
      }),
      row("3.01", "5", {
        DT_REFER: "2026-12-31",
        DT_INI_EXERC: "2026-10-01",
        DT_FIM_EXERC: "2026-12-31",
      }),
      row("3.01", "6", {
        DT_REFER: "2026-05-31",
        DT_INI_EXERC: "2026-04-01",
        DT_FIM_EXERC: "2026-05-31",
      }),
      row("3.01", "7", {
        DT_REFER: "2026-03-31",
        DT_INI_EXERC: "2026-02-01",
        DT_FIM_EXERC: "2026-03-31",
      }),
    ]);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          issuerCsv([
            "33.000.167/0001-01;9512;OUTRA;ATIVA",
            '33.000.167/0001-01;09512;"PETRO;LEO ""BRASIL"" S.A.";ATIVO',
          ]),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          csvZip("dfp_cia_aberta_DRE_con_2025.csv", documentCsv(dfpRows)),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          csvZip(
            "dfp_cia_aberta_DRE_con_2024.csv",
            documentCsv([
              row("3.01", "5", {
                DT_REFER: "2026-04-01",
                DT_INI_EXERC: "2025-01-01",
                DT_FIM_EXERC: "2025-12-31",
              }),
              row("2.07", "40", {
                DT_REFER: "2024-12-31",
                DT_INI_EXERC: "2024-01-01",
                DT_FIM_EXERC: "2024-12-31",
              }),
              row("3.01", "5", {
                DT_REFER: "2026-04-01",
                DT_INI_EXERC: "2025-01-01",
                DT_FIM_EXERC: "2025-12-31",
              }),
              row("2.07", "30", {
                DT_REFER: "2023-12-31",
                DT_INI_EXERC: "2023-01-01",
                DT_FIM_EXERC: "2023-12-31",
              }),
            ]),
          ),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          csvZip(
            "dfp_cia_aberta_DRE_con_2022.csv",
            documentCsv([
              row("2.07", "20", {
                DT_REFER: "2022-12-31",
                DT_INI_EXERC: "2022-01-01",
                DT_FIM_EXERC: "2022-12-31",
              }),
            ]),
          ),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          csvZip(
            "dfp_cia_aberta_DRE_con_2023.csv",
            documentCsv([
              row("3.01", "5", {
                DT_REFER: "2026-04-01",
                DT_INI_EXERC: "2025-01-01",
                DT_FIM_EXERC: "2025-12-31",
              }),
            ]),
          ),
        ),
      )
      .mockResolvedValueOnce(
        new Response(csvZip("itr_cia_aberta_DRE_con_2026.csv", itr)),
      );

    const periods = await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "PETR4",
      cnpj: "33.000.167/0001-01",
    });

    expect(periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          referenceDate: "2026-03-31",
          periodType: "interim",
          sourceDocument: "ITR",
          revenue: "2000.00",
          netIncome: null,
          equity: null,
          assets: null,
          liabilities: null,
          cash: null,
          debt: null,
        }),
        expect.objectContaining({
          referenceDate: "2025-12-31",
          periodType: "annual",
          filingReferenceDate: "2026-04-01",
          revenue: "5000.00",
        }),
        expect.objectContaining({
          referenceDate: "2025-03-31",
          periodStart: "2025-01-01",
          periodEnd: "2025-03-31",
          filingReferenceDate: "2026-03-31",
          exerciseOrder: "previous",
          periodBasis: "year_to_date",
          sourceDocument: "ITR",
        }),
        expect.objectContaining({
          referenceDate: "2026-06-30",
          periodStart: "2026-04-01",
          periodEnd: "2026-06-30",
          periodBasis: "quarterly",
          sourceDocument: "ITR",
        }),
        expect.objectContaining({
          periodStart: "2026-05-01",
          periodEnd: "2026-06-30",
          periodBasis: "unknown",
          sourceDocument: "ITR",
        }),
        expect.objectContaining({
          periodStart: "2026-07-01",
          periodEnd: "2026-09-30",
          periodBasis: "quarterly",
          sourceDocument: "ITR",
        }),
        expect.objectContaining({
          periodStart: "2026-10-01",
          periodEnd: "2026-12-31",
          periodBasis: "quarterly",
          sourceDocument: "ITR",
        }),
      ]),
    );
    expect(
      periods.filter(
        (period) =>
          period.sourceDocument === "DFP" &&
          period.referenceDate === "2025-12-31",
      ),
    ).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv",
      `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${year - 1}.zip`,
      `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${year - 2}.zip`,
      `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${year - 3}.zip`,
      `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${year - 4}.zip`,
      `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_${year}.zip`,
    ]);
  });

  it("marks a conflicting equal-version account unavailable without losing other accounts", async () => {
    const year = new Date().getUTCFullYear();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;PETROBRAS;ATIVO"])),
      )
      .mockResolvedValueOnce(
        new Response(
          csvZip(
            `dfp_cia_aberta_DRE_con_${year - 1}.csv`,
            documentCsv([
              row("3.01", "100", { VERSAO: "2" }),
              row("3.01", "200", { VERSAO: "2" }),
              row("3.11", "20"),
              row("2.03", "30"),
            ]),
          ),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    const periods = await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "PETR4",
      cnpj,
    });

    expect(periods[0]).toMatchObject({
      revenue: null,
      revenueAccountLabel: null,
      netIncome: "20000.00",
      equity: "30000.00",
    });
  });

  it("handles absent labels and repeated rows after an equal-version value conflict", async () => {
    const year = new Date().getUTCFullYear();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;PETROBRAS;ATIVO"])),
      )
      .mockResolvedValueOnce(
        new Response(
          csvZip(
            `dfp_cia_aberta_DRE_con_${year - 1}.csv`,
            documentCsvWithoutAccountLabels([
              row("3.01", "100", { VERSAO: "2" }),
              row("3.01", "100", { VERSAO: "2" }),
              row("3.01", "110", { VERSAO: "2" }),
              row("3.01", "110", { VERSAO: "2" }),
              row("3.11", "20"),
              row("2.03", "30"),
            ]),
          ),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    const periods = await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "PETR4",
      cnpj,
    });

    expect(periods[0]).toMatchObject({
      revenue: null,
      revenueVersion: "2",
      revenueAccountLabel: null,
      netIncome: null,
      equity: null,
    });
  });

  it("marks equal-value rows with different same-version labels ambiguous", async () => {
    const year = new Date().getUTCFullYear();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;PETROBRAS;ATIVO"])),
      )
      .mockResolvedValueOnce(
        new Response(
          csvZip(
            `dfp_cia_aberta_DRE_con_${year - 1}.csv`,
            documentCsv([
              row("3.01", "100", {
                VERSAO: "2",
                DS_CONTA: "Receita A",
              }),
              row("3.01", "100", {
                VERSAO: "2",
                DS_CONTA: "Receita B",
              }),
              row("3.11", "20"),
              row("2.03", "30"),
            ]),
          ),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    const periods = await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "PETR4",
      cnpj,
    });

    expect(periods[0]).toMatchObject({
      revenue: null,
      revenueVersion: "2",
      revenueAccountLabel: null,
      netIncome: "20000.00",
      equity: "30000.00",
    });
  });

  it("deduplicates periods returned without an explicit end date", async () => {
    const provider = new CvmFundamentalsProvider(
      vi
        .fn()
        .mockResolvedValue(
          new Response(issuerCsv(["33.000.167/0001-01;9512;PETROBRAS;ATIVO"])),
        ),
    );
    const readDocument = vi.spyOn(
      provider as unknown as {
        readDocument: (...args: unknown[]) => Promise<FundamentalPeriod[]>;
      },
      "readDocument",
    );
    const period = {
      referenceDate: "2025-12-31",
      periodStart: null,
      periodType: "annual" as const,
      sourceDocument: "DFP" as const,
      exerciseOrder: "last" as const,
      filingReferenceDate: null,
      periodBasis: "annual" as const,
      isDerived: false,
      revenue: "100",
      netIncome: null,
      equity: null,
      assets: null,
      liabilities: null,
      cash: null,
      debt: null,
    };
    readDocument
      .mockResolvedValueOnce([
        period,
        { ...period, revenue: "200" },
        { ...period, filingReferenceDate: "2026-04-01", revenue: "300" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const periods = await provider.getByTicker({ ticker: "PETR4", cnpj });

    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({
      referenceDate: "2025-12-31",
      filingReferenceDate: "2026-04-01",
      revenue: "300",
    });
    expect(periods[0]).not.toHaveProperty("periodEnd");
  });

  it("keeps a financial result unavailable when one accepted account is ambiguous", async () => {
    const year = new Date().getUTCFullYear();
    const period = {
      DT_REFER: `${year}-06-30`,
      DT_INI_EXERC: `${year}-01-01`,
      DT_FIM_EXERC: `${year}-06-30`,
    };
    const itr = documentCsv([
      row("3.09", "20", { ...period, VERSAO: "2" }),
      row("3.09", "21", { ...period, VERSAO: "2" }),
      row("3.11", "30", { ...period, VERSAO: "1" }),
    ]);
    const emptyAnnual = csvZip(
      `dfp_cia_aberta_DRE_con_${year - 1}.csv`,
      documentCsv([]),
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;PETROBRAS;ATIVO"])),
      )
      .mockResolvedValueOnce(new Response(emptyAnnual))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(csvZip(`itr_cia_aberta_DRE_con_${year}.csv`, itr)),
      );

    const periods = await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "SANB11",
      cnpj,
    });

    expect(periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          periodEnd: `${year}-06-30`,
          netIncome: null,
          netIncomeAccount: null,
          netIncomeConcept: null,
        }),
      ]),
    );
  });

  it("uses consolidated 2.07 when another equity alternative is ambiguous only for non-consolidated labels", async () => {
    const year = new Date().getUTCFullYear();
    const period = {
      DT_REFER: `${year}-06-30`,
      DT_INI_EXERC: `${year}-01-01`,
      DT_FIM_EXERC: `${year}-06-30`,
    };
    const itr = documentCsv([
      row("2.03", "100", {
        ...period,
        VERSAO: "2",
        DS_CONTA: "Patrimônio líquido individual",
      }),
      row("2.03", "110", {
        ...period,
        VERSAO: "2",
        DS_CONTA: "Patrimônio líquido individual reapresentado",
      }),
      row("2.07", "200", { ...period, VERSAO: "1" }),
      row("3.09", "30", { ...period, VERSAO: "1" }),
    ]);
    const emptyAnnual = csvZip(
      `dfp_cia_aberta_DRE_con_${year - 1}.csv`,
      documentCsv([]),
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;PETROBRAS;ATIVO"])),
      )
      .mockResolvedValueOnce(new Response(emptyAnnual))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(csvZip(`itr_cia_aberta_DRE_con_${year}.csv`, itr)),
      );

    const periods = await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "PETR4",
      cnpj,
    });

    expect(periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          periodEnd: `${year}-06-30`,
          equity: "200000.00",
          equityAccount: "2.07",
          equityConcept: "consolidated_equity",
        }),
      ]),
    );
  });

  it("keeps equity unavailable when ambiguous 2.03 has blank labels despite valid 2.07", async () => {
    const year = new Date().getUTCFullYear();
    const period = {
      DT_REFER: `${year}-06-30`,
      DT_INI_EXERC: `${year}-01-01`,
      DT_FIM_EXERC: `${year}-06-30`,
    };
    const itr = documentCsv([
      row("2.03", "100", {
        ...period,
        VERSAO: "2",
        DS_CONTA: "",
      }),
      row("2.03", "110", {
        ...period,
        VERSAO: "2",
        DS_CONTA: "",
      }),
      row("2.07", "200", { ...period, VERSAO: "1" }),
      row("3.09", "30", { ...period, VERSAO: "1" }),
    ]);
    const emptyAnnual = csvZip(
      `dfp_cia_aberta_DRE_con_${year - 1}.csv`,
      documentCsv([]),
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;PETROBRAS;ATIVO"])),
      )
      .mockResolvedValueOnce(new Response(emptyAnnual))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(csvZip(`itr_cia_aberta_DRE_con_${year}.csv`, itr)),
      );

    const periods = await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "PETR4",
      cnpj,
    });

    expect(periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          periodEnd: `${year}-06-30`,
          equity: null,
          equityAccount: null,
          equityConcept: null,
        }),
      ]),
    );
  });

  it("keeps equity unavailable when a third same-version label is consolidated", async () => {
    const year = new Date().getUTCFullYear();
    const period = {
      DT_REFER: `${year}-06-30`,
      DT_INI_EXERC: `${year}-01-01`,
      DT_FIM_EXERC: `${year}-06-30`,
    };
    const itr = documentCsv([
      row("2.03", "100", {
        ...period,
        VERSAO: "2",
        DS_CONTA: "Patrimônio líquido individual",
      }),
      row("2.03", "110", {
        ...period,
        VERSAO: "2",
        DS_CONTA: "Patrimônio líquido individual reapresentado",
      }),
      row("2.03", "120", {
        ...period,
        VERSAO: "2",
        DS_CONTA: "Patrimônio Líquido Consolidado",
      }),
      row("2.03", "120", {
        ...period,
        VERSAO: "2",
        DS_CONTA: "Patrimônio Líquido Consolidado",
      }),
      row("2.07", "200", { ...period, VERSAO: "1" }),
      row("3.09", "30", { ...period, VERSAO: "1" }),
    ]);
    const emptyAnnual = csvZip(
      `dfp_cia_aberta_DRE_con_${year - 1}.csv`,
      documentCsv([]),
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;PETROBRAS;ATIVO"])),
      )
      .mockResolvedValueOnce(new Response(emptyAnnual))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(csvZip(`itr_cia_aberta_DRE_con_${year}.csv`, itr)),
      );

    const periods = await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "PETR4",
      cnpj,
    });

    expect(periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          periodEnd: `${year}-06-30`,
          equity: null,
          equityAccount: null,
          equityConcept: null,
        }),
      ]),
    );
  });

  it("keeps equity unavailable when the consolidated 2.07 candidate is ambiguous", async () => {
    const year = new Date().getUTCFullYear();
    const period = {
      DT_REFER: `${year}-06-30`,
      DT_INI_EXERC: `${year}-01-01`,
      DT_FIM_EXERC: `${year}-06-30`,
    };
    const itr = documentCsv([
      row("2.07", "200", { ...period, VERSAO: "1" }),
      row("2.07", "201", { ...period, VERSAO: "1" }),
      row("3.09", "30", { ...period, VERSAO: "1" }),
    ]);
    const emptyAnnual = csvZip(
      `dfp_cia_aberta_DRE_con_${year - 1}.csv`,
      documentCsv([]),
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;PETROBRAS;ATIVO"])),
      )
      .mockResolvedValueOnce(new Response(emptyAnnual))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(csvZip(`itr_cia_aberta_DRE_con_${year}.csv`, itr)),
      );

    const periods = await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "PETR4",
      cnpj,
    });

    expect(periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          periodEnd: `${year}-06-30`,
          equity: null,
          equityAccount: null,
          equityConcept: null,
        }),
      ]),
    );
  });

  it("rejects a missing CNPJ before making a request", async () => {
    const fetcher = vi.fn();

    await expect(
      new CvmFundamentalsProvider(fetcher).getByTicker({
        ticker: "PETR4",
        cnpj: null,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps consolidated bank income and equity by verified account labels", async () => {
    const year = new Date().getUTCFullYear();
    const itr = documentCsv([
      row("3.09", "20", {
        DT_REFER: `${year}-06-30`,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: `${year}-06-30`,
      }),
      row("3.11", "999", {
        DT_REFER: `${year}-06-30`,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: `${year}-06-30`,
        DS_CONTA: "Resultado Líquido das Operações Continuadas",
      }),
      row("2.07", "90", {
        DT_REFER: `${year}-06-30`,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: `${year}-06-30`,
      }),
      row("3.09", "15", {
        DT_REFER: `${year}-06-30`,
        DT_INI_EXERC: `${year - 1}-01-01`,
        DT_FIM_EXERC: `${year - 1}-06-30`,
        ORDEM_EXERC: `PEN${String.fromCharCode(218)}LTIMO`,
      }),
      row("2.08", "75", {
        DT_REFER: `${year}-06-30`,
        DT_INI_EXERC: `${year - 1}-01-01`,
        DT_FIM_EXERC: `${year - 1}-06-30`,
        ORDEM_EXERC: `PEN${String.fromCharCode(218)}LTIMO`,
      }),
      row("3.09", "20", {
        DT_REFER: `${year}-08-01`,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: `${year}-06-30`,
      }),
      row("2.07", "90", {
        DT_REFER: `${year}-08-01`,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: `${year}-06-30`,
      }),
      row("3.09", "999", {
        DT_REFER: `${year}-07-01`,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: `${year}-06-30`,
      }),
      row("2.07", "999", {
        DT_REFER: `${year}-07-01`,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: `${year}-06-30`,
      }),
    ]);
    const emptyAnnual = csvZip(
      `dfp_cia_aberta_DRE_con_${year - 1}.csv`,
      documentCsv([]),
    );
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("cad_cia_aberta.csv"))
        return new Response(
          issuerCsv(["33.000.167/0001-01;9512;Petrobras;ATIVO"]),
        );
      if (url.endsWith(`/dfp_cia_aberta_${year - 1}.zip`))
        return new Response(emptyAnnual);
      if (url.includes("/ITR/") && url.endsWith(`/itr_cia_aberta_${year}.zip`))
        return new Response(csvZip(`itr_cia_aberta_DRE_con_${year}.csv`, itr));
      return new Response(null, { status: 404 });
    });

    const periods = await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "SANB11",
      cnpj,
    });

    expect(
      periods.filter((period) => period.periodEnd === `${year}-06-30`),
    ).toHaveLength(1);
    expect(periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          periodEnd: `${year}-06-30`,
          filingReferenceDate: `${year}-08-01`,
          netIncome: "20000.00",
          netIncomeAccount: "3.09",
          netIncomeConcept: "consolidated_net_income",
          equity: "90000.00",
          equityAccount: "2.07",
          equityConcept: "consolidated_equity",
        }),
        expect.objectContaining({
          periodEnd: `${year - 1}-06-30`,
          netIncome: "15000.00",
          netIncomeAccount: "3.09",
          netIncomeConcept: "consolidated_net_income",
          equity: "75000.00",
          equityAccount: "2.08",
          equityConcept: "consolidated_equity",
        }),
      ]),
    );
  });

  it("keeps consolidated income unavailable when multiple accepted accounts match", async () => {
    const year = new Date().getUTCFullYear();
    const itr = documentCsv([
      row("3.09", "20", {
        DT_REFER: `${year}-06-30`,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: `${year}-06-30`,
      }),
      row("3.11", "21", {
        DT_REFER: `${year}-06-30`,
        DT_INI_EXERC: `${year}-01-01`,
        DT_FIM_EXERC: `${year}-06-30`,
      }),
    ]);
    const emptyAnnual = csvZip(
      `dfp_cia_aberta_DRE_con_${year - 1}.csv`,
      documentCsv([]),
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;Petrobras;ATIVO"])),
      )
      .mockResolvedValueOnce(new Response(emptyAnnual))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(csvZip(`itr_cia_aberta_DRE_con_${year}.csv`, itr)),
      );

    const periods = await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "SANB11",
      cnpj,
    });

    expect(periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          periodEnd: `${year}-06-30`,
          netIncome: null,
          netIncomeAccount: null,
          netIncomeConcept: null,
        }),
      ]),
    );
  });

  it("rejects unsuccessful issuer catalog requests", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      new CvmFundamentalsProvider(fetcher).getByTicker({
        ticker: "PETR4",
        cnpj,
      }),
    ).rejects.toThrow("CVM CAD request failed: 503");
  });

  it.each([
    ["no matching CNPJ", issuerCsv(["00.000.000/0001-00;9512;Outra;ATIVA"])],
    [
      "matching CNPJ without CVM code",
      issuerCsv([
        "33.000.167/0001-01;;Sem cÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³digo;ATIVA",
      ]),
    ],
  ])("returns not found when the catalog has %s", async (_case, body) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(body));

    await expect(
      new CvmFundamentalsProvider(fetcher).getByTicker({
        ticker: "PETR4",
        cnpj,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects an issuer catalog response without a body", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null));

    await expect(
      new CvmFundamentalsProvider(fetcher).getByTicker({
        ticker: "PETR4",
        cnpj,
      }),
    ).rejects.toThrow("CVM response has no body");
  });

  it("propagates an unavailable current annual document", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;Petrobras;ATIVO"])),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(
      new CvmFundamentalsProvider(fetcher).getByTicker({
        ticker: "PETR4",
        cnpj,
      }),
    ).rejects.toThrow("CVM DFP request failed: 503");
  });

  it("rejects an annual document response without a body", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;Petrobras;ATIVO"])),
      )
      .mockResolvedValueOnce(new Response(null));

    await expect(
      new CvmFundamentalsProvider(fetcher).getByTicker({
        ticker: "PETR4",
        cnpj,
      }),
    ).rejects.toThrow("CVM DFP response has no body");
  });

  it("returns not found when annual and quarterly documents have no usable periods", async () => {
    const emptyZip = zipSync({
      "readme.txt": Buffer.from("metadata"),
      "dfp_cia_aberta_DRE_con_2025.csv": Buffer.from(documentHeader, "latin1"),
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;Petrobras;ATIVO"])),
      )
      .mockResolvedValueOnce(new Response(emptyZip))
      .mockResolvedValueOnce(new Response(emptyZip))
      .mockResolvedValueOnce(new Response(emptyZip))
      .mockResolvedValueOnce(new Response(emptyZip));

    await expect(
      new CvmFundamentalsProvider(fetcher).getByTicker({
        ticker: "PETR4",
        cnpj,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("keeps annual data when the quarterly filing is unavailable", async () => {
    const annual = csvZip(
      "dfp_cia_aberta_DRE_con_2025.csv",
      documentCsv([row("3.01", "12")]),
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;Petrobras;ATIVO"])),
      )
      .mockResolvedValueOnce(new Response(annual))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(
      new CvmFundamentalsProvider(fetcher).getByTicker({
        ticker: "PETR4",
        cnpj,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        referenceDate: "2025-12-31",
        sourceDocument: "DFP",
        revenue: "12000.00",
      }),
    ]);
  });

  it("rejects malformed document streams", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;Petrobras;ATIVO"])),
      )
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.error(new Error("stream interrupted"));
            },
          }),
        ),
      );

    await expect(
      new CvmFundamentalsProvider(fetcher).getByTicker({
        ticker: "PETR4",
        cnpj,
      }),
    ).rejects.toBeTruthy();
  });

  it("rejects a corrupt compressed CVM file", async () => {
    const damaged = zipSync(
      {
        "dfp_cia_aberta_DRE_con_2025.csv": Buffer.from(
          documentCsv([row("3.01", "1")]),
          "latin1",
        ),
        "itr_cia_aberta_DRE_con_2026.csv": Buffer.from(
          documentCsv([row("3.01", "2")]),
          "latin1",
        ),
      },
      { level: 6 },
    );
    const fileNameLength = damaged[26]! | (damaged[27]! << 8);
    const extraLength = damaged[28]! | (damaged[29]! << 8);
    damaged[30 + fileNameLength + extraLength] = 0xff;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;Petrobras;ATIVO"])),
      )
      .mockResolvedValueOnce(new Response(damaged));

    await expect(
      new CvmFundamentalsProvider(fetcher).getByTicker({
        ticker: "PETR4",
        cnpj,
      }),
    ).rejects.toThrow();
  });
  it("tolerates optional issuer fields and missing document columns", async () => {
    const oddIssuer = "CNPJ_CIA;CD_CVM\n33.000.167/0001-01;CODE\n";
    const minimalHeader =
      "CNPJ_CIA;CD_CVM;DT_REFER;ORDEM_EXERC;CD_CONTA;VL_CONTA";
    const minimalRow = [
      "33.000.167/0001-01",
      "CODE",
      "2025-12-31",
      String.fromCharCode(218) + "LTIMO",
      "3.01",
      "1,5",
      "overflow",
    ].join(";");
    const unlabeledIncomeRow = [
      "33.000.167/0001-01",
      "CODE",
      "2025-12-31",
      String.fromCharCode(218) + "LTIMO",
      "3.09",
      "2",
    ].join(";");
    const optionalFiles = zipSync({
      "dfp_cia_aberta_DRE_con_2025.csv": Buffer.from(
        `${minimalHeader}\n${minimalRow}\n${unlabeledIncomeRow}`,
        "latin1",
      ),
      "dfp_cia_aberta_DRE_con_missing_cnpj.csv": Buffer.from(
        `CD_CVM;DT_REFER;VERSAO;ORDEM_EXERC;CD_CONTA;VL_CONTA\n9512;2025-12-31;1;${String.fromCharCode(218)}LTIMO;3.01;5`,
        "latin1",
      ),
      "dfp_cia_aberta_DRE_con_missing_code_account.csv": Buffer.from(
        `CNPJ_CIA;DT_REFER;VERSAO;ORDEM_EXERC;VL_CONTA\n33.000.167/0001-01;2025-12-31;1;${String.fromCharCode(218)}LTIMO;5`,
        "latin1",
      ),
      "dfp_cia_aberta_DRE_con_missing_account.csv": Buffer.from(
        `CNPJ_CIA;CD_CVM;DT_REFER;VERSAO;ORDEM_EXERC;VL_CONTA\n33.000.167/0001-01;CODE;2025-12-31;1;${String.fromCharCode(218)}LTIMO;5`,
        "latin1",
      ),
      "dfp_cia_aberta_DRE_con_missing_order.csv": Buffer.from(
        "CNPJ_CIA;CD_CVM;DT_REFER;DT_FIM_EXERC;CD_CONTA;VL_CONTA\n33.000.167/0001-01;CODE;2025-12-31;2025-12-31;3.01;5",
        "latin1",
      ),
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(oddIssuer))
      .mockResolvedValueOnce(new Response(optionalFiles))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(
      new CvmFundamentalsProvider(fetcher).getByTicker({
        ticker: "PETR4",
        cnpj,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        sourceDocument: "DFP",
        revenue: null,
        netIncome: null,
        debt: null,
      }),
    ]);
  });

  it("handles large streamed CSVs and a final newline", async () => {
    const noisyRows = Array.from(
      { length: 180 },
      (_, index) => `${row("9.99", "1")};${String(index).padEnd(900, "x")}`,
    );
    const largeCsv = `${documentCsv([row("3.01", "2"), ...noisyRows])}\n`;
    const largeArchive = zipSync(
      {
        "dfp_cia_aberta_DRE_con_2025.csv": Buffer.from(largeCsv, "latin1"),
        "dfp_cia_aberta_DRE_con_empty.csv": Buffer.alloc(0),
      },
      { level: 0 },
    );
    let offset = 0;
    const chunkedBody = new ReadableStream({
      pull(controller) {
        if (offset >= largeArchive.length) {
          controller.close();
          return;
        }
        controller.enqueue(largeArchive.slice(offset, offset + 4096));
        offset += 4096;
      },
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;Petrobras;ATIVO"])),
      )
      .mockResolvedValueOnce(new Response(chunkedBody))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(
      new CvmFundamentalsProvider(fetcher).getByTicker({
        ticker: "PETR4",
        cnpj,
      }),
    ).resolves.toHaveLength(1);
  });

  it("rejects a stream that fails after an earlier file callback has settled", async () => {
    const damaged = zipSync(
      {
        "dfp_cia_aberta_DRE_con_2025.csv": Buffer.from(
          documentCsv([row("3.01", "1")]),
          "latin1",
        ),
        "itr_cia_aberta_DRE_con_2026.csv": Buffer.from(
          documentCsv([row("3.01", "2")]),
          "latin1",
        ),
      },
      { level: 6 },
    );
    const secondFileName = "itr_cia_aberta_DRE_con_2026.csv";
    const secondFileNameOffset = Buffer.from(damaged).indexOf(
      Buffer.from(secondFileName),
    );
    const secondFileExtraLength =
      damaged[secondFileNameOffset - 2]! |
      (damaged[secondFileNameOffset - 1]! << 8);
    damaged[
      secondFileNameOffset + secondFileName.length + secondFileExtraLength
    ] = 0xff;
    let firstRead = true;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(issuerCsv(["33.000.167/0001-01;9512;Petrobras;ATIVO"])),
      )
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            pull(controller) {
              if (firstRead) {
                firstRead = false;
                controller.enqueue(damaged);
              } else controller.error(new Error("connection closed"));
            },
          }),
        ),
      );

    await expect(
      new CvmFundamentalsProvider(fetcher).getByTicker({
        ticker: "PETR4",
        cnpj,
      }),
    ).rejects.toThrow(/^(?!connection closed$).+/);
  });

  it("uses the empty catalog CNPJ fallback for rows without that column", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("CD_CVM;DENOM_SOCIAL\n9512;Petrobras\n"),
      );

    await expect(
      new CvmFundamentalsProvider(fetcher).getByTicker({
        ticker: "PETR4",
        cnpj,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("uses an empty issuer code fallback when the catalog omits the code column", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("CNPJ_CIA;DENOM_SOCIAL\n33.000.167/0001-01;Petrobras\n"),
      );

    await expect(
      new CvmFundamentalsProvider(fetcher).getByTicker({
        ticker: "PETR4",
        cnpj,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
