import { zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import {
  CvmValuationInputProvider,
  deriveQuarterlyFlowFacts,
  parseCvmValuationArchive,
  type ValuationAccountingFactRecord,
} from "@/backend/providers/cvm-valuation-input.provider";

const cnpj = "33.000.167/0001-01";
const registry = new Map([["9512", "33000167000101"]]);
const docs = "CNPJ_CIA;DT_REFER;VERSAO;CATEG_DOC;ID_DOC;DT_RECEB";
const accounts =
  "CNPJ_CIA;CD_CVM;DT_REFER;VERSAO;GRUPO_DFP;MOEDA;ESCALA_MOEDA;ORDEM_EXERC;DT_FIM_EXERC;DT_INI_EXERC;CD_CONTA;DS_CONTA;VL_CONTA";
const csv = (header: string, ...values: string[][]) =>
  [header, ...values.map((row) => row.join(";"))].join(String.fromCharCode(10));
const doc = (ref = "2024-12-31") => [
  cnpj,
  ref,
  "1",
  "DFP",
  "12345",
  "2025-03-01",
];
const row = (
  code: string,
  label: string,
  value: string,
  statement: string,
  ref = "2024-12-31",
  start = "2024-01-01",
  end: string | null = ref,
) => [
  cnpj,
  "9512",
  ref,
  "1",
  "DF Consolidado - " + statement,
  "REAL",
  "MIL",
  "ÚLTIMO",
  end ?? "",
  start,
  code,
  label,
  value,
];

function zip(files: Record<string, string>) {
  const entries = Object.fromEntries(
    Object.entries(files).map(([name, value]) => [
      name,
      Uint8Array.from([...value].map((character) => character.charCodeAt(0))),
    ]),
  );
  return new Response(new Uint8Array(zipSync(entries)));
}

function fact(
  overrides: Partial<ValuationAccountingFactRecord> &
    Pick<
      ValuationAccountingFactRecord,
      | "documentType"
      | "referenceDate"
      | "periodStart"
      | "periodEnd"
      | "rawValue"
    >,
): ValuationAccountingFactRecord {
  const base: ValuationAccountingFactRecord = {
    factKey: "fact-base",
    issuerCnpj: "33000167000101",
    documentType: "ITR",
    documentId: "doc",
    documentCategory: "ITR",
    documentReceivedDate: "2024-11-10",
    metadataMatch: "MATCHED",
    referenceDate: "2024-03-31",
    periodStart: "2024-01-01",
    periodEnd: "2024-03-31",
    statement: "DFC_MI",
    accountCode: "6.01.01.04",
    accountLabel: "Depreciação e amortização",
    candidateKind: "DEPRECIATION_AMORTIZATION_CANDIDATE",
    rawValue: "100",
    currency: "REAL",
    scale: "MIL",
    statementGroup: "DF Consolidado - DFC",
    exerciseOrder: "ÚLTIMO",
    version: "1",
    sourceFile: "source.zip#dfc.csv",
    sourceRow: 2,
    archiveFetchedAt: new Date("2026-09-28T00:00:00.000Z"),
    recordType: "REPORTED",
    calculatedValue: null,
    derivationMethod: null,
    derivationCurrentFactKey: null,
    derivationPreviousFactKey: null,
  };
  return Object.assign(base, overrides);
}
describe("CVM valuation accounting input provider", () => {
  it("keeps raw consolidated facts and filing dates, units, version and row provenance", async () => {
    const parsed = await parseCvmValuationArchive(
      zip({
        "dfp_cia_aberta_2024.csv": csv(docs, doc()),
        "dfp_cia_aberta_DRE_con_2024.csv": csv(
          accounts,
          row(
            "3.05",
            "Resultado Antes do Resultado Financeiro e dos Tributos",
            "1000.00",
            "DRE",
          ),
          row(
            "3.08",
            "Imposto de renda e contribuição social",
            "-250.00",
            "DRE",
          ),
        ),
        "dfp_cia_aberta_DFC_MI_con_2024.csv": csv(
          accounts,
          row(
            "6.01.01.06",
            "Depreciação, amortização e exaustão",
            "55.00",
            "DFC",
          ),
          row("6.02.01", "Aquisição de ativo imobilizado", "-75.00", "DFC"),
          row("6.02.08", "Aquisição de subsidiária", "-90.00", "DFC"),
        ),
        "dfp_cia_aberta_BPA_con_2024.csv": csv(
          accounts,
          row(
            "1.01.01",
            "Caixa e equivalentes de caixa",
            "90.00",
            "BPA",
            "2024-12-31",
            "",
          ),
        ),
        "dfp_cia_aberta_BPP_con_2024.csv": csv(
          accounts,
          row(
            "2.01.04",
            "Empréstimos e financiamentos",
            "45.00",
            "BPP",
            "2024-12-31",
            "",
          ),
        ),
        "dfp_cia_aberta_DRE_ind_2024.csv": csv(
          accounts,
          row(
            "3.05",
            "Resultado Antes do Resultado Financeiro e dos Tributos",
            "999.00",
            "DRE",
          ),
        ),
      }),
      "DFP",
      2024,
      registry,
      new Date("2026-09-28T12:00:00.000Z"),
    );
    expect(parsed).toHaveLength(7);
    expect(parsed[0]).toMatchObject({
      documentId: "12345",
      documentReceivedDate: "2025-03-01",
      metadataMatch: "MATCHED",
      accountCode: "3.05",
      candidateKind: "EBIT_CANDIDATE",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      rawValue: "1000.00",
      currency: "REAL",
      scale: "MIL",
      sourceFile: "dfp_cia_aberta_2024.zip#dfp_cia_aberta_DRE_con_2024.csv",
      sourceRow: 2,
      recordType: "REPORTED",
    });
    expect(parsed.map((item) => item.candidateKind)).toEqual([
      "EBIT_CANDIDATE",
      "TAX_CANDIDATE",
      "DEPRECIATION_AMORTIZATION_CANDIDATE",
      "CAPEX_CANDIDATE",
      "INVESTING_CASH_FLOW_CANDIDATE",
      "CASH_BALANCE_CANDIDATE",
      "FINANCIAL_DEBT_CANDIDATE",
    ]);
  });

  it("rejects ambiguous filing metadata and parses published receipt dates", async () => {
    const duplicateMetadata = await parseCvmValuationArchive(
      zip({
        "dfp_cia_aberta_2024.csv": csv(docs, doc(), doc()),
        "dfp_cia_aberta_DRE_con_2024.csv": csv(
          accounts,
          row(
            "3.05",
            "Resultado Antes do Resultado Financeiro e dos Tributos",
            "100",
            "DRE",
          ),
        ),
      }),
      "DFP",
      2024,
      registry,
      new Date(),
    );
    expect(duplicateMetadata[0]).toMatchObject({
      metadataMatch: "AMBIGUOUS",
      documentReceivedDate: null,
    });

    const publishedDocument = doc();
    publishedDocument[5] = "15/03/2025";
    const parsedDate = await parseCvmValuationArchive(
      zip({
        "dfp_cia_aberta_2024.csv": csv(docs, publishedDocument),
        "dfp_cia_aberta_DRE_con_2024.csv": csv(
          accounts,
          row(
            "3.05",
            "Resultado Antes do Resultado Financeiro e dos Tributos",
            "100",
            "DRE",
          ),
        ),
      }),
      "DFP",
      2024,
      registry,
      new Date(),
    );
    expect(parsedDate[0]?.documentReceivedDate).toBe("2025-03-15");
  });
  it("retains missing metadata and blank values without zero imputation", async () => {
    const parsed = await parseCvmValuationArchive(
      zip({
        "itr_cia_aberta_DRE_con_2024.csv": csv(
          accounts,
          row(
            "3.05",
            "Resultado Antes do Resultado Financeiro e dos Tributos",
            "",
            "DRE",
          ),
        ),
      }),
      "ITR",
      2024,
      registry,
      new Date(),
    );
    expect(parsed[0]).toMatchObject({
      rawValue: null,
      documentId: null,
      documentReceivedDate: null,
      metadataMatch: "MISSING",
    });
  });

  it("classifies reported balance and cash flow candidates without mixing acquisitions", async () => {
    const parsed = await parseCvmValuationArchive(
      zip({
        "dfp_cia_aberta_BPA_con_2024.csv": csv(
          accounts,
          row("1.01.01", '"Caixa; ""equivalentes"""', "10", "BPA"),
          row("1.01.02", "Clientes", "20", "BPA"),
        ),
        "dfp_cia_aberta_BPP_con_2024.csv": csv(
          accounts,
          row("2.01.01", "Empréstimos", "30", "BPP"),
          row("2.02.01", "Fornecedores", "40", "BPP"),
        ),
        "dfp_cia_aberta_DFC_MI_con_2024.csv": csv(
          accounts,
          row("6.01.01.04", "Fornecedores", "-4", "DFC"),
          row("6.01.01.05", "Depreciação e amortização", "5", "DFC"),
          row("6.01.01.06", "Recebimentos de clientes", "6", "DFC"),
          row("6.02.05", "Adições ao imobilizado", "-7", "DFC"),
          row("6.02.04", "Adições ao imobilizado e investimentos", "-8", "DFC"),
          row("6.02.03", "Aquisição de controlada", "-9", "DFC"),
        ),
      }),
      "DFP",
      2024,
      registry,
      new Date(),
    );
    const kinds = new Map(
      parsed.map((fact) => [
        `${fact.statement}:${fact.accountCode}`,
        fact.candidateKind,
      ]),
    );
    expect(Object.fromEntries(kinds)).toMatchObject({
      "BPA:1.01.01": "CASH_BALANCE_CANDIDATE",
      "BPA:1.01.02": "BALANCE_CURRENT_ASSET_CANDIDATE",
      "BPP:2.01.01": "FINANCIAL_DEBT_CANDIDATE",
      "BPP:2.02.01": "BALANCE_NON_CURRENT_LIABILITY_CANDIDATE",
      "DFC_MI:6.01.01.04": "WORKING_CAPITAL_FLOW_CANDIDATE",
      "DFC_MI:6.01.01.05": "DEPRECIATION_AMORTIZATION_CANDIDATE",
      "DFC_MI:6.01.01.06": "OPERATING_CASH_FLOW_CANDIDATE",
      "DFC_MI:6.02.05": "CAPEX_CANDIDATE",
      "DFC_MI:6.02.04": "INVESTING_CASH_FLOW_CANDIDATE",
      "DFC_MI:6.02.03": "INVESTING_CASH_FLOW_CANDIDATE",
    });
  });
  it("preserves missing source columns and skips invalid or stale statement rows", async () => {
    const sparseDocumentCsv = [
      "CNPJ_CIA;DT_REFER;VERSAO",
      [cnpj, "2024-12-31", "v-next"].join(";"),
    ].join(String.fromCharCode(10));
    const sparseDreCsv = [
      "CNPJ_CIA;CD_CVM;DT_REFER;VERSAO;GRUPO_DFP;ORDEM_EXERC;DT_INI_EXERC;CD_CONTA;DS_CONTA;VL_CONTA",
      [
        cnpj,
        "9512",
        "2024-12-31",
        "v-next",
        "DF Consolidado - DRE",
        "ÚLTIMO",
        "2024-01-01",
        "3.05",
        "Resultado Antes do Resultado Financeiro e dos Tributos",
        "100",
      ].join(";"),
    ].join(String.fromCharCode(10));
    const sparse = await parseCvmValuationArchive(
      zip({
        "dfp_cia_aberta_2024.csv": sparseDocumentCsv,
        "dfp_cia_aberta_DRE_con_2024.csv": sparseDreCsv,
      }),
      "DFP",
      2024,
      registry,
      new Date(),
    );
    expect(sparse[0]).toMatchObject({
      documentCategory: null,
      documentId: null,
      documentReceivedDate: null,
      metadataMatch: "MATCHED",
      currency: null,
      scale: null,
      periodEnd: null,
      version: "v-next",
    });

    const wrongIssuer = row(
      "3.05",
      "Resultado Antes do Resultado Financeiro e dos Tributos",
      "10",
      "DRE",
    );
    wrongIssuer[1] = "wrong-cvm-code";
    const invalidDate = row(
      "3.05",
      "Resultado Antes do Resultado Financeiro e dos Tributos",
      "10",
      "DRE",
    );
    invalidDate[2] = "not-a-date";
    const stale = row(
      "3.05",
      "Resultado Antes do Resultado Financeiro e dos Tributos",
      "10",
      "DRE",
      "2016-12-31",
      "2016-01-01",
    );
    const unsupportedAccount = row("3.04", "Lucro bruto", "10", "DRE");
    const rejected = await parseCvmValuationArchive(
      zip({
        "dfp_cia_aberta_2024.csv": csv(docs, doc()),
        "dfp_cia_aberta_DRE_con_2024.csv": csv(
          accounts,
          wrongIssuer,
          invalidDate,
          stale,
          unsupportedAccount,
        ),
        "unrelated.csv": "not a statement file",
      }),
      "DFP",
      2024,
      registry,
      new Date(),
    );
    expect(rejected).toEqual([]);
  });

  it("keeps ITR differences exact across comma decimals, negative and zero values", () => {
    const prior = fact({
      documentType: "ITR",
      referenceDate: "2024-03-31",
      periodStart: "2024-01-01",
      periodEnd: "2024-03-31",
      documentReceivedDate: "2024-05-10",
      rawValue: "100,50",
    });
    const current = fact({
      documentType: "ITR",
      referenceDate: "2024-06-30",
      periodStart: "2024-01-01",
      periodEnd: "2024-06-30",
      documentReceivedDate: "2024-08-10",
      rawValue: "90,00",
    });
    expect(deriveQuarterlyFlowFacts([prior, current])[0]?.calculatedValue).toBe(
      "-10.50",
    );
    expect(
      deriveQuarterlyFlowFacts([
        { ...prior, rawValue: "100", factKey: "integer-prior" },
        { ...current, rawValue: "100", factKey: "integer-current" },
      ])[0]?.calculatedValue,
    ).toBe("0");
    expect(
      deriveQuarterlyFlowFacts([
        prior,
        { ...current, rawValue: "not-a-number", factKey: "invalid-current" },
      ]),
    ).toEqual([]);
    expect(
      deriveQuarterlyFlowFacts([
        prior,
        { ...current, rawValue: "", factKey: "blank-current" },
      ]),
    ).toEqual([]);
    expect(
      deriveQuarterlyFlowFacts([
        prior,
        { ...current, periodStart: "2024-02-01", factKey: "wrong-period" },
      ]),
    ).toEqual([]);
  });
  it("keeps an absent reported period end unavailable", async () => {
    const parsed = await parseCvmValuationArchive(
      zip({
        "itr_cia_aberta_DRE_con_2024.csv": csv(
          accounts,
          row(
            "3.05",
            "Resultado Antes do Resultado Financeiro e dos Tributos",
            "100",
            "DRE",
            "2024-06-30",
            "2024-01-01",
            null,
          ),
        ),
      }),
      "ITR",
      2024,
      registry,
      new Date(),
    );
    expect(parsed[0]?.periodEnd).toBeNull();
    expect(deriveQuarterlyFlowFacts(parsed)).toEqual([]);
  });
  it("derives compatible Q2, Q3 and Q4 periods with both source fact keys", () => {
    const q1 = fact({
      documentType: "ITR",
      referenceDate: "2024-03-31",
      periodStart: "2024-01-01",
      periodEnd: "2024-03-31",
      documentReceivedDate: "2024-05-10",
      rawValue: "100.00",
    });
    const q2 = fact({
      documentType: "ITR",
      referenceDate: "2024-06-30",
      periodStart: "2024-01-01",
      periodEnd: "2024-06-30",
      documentReceivedDate: "2024-08-10",
      rawValue: "250.00",
    });
    const q3 = fact({
      documentType: "ITR",
      referenceDate: "2024-09-30",
      periodStart: "2024-01-01",
      periodEnd: "2024-09-30",
      documentReceivedDate: "2024-11-10",
      rawValue: "430.00",
    });
    const annual = fact({
      documentType: "DFP",
      referenceDate: "2024-12-31",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      documentReceivedDate: "2025-03-10",
      rawValue: "600.00",
    });
    const result = deriveQuarterlyFlowFacts([q1, q2, q3, annual]);
    expect(
      result.map((item) => [item.periodStart, item.calculatedValue]),
    ).toEqual([
      ["2024-04-01", "150.00"],
      ["2024-07-01", "180.00"],
      ["2024-10-01", "170.00"],
    ]);
    expect(result[1]).toMatchObject({
      derivationMethod: "ITR_YTD_DIFFERENCE",
      derivationCurrentFactKey: q3.factKey,
      derivationPreviousFactKey: q2.factKey,
    });
    expect(q2.rawValue).toBe("250.00");
  });

  it("refuses missing, same-day, or concept and unit mismatches", () => {
    const prior = fact({
      documentType: "ITR",
      referenceDate: "2024-03-31",
      periodStart: "2024-01-01",
      periodEnd: "2024-03-31",
      documentReceivedDate: "2024-05-10",
      rawValue: "100",
    });
    const current = fact({
      documentType: "ITR",
      referenceDate: "2024-06-30",
      periodStart: "2024-01-01",
      periodEnd: "2024-06-30",
      documentReceivedDate: "2024-08-10",
      rawValue: "250",
    });
    expect(deriveQuarterlyFlowFacts([current])).toEqual([]);
    expect(
      deriveQuarterlyFlowFacts([
        prior,
        { ...current, documentReceivedDate: "2024-05-10" },
      ]),
    ).toEqual([]);
    const sameDayAlternative = {
      ...prior,
      factKey: "prior-version-2",
      version: "2",
    };
    expect(
      deriveQuarterlyFlowFacts([prior, sameDayAlternative, current]),
    ).toEqual([]);
    expect(
      deriveQuarterlyFlowFacts([prior, { ...current, scale: "UNIDADE" }]),
    ).toEqual([]);
    expect(
      deriveQuarterlyFlowFacts([
        prior,
        { ...current, accountLabel: "Outra conta" },
      ]),
    ).toEqual([]);
    expect(
      deriveQuarterlyFlowFacts([
        prior,
        { ...current, statementGroup: "DF Individual - DFC" },
      ]),
    ).toEqual([]);
    expect(
      deriveQuarterlyFlowFacts([prior, { ...current, rawValue: null }]),
    ).toEqual([]);
  });

  it("does not derive annual periods without a matching calendar-year ITR Q3", () => {
    const wrongAnnualPeriod = fact({
      documentType: "DFP",
      referenceDate: "2024-12-31",
      rawValue: "100",
      periodStart: "2024-02-01",
      periodEnd: "2024-12-31",
      factKey: "wrong-annual-period",
    });
    const annual = fact({
      documentType: "DFP",
      referenceDate: "2024-12-31",
      rawValue: "100",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      factKey: "annual",
    });
    const mismatchedQ3 = fact({
      documentType: "ITR",
      rawValue: "80",
      referenceDate: "2024-09-30",
      periodStart: "2024-01-01",
      periodEnd: "2024-06-30",
      factKey: "mismatched-q3",
    });
    const invalidAnnualValue = {
      ...annual,
      rawValue: "invalid",
      factKey: "invalid-annual",
      documentReceivedDate: "2025-03-01",
    };

    expect(deriveQuarterlyFlowFacts([wrongAnnualPeriod])).toEqual([]);
    expect(deriveQuarterlyFlowFacts([annual])).toEqual([]);
    expect(deriveQuarterlyFlowFacts([annual, mismatchedQ3])).toEqual([]);
    expect(
      deriveQuarterlyFlowFacts([
        invalidAnnualValue,
        fact({
          documentType: "ITR",
          referenceDate: "2024-09-30",
          rawValue: "90",
          periodStart: "2024-01-01",
          periodEnd: "2024-09-30",
          factKey: "valid-q3",
        }),
      ]),
    ).toEqual([]);
  });

  it("parses streamed chunks and terminal newlines, retaining unknown labels as uncategorized", async () => {
    const dre =
      csv(
        accounts,
        row("3.05", "Lucro bruto", "100", "DRE"),
        row("3.08", "Tributos diversos", "20", "DRE"),
      ) + String.fromCharCode(10);
    const archive = zip({
      "dfp_cia_aberta_DRE_con_2024.csv": dre,
    });
    const bytes = new Uint8Array(await archive.arrayBuffer());
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, 12));
          controller.enqueue(bytes.slice(12, 39));
          controller.enqueue(bytes.slice(39));
          controller.close();
        },
      }),
    );
    const parsed = await parseCvmValuationArchive(
      response,
      "DFP",
      2024,
      registry,
      new Date(),
    );
    expect(parsed.map(({ candidateKind }) => candidateKind)).toEqual([
      null,
      null,
    ]);
  });
  it("keeps optional CVM columns absent and rejects rows without issuer or account keys", async () => {
    const parsed = await parseCvmValuationArchive(
      zip({
        "dfp_cia_aberta_2024.csv": csv("DT_REFER", ["2024-12-31"]),
        "dfp_cia_aberta_DRE_con_2024.csv": csv(
          "CNPJ_CIA;DT_REFER;CD_CONTA;VL_CONTA",
          ["33000167000101", "2024-12-31", "3.05", "100"],
        ),
        "dfp_cia_aberta_DRE_con_without_cvm.csv": csv(
          "CNPJ_CIA;CD_CVM;DT_REFER;VL_CONTA",
          ["33000167000101", "9512", "2024-12-31", "100"],
        ),
        "dfp_cia_aberta_DRE_con_extra_2024.csv": csv(
          "CNPJ_CIA;CD_CVM;DT_REFER;CD_CONTA;VL_CONTA",
          ["33000167000101", "9512", "2024-12-31", "3.05", "100", "extra"],
        ),
      }),
      "DFP",
      2024,
      registry,
      new Date(),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      accountLabel: "",
      candidateKind: null,
      rawValue: "100",
      currency: null,
      scale: null,
      statementGroup: null,
      exerciseOrder: null,
      version: "",
      metadataMatch: "MISSING",
    });
  });

  it("classifies current non-debt liabilities and parses negative source flows", async () => {
    const parsed = await parseCvmValuationArchive(
      zip({
        "dfp_cia_aberta_BPP_con_2024.csv": csv(
          accounts,
          row("2.01.02", "Fornecedores", "40", "BPP"),
        ),
      }),
      "DFP",
      2024,
      registry,
      new Date(),
    );
    expect(parsed[0]?.candidateKind).toBe(
      "BALANCE_CURRENT_LIABILITY_CANDIDATE",
    );

    const q1 = fact({
      documentType: "ITR",
      referenceDate: "2024-03-31",
      periodStart: "2024-01-01",
      periodEnd: "2024-03-31",
      documentReceivedDate: "2024-05-10",
      rawValue: "0",
    });
    const q2 = fact({
      documentType: "ITR",
      referenceDate: "2024-06-30",
      periodStart: "2024-01-01",
      periodEnd: "2024-06-30",
      documentReceivedDate: "2024-08-10",
      rawValue: "-1.25",
    });
    const q4 = fact({
      documentType: "ITR",
      referenceDate: "2024-12-31",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      documentReceivedDate: "2025-03-10",
      rawValue: "10",
    });
    expect(deriveQuarterlyFlowFacts([q1, q2])[0]?.calculatedValue).toBe(
      "-1.25",
    );
    expect(deriveQuarterlyFlowFacts([q4])).toEqual([]);
  });
  it("rejects malformed compressed CVM members through the archive callback", async () => {
    const archive = zip({
      "dfp_cia_aberta_DRE_con_bad_2024.csv": csv(
        accounts,
        row(
          "3.05",
          "Resultado Antes do Resultado Financeiro e dos Tributos",
          "100",
          "DRE",
        ),
      ),
      "dfp_cia_aberta_DRE_con_after_2024.csv": csv(
        accounts,
        row(
          "3.05",
          "Resultado Antes do Resultado Financeiro e dos Tributos",
          "100",
          "DRE",
        ),
      ),
    });
    const bytes = new Uint8Array(await archive.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const compressedDataStart =
      30 + view.getUint16(26, true) + view.getUint16(28, true);
    bytes[compressedDataStart] = 0xff;
    await expect(
      parseCvmValuationArchive(
        new Response(bytes),
        "DFP",
        2024,
        registry,
        new Date(),
      ),
    ).rejects.toThrow();
  });

  it("processes large CVM member streams in multiple chunks", async () => {
    const sourceRow = row(
      "3.05",
      "Resultado Antes do Resultado Financeiro e dos Tributos",
      "100",
      "DRE",
    ).join(";");
    const largeCsv = [accounts, ...new Array(12000).fill(sourceRow)].join(
      String.fromCharCode(10),
    );
    const archive = zip({ "dfp_cia_aberta_DRE_con_large_2024.csv": largeCsv });
    const bytes = new Uint8Array(await archive.arrayBuffer());
    const response = new Response(
      new ReadableStream({
        start(controller) {
          for (let offset = 0; offset < bytes.length; offset += 128) {
            controller.enqueue(bytes.slice(offset, offset + 128));
          }
          controller.close();
        },
      }),
    );
    const parsed = await parseCvmValuationArchive(
      response,
      "DFP",
      2024,
      registry,
      new Date(),
    );
    expect(parsed).toHaveLength(12000);
  });
  it("rejects a CVM archive whose response stream fails", async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error("stream read failed"));
        },
      }),
    );
    await expect(
      parseCvmValuationArchive(response, "DFP", 2024, registry, new Date()),
    ).rejects.toThrow("stream read failed");
  });
  it("fetches the official archive URL and fails closed on HTTP or body errors", async () => {
    const fetcher = vi.fn().mockResolvedValue(zip({}));
    await new CvmValuationInputProvider(fetcher).getArchive(
      "ITR",
      2024,
      registry,
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_2024.zip",
    );
    await expect(
      new CvmValuationInputProvider(
        vi.fn().mockResolvedValue(new Response("", { status: 503 })),
      ).getArchive("DFP", 2024, registry),
    ).rejects.toThrow("CVM DFP request failed: 503");
    await expect(
      parseCvmValuationArchive(
        new Response(null),
        "DFP",
        2024,
        registry,
        new Date(),
      ),
    ).rejects.toThrow("CVM DFP response has no body");
  });
});
