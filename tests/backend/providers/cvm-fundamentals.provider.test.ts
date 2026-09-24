import { Buffer } from "node:buffer";
import { zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { CvmFundamentalsProvider } from "@/backend/providers/cvm-fundamentals.provider";

const cnpj = "33000167000101";
const cadHeader = "CNPJ_CIA;CD_CVM;DENOM_SOCIAL;SIT";
const documentHeader =
  "CNPJ_CIA;CD_CVM;DT_REFER;VERSAO;ORDEM_EXERC;CD_CONTA;VL_CONTA;ESCALA_MOEDA";

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
    VERSAO: "1",
    ORDEM_EXERC: String.fromCharCode(218) + "LTIMO",
    CD_CONTA: account,
    VL_CONTA: value,
    ESCALA_MOEDA: "MIL",
    ...options,
  };
  return Object.values(fields).join(";");
}

function documentCsv(rows: string[]) {
  return [documentHeader, ...rows].join("\n");
}

function issuerCsv(rows: string[]) {
  return [cadHeader, ...rows].join("\n");
}

describe("CvmFundamentalsProvider", () => {
  it("normalizes issuer data and streamed DFP and ITR accounts, preferring the latest version", async () => {
    const year = new Date().getUTCFullYear();
    const dfpRows = [
      row("3.01", "100", { VERSAO: "abc" }),
      row("3.01", "1.234,50", { VERSAO: "2" }),
      row("3.01", "999", { VERSAO: "1" }),
      row("3.11", "20"),
      row("2.03", "30"),
      row("1", "40"),
      row("2", "10"),
      row("1.01.01", "5"),
      row("2.01.04", "invalid"),
      row("2.02.01", "7"),
      row("3.01", "999", { CNPJ_CIA: "00.000.000/0001-00" }),
      row("3.01", "999", { CD_CVM: "123" }),
      row("3.01", "999", {
        ORDEM_EXERC: "PEN" + String.fromCharCode(218) + "LTIMO",
      }),
      row("9.99", "999"),
      row("3.01", "999", { DT_REFER: "" }),
    ];
    const itr = documentCsv([
      row("3.01", "2", { DT_REFER: "2026-03-31" }),
      row("1.01.01", "", { DT_REFER: "2026-03-31", ESCALA_MOEDA: " reais " }),
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
            documentCsv([row("3.01", "4")]),
          ),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(csvZip("itr_cia_aberta_DRE_con_2026.csv", itr)),
      );

    const periods = await new CvmFundamentalsProvider(fetcher).getByTicker({
      ticker: "PETR4",
      cnpj: "33.000.167/0001-01",
    });

    expect(periods).toEqual([
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
        sourceDocument: "DFP",
        revenue: "1234500.00",
        netIncome: "20000.00",
        equity: "30000.00",
        assets: "40000.00",
        liabilities: "10000.00",
        cash: "5000.00",
        debt: "7000.00",
      }),
      expect.objectContaining({
        referenceDate: "2025-12-31",
        periodType: "annual",
        revenue: "4000.00",
      }),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv",
      `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${year - 1}.zip`,
      `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${year - 2}.zip`,
      `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${year - 3}.zip`,
      `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_${year}.zip`,
    ]);
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
    const optionalFiles = zipSync({
      "dfp_cia_aberta_DRE_con_2025.csv": Buffer.from(
        `${minimalHeader}\n${minimalRow}`,
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
        revenue: "1.50",
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
