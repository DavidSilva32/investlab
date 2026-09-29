import { zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import {
  CvmShareCapitalProvider,
  cvmShareCapitalProviderInternals,
  parseCvmFreArchive,
} from "@/backend/providers/cvm-share-capital.provider";

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

function archive(
  overrides: Record<string, string | null> = {},
  level: NonNullable<Parameters<typeof zipSync>[1]>["level"] = 0,
) {
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
        Object.entries(tables)
          .filter((entry): entry is [string, string] => entry[1] !== null)
          .map(([name, contents]) => [name, latin1(contents)]),
      ),
      { level },
    ),
  );
}

describe("parseCvmFreArchive", () => {
  it("validates FRE identifiers and integer document versions", () => {
    expect(cvmShareCapitalProviderInternals.parseInteger(undefined)).toBeNull();
    expect(cvmShareCapitalProviderInternals.parseInteger(" ")).toBeNull();
    expect(cvmShareCapitalProviderInternals.parseInteger("2")).toBe(2);
    expect(cvmShareCapitalProviderInternals.parseInteger("-1")).toBeNull();
    expect(
      cvmShareCapitalProviderInternals.parseInteger("9007199254740992"),
    ).toBeNull();
    expect(cvmShareCapitalProviderInternals.sourceKind("other.csv")).toBeNull();
    expect(
      cvmShareCapitalProviderInternals.sourceKind(
        "fre_cia_aberta_capital_social_2026.csv",
      ),
    ).toBe("CAPITAL_SOCIAL");
    expect(
      cvmShareCapitalProviderInternals.documentKey({
        CNPJ_Companhia: "issuer",
        Data_Referencia: "date",
        Versao: "version",
        ID_Documento: "document",
      }),
    ).toBe("issuer|date|version|document");
    expect(
      cvmShareCapitalProviderInternals.documentKey({
        CNPJ_CIA: "issuer-primary",
        DT_REFER: "date-primary",
        VERSAO: "version-primary",
        ID_DOC: "document-primary",
      }),
    ).toBe("issuer-primary|date-primary|version-primary|document-primary");
  });

  it("uses the annual archive URL and the current fetch time by default", async () => {
    const fetcher = vi.fn().mockResolvedValue(archive());
    const provider = new CvmShareCapitalProvider(fetcher);

    const result = await provider.getAnnualFacts(2026, new Set([issuerCnpj]));

    expect(fetcher).toHaveBeenCalledWith(
      "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FRE/DADOS/fre_cia_aberta_2026.zip",
    );
    expect(result.records[0]?.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

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

  it("assembles streamed chunks and skips blank CSV rows", async () => {
    const capitalFile = "fre_cia_aberta_capital_social_2026.csv";
    const contents =
      csv(
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
            "X".repeat(100_000),
            "10",
            "Integralizado",
            "300",
          ],
        ],
      ) + "\r\n;\r\n";
    const result = await parseCvmFreArchive(
      archive({ [capitalFile]: contents }, 9),
      2026,
      new Set([issuerCnpj]),
    );

    expect(
      result.records.find((record) => record.sourceFile === capitalFile)
        ?.rawFields.Nome_Companhia,
    ).toHaveLength(100_000);
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

  it("rejects malformed CSVs, headerless files, and archives missing source tables", async () => {
    await expect(
      parseCvmFreArchive(
        archive({
          ["fre_cia_aberta_capital_social_2026.csv"]: [
            "CNPJ_Companhia;Data_Referencia;Versao;ID_Documento;ID_Capital_Social;Tipo_Capital;Quantidade_Total_Acoes",
            "33;2026-12-31;1;1;1;Integralizado;100",
            '"unterminated',
          ].join("\r\n"),
        }),
        2026,
        new Set([issuerCnpj]),
      ),
    ).rejects.toThrow("CVM FRE CSV contains an unterminated quoted field");

    await expect(
      parseCvmFreArchive(
        archive({ ["fre_cia_aberta_capital_social_2026.csv"]: "" }),
        2026,
        new Set([issuerCnpj]),
      ),
    ).rejects.toThrow("CVM FRE capital_social CSV has no header");

    const metadataOnly = new Response(
      zipSync({
        "fre_cia_aberta_2026.csv": latin1(
          csv(["CNPJ_CIA", "DT_REFER", "VERSAO", "ID_DOC", "DT_RECEB"], []),
        ),
      }),
    );
    await expect(
      parseCvmFreArchive(metadataOnly, 2026, new Set([issuerCnpj])),
    ).rejects.toThrow("CVM FRE archive is missing required tables");
  });

  it("parses escaped quotes, optional columns, extra fields and CR-only rows", async () => {
    const source = archive({
      ["fre_cia_aberta_capital_social_2026.csv"]: [
        "CNPJ_Companhia;Data_Referencia;Versao;ID_Documento;ID_Capital_Social;Tipo_Capital;Quantidade_Total_Acoes;Nome",
        '33.000.167/0001-01;2026-12-31;2;777;10;"Capital ""preferencial""";300;legacy;overflow',
      ].join("\r"),
    });
    const result = await parseCvmFreArchive(
      source,
      2026,
      new Set([issuerCnpj]),
    );

    expect(
      result.records.find((record) => record.recordKind === "CAPITAL_SOCIAL"),
    ).toMatchObject({
      sourceRow: 2,
      rawFields: {
        Tipo_Capital: 'Capital "preferencial"',
        Nome: "legacy",
        "": "overflow",
      },
    });
  });

  it("omits ordinary shareholder positions and reports missing treasury evidence", async () => {
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
          "CPF_CNPJ_Acionista_Relacionado",
          "CPF_CNPJ_Representante_legal",
          "Quantidade_Total_Acoes_Circulacao",
          "Data_Composicao_Capital_Social",
          "Data_Ultima_Alteracao",
        ],
        [
          [
            "33.000.167/0001-01",
            "2026-12-31",
            "x",
            "777",
            "1",
            "Pessoa",
            "",
            "",
            "",
            "1",
            "",
            "",
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
      result.records.some(
        (record) => record.recordKind === "SHAREHOLDER_POSITION",
      ),
    ).toBe(false);
    expect(result.diagnostics.unavailableCoverageReasons[0]).toContain(
      "No explicit",
    );
  });

  it("keeps empty metadata unavailable and ignores unrelated archive entries", async () => {
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
    const result = await parseCvmFreArchive(
      archive({
        "fre_cia_aberta_2026.csv": csv(metadataHeaders, []),
        "readme.txt": "ignored archive member",
      }),
      2026,
      new Set([issuerCnpj]),
    );

    expect(result.records[0]).toMatchObject({
      documentId: "777",
      metadataStatus: "UNAVAILABLE",
      documentReceivedDate: null,
    });
    expect(result.diagnostics.documentsWithoutMetadata).toBeGreaterThan(0);
  });

  it("preserves incomplete source rows without inventing optional fields", async () => {
    const positionFile = "fre_cia_aberta_posicao_acionaria_2026.csv";
    const classFile = "fre_cia_aberta_posicao_acionaria_classe_acao_2026.csv";
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
    const result = await parseCvmFreArchive(
      archive({
        "fre_cia_aberta_2026.csv": csv(metadataHeaders, [
          [
            "33.000.167/0001-01",
            "2026-12-31",
            "2",
            "PETROBRAS",
            "009512",
            "FRE WEB",
            "777",
          ],
        ]),
        [positionFile]: csv(
          [
            "CNPJ_Companhia",
            "Data_Referencia",
            "Versao",
            "ID_Documento",
            "Nome_Companhia",
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
              "Petrobras",
              "900",
              "Ações Tesouraria",
              "Ações Tesouraria",
            ],
          ],
        ),
        [classFile]: csv(
          [
            "CNPJ_Companhia",
            "Data_Referencia",
            "Versao",
            "ID_Documento",
            "Nome_Companhia",
            "ID_Acionista",
            "Tipo_Classe_Acao_Preferencial",
            "Quantidade_Acoes",
            "Percentual_Acoes",
          ],
          [["33.000.167/0001-01", "2026-12-31", "2", "777", "Petrobras"]],
        ),
        "fre_cia_aberta_capital_social_2026.csv": csv(
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
          [["33.000.167/0001-01"]],
        ),
      }),
      2026,
      new Set([issuerCnpj]),
    );

    expect(
      result.records.find(({ sourceFile }) => sourceFile === positionFile),
    ).toMatchObject({
      referenceDate: "2026-12-31",
      documentReceivedDate: null,
      rawFields: {
        Quantidade_Acao_Ordinaria_Circulacao: "",
        Percentual_Total_Acoes_Circulacao: "",
        Data_Composicao_Capital_Social: "",
        Data_Ultima_Alteracao: "",
      },
    });
    expect(
      result.records.find(({ sourceFile }) => sourceFile === classFile)
        ?.rawFields,
    ).toEqual({
      ID_Acionista: "",
      Tipo_Classe_Acao_Preferencial: "",
      Quantidade_Acoes: "",
      Percentual_Acoes: "",
    });
    expect(
      result.records.find(
        ({ sourceFile }) =>
          sourceFile === "fre_cia_aberta_capital_social_2026.csv",
      ),
    ).toMatchObject({
      referenceDate: null,
      documentVersion: 0,
      documentId: "",
      capitalId: null,
      documentReceivedDate: null,
    });
  });

  it("reports a missing metadata table and ignores unrelated issuer metadata", async () => {
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
    const withUnknownIssuer = csv(metadataHeaders, [
      [
        "99.000.000/0001-99",
        "2026-12-31",
        "1",
        "Unknown",
        "000001",
        "FRE WEB",
        "unknown",
        "2026-01-01",
        "https://example.invalid/unknown",
      ],
    ]);
    await expect(
      parseCvmFreArchive(
        archive({ "fre_cia_aberta_2026.csv": null }),
        2026,
        new Set([issuerCnpj]),
      ),
    ).rejects.toThrow("metadata");

    const result = await parseCvmFreArchive(
      archive({ "fre_cia_aberta_2026.csv": withUnknownIssuer }),
      2026,
      new Set([issuerCnpj]),
    );
    expect(result.diagnostics.documentsMatched).toBe(0);
    expect(result.records[0]?.metadataStatus).toBe("UNAVAILABLE");
  });

  it("propagates errors while reading the archive response stream", async () => {
    const error = new Error("stream read failed");
    const response = {
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn().mockRejectedValue(error),
        }),
      },
    } as unknown as Response;

    await expect(
      parseCvmFreArchive(response, 2026, new Set([issuerCnpj])),
    ).rejects.toBe(error);
  });

  it("ignores callbacks and reader errors after the archive already failed", async () => {
    vi.doMock("fflate", () => ({
      Unzip: class {
        onfile:
          | ((file: {
              name: string;
              ondata?: (
                error: Error | null,
                data: Uint8Array,
                final: boolean,
              ) => void;
              start: () => void;
            }) => void)
          | null = null;

        register() {}

        push() {
          const file = {
            name: "fre_cia_aberta_capital_social_2026.csv",
            ondata: undefined as
              | ((
                  error: Error | null,
                  data: Uint8Array,
                  final: boolean,
                ) => void)
              | undefined,
            start() {
              const ondata = this.ondata!;
              ondata(null, new Uint8Array([1]), false);
              ondata(
                new Error("invalid compressed entry"),
                new Uint8Array(),
                true,
              );
              ondata(null, new Uint8Array(), true);
            },
          };
          this.onfile?.(file);
          throw new Error("reader stopped after entry error");
        }
      },
      UnzipInflate: class {},
    }));
    vi.resetModules();
    try {
      const provider =
        await import("@/backend/providers/cvm-share-capital.provider");
      await expect(
        provider.parseCvmFreArchive(
          new Response(new Uint8Array([1])),
          2026,
          new Set([issuerCnpj]),
        ),
      ).rejects.toThrow("invalid compressed entry");
    } finally {
      vi.doUnmock("fflate");
      vi.resetModules();
    }
  });

  it("rejects failed and bodyless CVM responses", async () => {
    expect(() =>
      parseCvmFreArchive(new Response(null, { status: 503 }), 2026, new Set()),
    ).toThrow("CVM FRE request failed: 503");
    expect(() =>
      parseCvmFreArchive(new Response(null), 2026, new Set()),
    ).toThrow("CVM FRE response has no body");
  });

  it("rejects a corrupted compressed FRE table", async () => {
    const response = archive({}, 9);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const fileNameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const compressedDataOffset = 30 + fileNameLength + extraLength;
    bytes[compressedDataOffset] = 0xff;

    await expect(
      parseCvmFreArchive(new Response(bytes), 2026, new Set([issuerCnpj])),
    ).rejects.toBeInstanceOf(Error);
  });
});
