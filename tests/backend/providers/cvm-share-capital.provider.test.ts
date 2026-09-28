import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseCvmFreArchive } from "@/backend/providers/cvm-share-capital.provider";

const issuerCnpj = "33000167000101";

function latin1(value: string) {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function csv(headers: string[], rows: string[][]) {
  const encode = (value: string) =>
    /[;"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return [
    headers.map(encode).join(";"),
    ...rows.map((row) => row.map(encode).join(";")),
  ].join("\r\n");
}

function archive(overrides: Record<string, string> = {}) {
  const year = 2026;
  const metadata = csv(
    [
      "CNPJ_CIA",
      "DT_REFER",
      "VERSAO",
      "DENOM_CIA",
      "CD_CVM",
      "CATEG_DOC",
      "ID_DOC",
      "DT_RECEB",
      "LINK_DOC",
    ],
    [
      [
        "33.000.167/0001-01",
        "2026-12-31",
        "2",
        "PETROLEO BRASILEIRO S.A. PETROBRAS",
        "009512",
        "FRE WEB",
        "777",
        "2026-05-29",
        "https://example.invalid/fre",
      ],
    ],
  );
  const common = [
    "CNPJ_Companhia",
    "Data_Referencia",
    "Versao",
    "ID_Documento",
    "Nome_Companhia",
  ];
  const tables: Record<string, string> = {
    [`fre_cia_aberta_${year}.csv`]: metadata,
    [`fre_cia_aberta_capital_social_${year}.csv`]: csv(
      [
        ...common,
        "ID_Capital_Social",
        "Tipo_Capital",
        "Quantidade_Acoes_Ordinarias",
        "Quantidade_Acoes_Preferenciais",
        "Quantidade_Total_Acoes",
      ],
      [
        [
          "33.000.167/0001-01",
          "2026-12-31",
          "2",
          "777",
          "PETROLEO BRASILEIRO S.A. PETROBRAS",
          "10",
          "Capital Integralizado",
          "100",
          "200",
          "300",
        ],
      ],
    ),
    [`fre_cia_aberta_capital_social_classe_acao_${year}.csv`]: csv(
      [
        ...common,
        "ID_Capital_Social",
        "Tipo_Classe_Acao_Preferencial",
        "Quantidade_Acoes",
      ],
      [
        [
          "33.000.167/0001-01",
          "2026-12-31",
          "2",
          "777",
          "PETROLEO BRASILEIRO S.A. PETROBRAS",
          "10",
          "Preferencial Classe A",
          "200",
        ],
      ],
    ),
    [`fre_cia_aberta_distribuicao_capital_${year}.csv`]: csv(
      [
        ...common,
        "Quantidade_Acoes_Ordinarias_Circulacao",
        "Quantidade_Acoes_Preferenciais_Circulacao",
        "Quantidade_Total_Acoes_Circulacao",
        "Percentual_Total_Acoes_Circulacao",
      ],
      [
        [
          "33.000.167/0001-01",
          "2026-12-31",
          "2",
          "777",
          "PETROLEO BRASILEIRO S.A. PETROBRAS",
          "50",
          "100",
          "150",
          "50",
        ],
      ],
    ),
    [`fre_cia_aberta_distribuicao_capital_classe_acao_${year}.csv`]: csv(
      [
        ...common,
        "Sigla_Classe_Acoes_Preferenciais",
        "Classe_Acoes_Preferenciais",
        "Quantidade_Acoes_Preferenciais_Circulacao",
      ],
      [
        [
          "33.000.167/0001-01",
          "2026-12-31",
          "2",
          "777",
          "PETROLEO BRASILEIRO S.A. PETROBRAS",
          "PNA",
          "Preferencial Classe A",
          "100",
        ],
      ],
    ),
    [`fre_cia_aberta_capital_social_titulo_conversivel_${year}.csv`]: csv(
      [
        ...common,
        "ID_Capital_Social",
        "Titulo_Conversivel_Acao",
        "Condicoes_Conversao",
      ],
      [
        [
          "33.000.167/0001-01",
          "2026-12-31",
          "2",
          "777",
          "PETROLEO BRASILEIRO S.A. PETROBRAS",
          "10",
          "Debênture",
          "Conversão mediante aprovação",
        ],
      ],
    ),
    [`fre_cia_aberta_posicao_acionaria_${year}.csv`]: csv(
      [
        ...common,
        "ID_Acionista",
        "Acionista",
        "CPF_CNPJ_Acionista",
        "CPF_CNPJ_Acionista_Relacionado",
        "CPF_CNPJ_Representante_legal",
        "Quantidade_Acao_Ordinaria_Circulacao",
        "Quantidade_Acao_Preferencial_Circulacao",
        "Quantidade_Total_Acoes_Circulacao",
        "Data_Composicao_Capital_Social",
        "Data_Ultima_Alteracao",
      ],
      [
        [
          "33.000.167/0001-01",
          "2026-12-31",
          "2",
          "777",
          "PETROLEO BRASILEIRO S.A. PETROBRAS",
          "900",
          "Ações Tesouraria",
          "00.000.000/0001-00",
          "11.111.111/0001-11",
          "22.222.222/0001-22",
          "22",
          "44",
          "66",
          "2026-04-20",
          "2026-04-21",
        ],
      ],
    ),
    [`fre_cia_aberta_posicao_acionaria_classe_acao_${year}.csv`]: csv(
      [
        ...common,
        "ID_Acionista",
        "Tipo_Classe_Acao_Preferencial",
        "Quantidade_Acoes",
        "Percentual_Acoes",
      ],
      [
        [
          "33.000.167/0001-01",
          "2026-12-31",
          "2",
          "777",
          "PETROLEO BRASILEIRO S.A. PETROBRAS",
          "900",
          "Preferencial Classe A",
          "44",
          "1.0",
        ],
      ],
    ),
    ...overrides,
  };
  return new Response(
    zipSync(
      Object.fromEntries(
        Object.entries(tables).map(([name, contents]) => [
          name,
          latin1(contents),
        ]),
      ),
    ),
  );
}

describe("parseCvmFreArchive", () => {
  it("stores current reported facts with document dates and conservative semantics", async () => {
    const fetchedAt = new Date("2026-09-28T12:00:00.000Z");
    const result = await parseCvmFreArchive(
      archive(),
      2026,
      new Set([issuerCnpj]),
      fetchedAt,
    );

    expect(result.records).toHaveLength(7);
    expect(result.records[0]).toMatchObject({
      issuerCnpj,
      referenceDate: "2026-12-31",
      documentVersion: 2,
      documentId: "777",
      documentReceivedDate: "2026-05-29",
      metadataStatus: "MATCHED",
      sourceArchive: "fre_cia_aberta_2026.zip",
      sourceFile: "fre_cia_aberta_capital_social_2026.csv",
      tickerClassStatus: "UNAVAILABLE",
      quantitySemantics: "REPORTED_CAPITAL_NOT_CURRENT_OUTSTANDING",
      fetchedAt: fetchedAt.toISOString(),
    });
    expect(
      result.records.find(
        (record) => record.recordKind === "CAPITAL_DISTRIBUTION",
      ),
    ).toMatchObject({
      quantitySemantics: "REPORTED_FREE_FLOAT_NOT_TOTAL_OUTSTANDING",
      rawFields: { Quantidade_Total_Acoes_Circulacao: "150" },
    });
    expect(
      result.records.find(
        (record) => record.recordKind === "CONVERTIBLE_SECURITY_DESCRIPTION",
      ),
    ).toMatchObject({
      quantitySemantics: "DESCRIPTION_ONLY_NOT_EXERCISE_EVIDENCE",
      rawFields: { Condicoes_Conversao: "Conversão mediante aprovação" },
    });
    const treasury = result.records.find(
      (record) => record.recordKind === "TREASURY_POSITION",
    );
    expect(treasury).toMatchObject({
      shareholderId: "900",
      quantitySemantics: "REPORTED_TREASURY_HOLDING_UNRECONCILED",
      rawFields: {
        Acionista: "Ações Tesouraria",
        Quantidade_Acao_Ordinaria_Circulacao: "22",
      },
    });
    const storedTreasury = JSON.stringify(treasury?.rawFields);
    expect(storedTreasury).not.toContain("00.000.000/0001-00");
    expect(storedTreasury).not.toContain("11.111.111/0001-11");
    expect(storedTreasury).not.toContain("22.222.222/0001-22");
    expect(result.diagnostics.documentsMatched).toBe(1);
    expect(result.diagnostics.ingestionStatus).toBe("PARTIAL");
    expect(result.diagnostics.unavailableCoverageReasons).toContain(
      "The current FRE archive does not provide structured historical capital events or treasury movements.",
    );
    expect(result.diagnostics.unsupportedEventTables).toEqual([
      "capital_increase_reduction",
      "stock_split_reverse_split_bonus",
      "treasury_movement",
      "convertible_exercise",
    ]);
  });

  it("marks missing or duplicate document metadata and excludes unknown issuers", async () => {
    const source = archive({
      [`fre_cia_aberta_capital_social_2026.csv`]: csv(
        [
          "CNPJ_Companhia",
          "Data_Referencia",
          "Versao",
          "ID_Documento",
          "Nome_Companhia",
          "ID_Capital_Social",
          "Tipo_Capital",
          "Quantidade_Total_Acoes",
        ],
        [
          [
            "33.000.167/0001-01",
            "2026-12-31",
            "9",
            "999",
            "Petrobras",
            "1",
            "Integralizado",
            "100",
          ],
          [
            "99.000.000/0001-99",
            "2026-12-31",
            "2",
            "777",
            "Unknown",
            "2",
            "Integralizado",
            "100",
          ],
        ],
      ),
    });
    const result = await parseCvmFreArchive(
      source,
      2026,
      new Set([issuerCnpj]),
    );
    expect(
      result.records.find((record) => record.documentId === "999"),
    ).toMatchObject({
      documentId: "999",
      documentReceivedDate: null,
      metadataStatus: "UNAVAILABLE",
    });
    expect(result.diagnostics.documentsWithoutMetadata).toBe(1);
  });

  it("marks duplicate FRE metadata for the same document as ambiguous", async () => {
    const metadataHeaders = [
      "CNPJ_CIA",
      "DT_REFER",
      "VERSAO",
      "DENOM_CIA",
      "CD_CVM",
      "CATEG_DOC",
      "ID_DOC",
      "DT_RECEB",
      "LINK_DOC",
    ];
    const metadataRow = [
      "33.000.167/0001-01",
      "2026-12-31",
      "2",
      "PETROLEO BRASILEIRO S.A. PETROBRAS",
      "009512",
      "FRE WEB",
      "777",
      "2026-05-29",
      "https://example.invalid/fre",
    ];
    const result = await parseCvmFreArchive(
      archive({
        "fre_cia_aberta_2026.csv": csv(metadataHeaders, [
          metadataRow,
          metadataRow,
        ]),
      }),
      2026,
      new Set([issuerCnpj]),
    );

    expect(result.records[0]).toMatchObject({
      documentId: "777",
      metadataStatus: "AMBIGUOUS",
      documentReceivedDate: null,
    });
    expect(result.diagnostics.ambiguousDocuments).toBe(1);
  });

  it("parses quoted multiline fields while preserving logical row provenance", async () => {
    const capitalFile = "fre_cia_aberta_capital_social_2026.csv";
    const source = archive({
      [capitalFile]: csv(
        [
          "CNPJ_Companhia",
          "Data_Referencia",
          "Versao",
          "ID_Documento",
          "Nome_Companhia",
          "ID_Capital_Social",
          "Tipo_Capital",
          "Quantidade_Total_Acoes",
        ],
        [
          [
            "33.000.167/0001-01",
            "2026-12-31",
            "2",
            "777",
            "PETROBRAS; companhia\nparte 2",
            "10",
            "Integralizado",
            "300",
          ],
        ],
      ),
    });
    const result = await parseCvmFreArchive(
      source,
      2026,
      new Set([issuerCnpj]),
    );

    expect(
      result.records.find((record) => record.sourceFile === capitalFile),
    ).toMatchObject({
      sourceRow: 2,
      rawFields: { Nome_Companhia: "PETROBRAS; companhia\nparte 2" },
    });
  });

  it("rejects missing required treasury semantics instead of reporting completion", async () => {
    const source = archive({
      ["fre_cia_aberta_posicao_acionaria_2026.csv"]: csv(
        [
          "CNPJ_Companhia",
          "Data_Referencia",
          "Versao",
          "ID_Documento",
          "ID_Acionista",
          "Acionista",
          "CPF_CNPJ_Acionista",
        ],
        [],
      ),
    });

    await expect(
      parseCvmFreArchive(source, 2026, new Set([issuerCnpj])),
    ).rejects.toThrow(
      "CVM FRE posicao_acionaria CSV is missing required columns: CPF_CNPJ_Acionista_Relacionado, CPF_CNPJ_Representante_legal, Quantidade_Total_Acoes_Circulacao, Data_Composicao_Capital_Social, Data_Ultima_Alteracao",
    );
  });

  it("rejects failed and bodyless CVM responses", async () => {
    expect(() =>
      parseCvmFreArchive(new Response(null, { status: 503 }), 2026, new Set()),
    ).toThrow("CVM FRE request failed: 503");
    expect(() =>
      parseCvmFreArchive(new Response(null), 2026, new Set()),
    ).toThrow("CVM FRE response has no body");
  });
});
