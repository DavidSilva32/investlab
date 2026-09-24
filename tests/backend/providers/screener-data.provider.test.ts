import { zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  BrapiScreenerProvider,
  CvmDfpProvider,
  isQuantitativelyEligibleSector,
  parseDfpResponse,
  readCvmRegistry,
} from "@/backend/providers/screener-data.provider";

const latin1 = (value: string) =>
  Uint8Array.from([...value].map((character) => character.charCodeAt(0)));

function responseWithBody(body: string) {
  return new Response(latin1(body));
}

function zipResponse(files: Record<string, string>) {
  const archived = Object.fromEntries(
    Object.entries(files).map(([name, content]) => [name, latin1(content)]),
  );
  const zipped = zipSync(archived);
  return new Response(new Uint8Array(zipped));
}

function chunkedZipResponse(files: Record<string, string>, chunkSize = 256) {
  const archived = Object.fromEntries(
    Object.entries(files).map(([name, content]) => [name, latin1(content)]),
  );
  const zipped = new Uint8Array(zipSync(archived));
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < zipped.length; offset += chunkSize)
          controller.enqueue(zipped.slice(offset, offset + chunkSize));
        controller.close();
      },
    }),
  );
}

function csv(headers: string[], rows: string[][]) {
  return [headers.join(";"), ...rows.map((row) => row.join(";"))].join("\n");
}

const cadHeader = ["CNPJ_CIA", "CD_CVM", "DENOM_SOCIAL", "SETOR_ATIV"];
const dfpHeader = [
  "CNPJ_CIA",
  "CD_CVM",
  "CD_CONTA",
  "DS_CONTA",
  "ORDEM_EXERC",
  "DT_REFER",
  "VL_CONTA",
  "ESCALA_MOEDA",
  "VERSAO",
];
const validCnpj = "33.000.167/0001-01";
const registryByCode = new Map([["9512", "33000167000101"]]);

describe("CVM registry ingestion", () => {
  it("streams the CAD, keeps exact CNPJ keys and fails closed for unsupported sectors", async () => {
    const body = csv(cadHeader, [
      [validCnpj, "9512", '"Companhia ""A""; Petróleo"', "Petróleo"],
      ["11.222.333/0001-81", "1234", "Banco Teste", "Bancos"],
      [
        "22.222.333/0001-82",
        "1235",
        "Seguradora Teste",
        "Seguradoras e Resseguradoras",
      ],
      ["invalid", "1236", "Sem CNPJ", "Industria"],
      ["44.222.333/0001-84", "", "Sem CVM", "Industria"],
    ]);
    const registry = await readCvmRegistry(
      vi.fn().mockResolvedValue(responseWithBody(body)),
    );
    expect(registry.get("33000167000101")).toMatchObject({
      cvmCode: "9512",
      name: 'Companhia "A"; Petróleo',
      sector: "Petróleo",
      quantitativeEligible: true,
    });
    expect(registry.get("11222333000181")?.quantitativeEligible).toBe(false);
    expect(registry.get("22222333000182")?.quantitativeEligible).toBe(false);
    expect(registry.has("invalid")).toBe(false);
    expect(registry.size).toBe(3);
  });

  it("handles missing CAD cells and ignores surplus columns in streamed rows", async () => {
    const body = csv(cadHeader, [
      ["11.222.333/0001-81", "", "No CVM"],
      ["22.222.333/0001-82"],
      ["33.222.333/0001-83", "1235", "", ""],
      ["44.222.333/0001-84", "1236", "Extra", "Petróleo", "surplus"],
      ["55.222.333/0001-85", "1237", "Following", "Petroleo"],
    ]);
    const registry = await readCvmRegistry(
      vi.fn().mockResolvedValue(responseWithBody(body)),
    );
    expect(registry.has("11222333000181")).toBe(false);
    expect(registry.has("22222333000182")).toBe(false);
    expect(registry.get("33222333000183")).toMatchObject({
      name: "",
      sector: null,
    });
    expect(registry.get("44222333000184")).toMatchObject({
      name: "Extra",
      sector: "Petróleo",
    });
    expect(registry.get("55222333000185")).toMatchObject({ name: "Following" });
  });

  it("returns an empty registry when the CAD contains only a header line", async () => {
    const body = `${cadHeader.join(";")}\n`;
    await expect(
      readCvmRegistry(vi.fn().mockResolvedValue(responseWithBody(body))),
    ).resolves.toEqual(new Map());
  });

  it("parses a valid final CAD row without a line terminator", async () => {
    const body = [
      cadHeader.join(";"),
      [validCnpj, "9512", "Petróleo S.A.", "Petróleo"].join(";"),
    ].join("\n");
    const registry = await readCvmRegistry(
      vi.fn().mockResolvedValue(responseWithBody(body)),
    );
    expect(registry.get("33000167000101")).toMatchObject({
      name: "Petróleo S.A.",
      quantitativeEligible: true,
    });
  });

  it("parses blank optional fields on a final CAD row", async () => {
    const body = [
      cadHeader.join(";"),
      [validCnpj, "9512", "", "", "extra field"].join(";"),
    ].join("\n");
    const registry = await readCvmRegistry(
      vi.fn().mockResolvedValue(responseWithBody(body)),
    );
    expect(registry.get("33000167000101")).toMatchObject({
      name: "",
      sector: null,
      quantitativeEligible: false,
    });
  });

  it("ignores an invalid final CAD row without a CNPJ", async () => {
    const body = [
      cadHeader.join(";"),
      ["", "9512", "No CNPJ", "Petróleo"].join(";"),
    ].join("\n");
    await expect(
      readCvmRegistry(vi.fn().mockResolvedValue(responseWithBody(body))),
    ).resolves.toEqual(new Map());
    const missingCvm = [
      cadHeader.join(";"),
      [validCnpj, "", "No CVM", "Petróleo"].join(";"),
    ].join("\n");
    await expect(
      readCvmRegistry(vi.fn().mockResolvedValue(responseWithBody(missingCvm))),
    ).resolves.toEqual(new Map());
    const missingCvmCell = [cadHeader.join(";"), validCnpj].join("\n");
    await expect(
      readCvmRegistry(
        vi.fn().mockResolvedValue(responseWithBody(missingCvmCell)),
      ),
    ).resolves.toEqual(new Map());
  });

  it("requires a body and propagates a failed CVM response", async () => {
    await expect(
      readCvmRegistry(vi.fn().mockResolvedValue(new Response(null))),
    ).rejects.toThrow("CVM CAD response has no body");
    await expect(
      readCvmRegistry(
        vi.fn().mockResolvedValue(new Response("", { status: 503 })),
      ),
    ).rejects.toThrow("CVM CAD request failed: 503");
  });

  it.each([
    ["Bancos", false],
    ["Seguradoras e Resseguradoras", false],
    ["Petroleo", true],
    ["Petróleo, Gás e Biocombustíveis", true],
    ["Mineração", true],
    ["Consumo Cíclico", true],
    ["Bens Industriais", false],
    ["Financeiro e Outros", false],
    ["Setor ainda não mapeado", false],
    [null, false],
    ["", false],
  ] as const)("classifies CVM sector %s explicitly", (sector, eligible) => {
    expect(isQuantitativelyEligibleSector(sector)).toBe(eligible);
  });
});

describe("DFP streaming normalization", () => {
  it("keeps consolidated latest-order facts, selects highest version and deterministic tie, scales MIL and drops invalid rows", async () => {
    const body = csv(dfpHeader, [
      [
        validCnpj,
        "9512",
        "3.11",
        "Lucro/Prejuízo do Período",
        "ÚLTIMO",
        "2025-12-31",
        "100,00",
        "MIL",
        "1",
      ],
      [validCnpj],
      [
        validCnpj,
        "9512",
        "3.11",
        "Lucro/Prejuízo do Período",
        "ÚLTIMO",
        "2025-12-31",
        "110,00",
        "MIL",
        "2",
      ],
      [validCnpj],
      [
        validCnpj,
        "9512",
        "3.11",
        "Lucro/Prejuízo do Período",
        "ÚLTIMO",
        "2025-12-31",
        "999,00",
        "MIL",
        "2",
      ],
      [validCnpj],
      [
        validCnpj,
        "9512",
        "3.01",
        "Receita de Venda de Bens e/ou Serviços",
        "ÚLTIMO",
        "2025-12-31",
        "",
        "UNIDADE",
        "1",
      ],
      [validCnpj],
      [
        validCnpj,
        "9512",
        "3.02",
        "Outra conta",
        "ÚLTIMO",
        "2025-12-31",
        "5",
        "UNIDADE",
        "1",
      ],
      [
        "not-a-cnpj",
        "9512",
        "3.01",
        "invalid label",
        "ULTIMO",
        "2025-12-31",
        "1",
        "UNIDADE",
        "1",
      ],
      [
        validCnpj,
        "9512",
        "3.11",
        "Lucro/Prejuízo do Período",
        "PENÚLTIMO",
        "2024-12-31",
        "3",
        "UNIDADE",
        "2",
      ],
      [validCnpj],
      [
        validCnpj,
        "9512",
        "3.11",
        "Lucro/Prejuízo do Período",
        "ÚLTIMO",
        "2025-12-31",
        "3",
        "UNIDADE",
        "2",
      ],
      [
        validCnpj,
        "9999",
        "3.11",
        "Lucro/Prejuízo do Período",
        "ÚLTIMO",
        "2025-12-31",
        "3",
        "UNIDADE",
        "2",
      ],
      [validCnpj],
      [
        validCnpj,
        "9512",
        "3.11",
        "Lucro/Prejuízo do Período",
        "ÚLTIMO",
        "2020-12-31",
        "3",
        "UNIDADE",
        "2",
      ],
      [validCnpj],
      [
        validCnpj,
        "9512",
        "3.11",
        "Lucro/Prejuízo do Período",
        "ÚLTIMO",
        "31/12/2025",
        "3",
        "UNIDADE",
        "2",
      ],
      [validCnpj],
      [
        validCnpj,
        "9512",
        "3.11",
        "Lucro/Prejuízo do Período",
        "ÚLTIMO",
        "2025-12-31",
        "x",
        "UNIDADE",
        "2",
      ],
      [validCnpj],
      [
        validCnpj,
        "9512",
        "3.11",
        "Lucro/Prejuízo do Período",
        "ÚLTIMO",
        "2025-12-31",
        "1e999",
        "UNIDADE",
        "2",
      ],
      [validCnpj],
      [
        validCnpj,
        "9512",
        "3.01",
        "Receita de Venda de Bens e/ou Serviços",
        "ÚLTIMO",
        "2025-12-31",
        "10",
        "UNIDADE",
        "invalid",
      ],
      [validCnpj],
      [
        validCnpj,
        "9512",
        "3.01",
        "Receita de Venda de Bens e/ou Serviços",
        "ÚLTIMO",
        "2026-12-31",
        "20",
        "UNIDADE",
        "3",
      ],
    ]);
    const facts = await parseDfpResponse(
      zipResponse({ "2025_cia_aberta_con_dfp.csv": body + "\n" }),
      2025,
      registryByCode,
    );
    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issuerCnpj: "33000167000101",
          referenceDate: "2025-12-31",
          accountCode: "3.11",
          accountLabel: "Lucro/Prejuízo do Período",
          value: "110000.00",
          version: 2,
          sourceFile: "2025_cia_aberta_con_dfp.csv",
          sourceRow: 3,
        }),
        expect.objectContaining({
          accountCode: "3.01",
          value: "10.00",
          version: 0,
        }),
      ]),
    );
  });

  it("drops rows missing required DFP fields and defaults absent scale and version", async () => {
    const revenueLabel = "Receita de Venda de Bens e/ou Serviços";
    const headers = dfpHeader;
    const body = [
      headers.join(";"),
      [validCnpj, "9512"].join(";"),
      [validCnpj, "9512", "3.11"].join(";"),
      [validCnpj, "9512", "3.11", "Lucro/Prejuízo do Período"].join(";"),
      [validCnpj, "9512", "3.11", "Lucro/Prejuízo do Período", "ÚLTIMO"].join(
        ";",
      ),
      [validCnpj, "9512", "3.01", revenueLabel, "ÚLTIMO", "2025-12-31"].join(
        ";",
      ),
      [
        validCnpj,
        "9512",
        "3.01",
        revenueLabel,
        "ÚLTIMO",
        "2025-12-31",
        "25",
      ].join(";"),
      [
        validCnpj,
        "9512",
        "3.01",
        revenueLabel,
        "ÚLTIMO",
        "2025-12-31",
        "25",
        "",
        "",
        "extra",
      ].join(";"),
    ].join("\n");
    const facts = await parseDfpResponse(
      zipResponse({ "2025_cia_aberta_con_dfp.csv": `${body}\n` }),
      2025,
      registryByCode,
    );
    expect(facts).toContainEqual(
      expect.objectContaining({
        accountCode: "3.01",
        value: "25.00",
        version: 0,
      }),
    );
    expect(facts).toHaveLength(1);
  });

  it("rejects codes whose labels do not prove the expected financial meaning", async () => {
    const body = csv(dfpHeader, [
      [
        validCnpj,
        "9512",
        "3.11",
        "Resultado das Operações Continuadas",
        "ÚLTIMO",
        "2025-12-31",
        "20",
        "UNIDADE",
        "1",
      ],
      [validCnpj],
      [
        validCnpj,
        "9512",
        "2.03",
        "Passivos Financeiros ao Custo Amortizado",
        "ÚLTIMO",
        "2025-12-31",
        "100",
        "UNIDADE",
        "1",
      ],
      [validCnpj],
      [
        validCnpj,
        "9512",
        "3.01",
        "Receita Financeira",
        "ÚLTIMO",
        "2025-12-31",
        "500",
        "UNIDADE",
        "1",
      ],
    ]);
    const facts = await parseDfpResponse(
      zipResponse({ "2025_cia_aberta_con_dfp.csv": body }),
      2025,
      registryByCode,
    );
    expect(facts).toEqual([]);
  });

  it("ignores non-consolidated zip members and handles an explicit zero as data", async () => {
    const body = csv(dfpHeader, [
      [
        validCnpj,
        "9512",
        "2.03",
        "Patrimônio Líquido Consolidado",
        "ÚLTIMO",
        "2025-12-31",
        "0",
        "UNIDADE",
        "1",
      ],
    ]);
    const facts = await parseDfpResponse(
      zipResponse({
        "2025_cia_aberta_ind_dfp.csv": body,
        "README.txt": "not a csv",
        "2025_cia_aberta_con_dfp.csv": body,
      }),
      2025,
      registryByCode,
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]?.value).toBe("0.00");
  });

  it("continues decoding consolidated CSV across non-final inflate chunks", async () => {
    const row = [
      validCnpj,
      "9512",
      "3.11",
      "Lucro/Prejuízo do Período",
      "ÚLTIMO",
      "2025-12-31",
      "20",
      "UNIDADE",
      "1",
    ];
    const body =
      csv(
        dfpHeader,
        Array.from({ length: 12000 }, (_, index) => [
          ...row.slice(0, 2),
          "3.02",
          `Unmapped account ${index.toString().padStart(5, "0")}`,
          ...row.slice(4),
        ]),
      ) +
      "\n" +
      row.join(";");
    const facts = await parseDfpResponse(
      chunkedZipResponse({ "2025_cia_aberta_con_dfp.csv": body }),
      2025,
      registryByCode,
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ value: "20.00", version: 1 });
  });

  it("rejects failed, empty and malformed DFP downloads", async () => {
    await expect(
      parseDfpResponse(new Response("", { status: 500 }), 2025, registryByCode),
    ).rejects.toThrow("CVM DFP request failed: 500");
    await expect(
      parseDfpResponse(new Response(null), 2025, registryByCode),
    ).rejects.toThrow("CVM DFP response has no body");
    await expect(
      parseDfpResponse(
        new Response(Uint8Array.from([1, 2, 3])),
        2025,
        registryByCode,
      ),
    ).rejects.toBeTruthy();
  });

  it("uses the lexically preferred source file for equal-version duplicate facts", async () => {
    const row = [
      validCnpj,
      "9512",
      "3.11",
      "Lucro/Prejuízo do Período",
      "ÚLTIMO",
      "2025-12-31",
      "100",
      "UNIDADE",
      "1",
    ];
    const facts = await parseDfpResponse(
      zipResponse({
        "z_con_dfp.csv": csv(dfpHeader, [row]),
        "a_con_dfp.csv": csv(dfpHeader, [
          [...row.slice(0, 6), "200", ...row.slice(7)],
        ]),
      }),
      2025,
      registryByCode,
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      value: "200.00",
      sourceFile: "a_con_dfp.csv",
    });
  });

  it("ignores subsequent ZIP member callbacks after a corrupt member settles the parser", async () => {
    const content = latin1(
      csv(dfpHeader, [
        [
          validCnpj,
          "9512",
          "3.11",
          "Lucro/Prejuízo do Período",
          "ÚLTIMO",
          "2025-12-31",
          "20",
          "UNIDADE",
          "1",
        ],
      ]),
    );
    const source = zipSync(
      {
        "2025_cia_aberta_con_dfp.csv": content,
        "2025_cia_aberta_con_others.csv": content,
      },
      { level: 6 },
    );
    const corrupted = new Uint8Array(source);
    const dataStart =
      30 +
      corrupted[26]! +
      corrupted[27]! * 256 +
      corrupted[28]! +
      corrupted[29]! * 256;
    corrupted[dataStart] = 0xff;
    await expect(
      parseDfpResponse(new Response(corrupted), 2025, registryByCode),
    ).rejects.toBeTruthy();
  });

  it("ignores a stream failure that follows an already reported corrupt member", async () => {
    const content = latin1(
      csv(dfpHeader, [
        [
          validCnpj,
          "9512",
          "3.11",
          "Lucro/Prejuízo do Período",
          "ÚLTIMO",
          "2025-12-31",
          "20",
          "UNIDADE",
          "1",
        ],
      ]),
    );
    const source = zipSync(
      { "2025_cia_aberta_con_dfp.csv": content },
      { level: 6 },
    );
    const corrupted = new Uint8Array(source);
    const dataStart =
      30 +
      corrupted[26]! +
      corrupted[27]! * 256 +
      corrupted[28]! +
      corrupted[29]! * 256;
    corrupted[dataStart] = 0xff;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) controller.enqueue(corrupted);
        else controller.error(new Error("transport ended after member error"));
      },
    });
    await expect(
      parseDfpResponse(new Response(body), 2025, registryByCode),
    ).rejects.toBeTruthy();
  });

  it("propagates a response stream failure while reading the ZIP", async () => {
    const streamError = new Error("response stream failed");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(streamError);
      },
    });
    await expect(
      parseDfpResponse(new Response(body), 2025, registryByCode),
    ).rejects.toBe(streamError);
  });

  it("rejects a ZIP member with an invalid DEFLATE block", async () => {
    const source = zipSync(
      {
        "2025_cia_aberta_con_dfp.csv": latin1(
          csv(dfpHeader, [
            [
              validCnpj,
              "9512",
              "3.11",
              "Lucro/Prejuízo do Período",
              "ÚLTIMO",
              "2025-12-31",
              "20",
              "UNIDADE",
              "1",
            ],
          ]),
        ),
      },
      { level: 6 },
    );
    const corrupted = new Uint8Array(source);
    const dataStart =
      30 +
      corrupted[26]! +
      corrupted[27]! * 256 +
      corrupted[28]! +
      corrupted[29]! * 256;
    corrupted[dataStart] = 0xff;
    await expect(
      parseDfpResponse(new Response(corrupted), 2025, registryByCode),
    ).rejects.toBeTruthy();
  });

  it("downloads a DFP year from the official source and parses it", async () => {
    const body = csv(dfpHeader, [
      [
        validCnpj,
        "9512",
        "3.11",
        "Lucro/Prejuízo do Período",
        "ÚLTIMO",
        "2025-12-31",
        "20",
        "UNIDADE",
        "1",
      ],
    ]);
    const fetcher = vi.fn().mockResolvedValue(
      zipResponse({
        "2025_cia_aberta_con_dfp.csv": body,
      }),
    );
    const provider = new CvmDfpProvider(fetcher);
    await expect(
      provider.getAnnualFacts(2025, registryByCode),
    ).resolves.toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(
      "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_2025.zip",
    );
  });
});

const jsonResponse = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => new Response(JSON.stringify(body), { status, headers });

describe("BRAPI screener provider", () => {
  it("paginates the catalog, consumes results, keeps only active subtype stock and tolerates absent quota headers", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              symbol: "PETR4",
              name: "Petrobras",
              subType: "stock",
              isActive: true,
            },
            { symbol: "BPAC11", name: "BTG", subType: "unit", isActive: true },
            {
              symbol: "VALE3F",
              name: "Vale fracionário",
              subType: "stock",
              isActive: true,
            },
            { name: "Sem ticker", subType: "stock", isActive: true },
            {
              symbol: "OLD3",
              name: "Inativa",
              subType: "stock",
              isActive: false,
            },
            { name: "Sem ticker", subType: "stock", isActive: true },
            { symbol: "SEMSTATUS", subType: "stock" },
          ],
          pagination: { currentPage: 1, totalPages: 2, hasNextPage: true },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { ticker: "VALE3", name: "Vale", subtype: "stock", active: true },
          ],
          pagination: { currentPage: 2, totalPages: 2, hasNextPage: false },
        }),
      );
    const provider = new BrapiScreenerProvider(fetcher, "test-token");
    await expect(provider.getCatalog()).resolves.toEqual([
      {
        ticker: "PETR4",
        name: "Petrobras",
        subtype: "stock",
        active: true,
        cnpj: null,
        changed: false,
      },
      {
        ticker: "VALE3F",
        name: "Vale fracionário",
        subtype: "stock",
        active: true,
        cnpj: null,
        changed: false,
      },
      {
        ticker: "VALE3",
        name: "Vale",
        subtype: "stock",
        active: true,
        cnpj: null,
        changed: false,
      },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("page=2");
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("test-token");
  });

  it("supports omitted pagination metadata and catalog field aliases", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              ticker: "PETR3",
              name: "Petrobras",
              subtype: "stock",
              active: true,
            },
            { name: "sem símbolo", subType: "stock", isActive: true },
            { symbol: "UNIT11", subType: "unit", isActive: true },
          ],
          pagination: { totalPages: 2 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { stock: "VALE3", name: "Vale", subType: "stock", isActive: true },
          ],
        }),
      );
    const provider = new BrapiScreenerProvider(fetcher, "test-token");
    await expect(provider.getCatalog()).resolves.toMatchObject([
      { ticker: "PETR3", subtype: "stock" },
      { ticker: "VALE3", subtype: "stock" },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("stops catalog pagination at the provider safety limit", async () => {
    const fetcher = vi.fn().mockImplementation(async () =>
      jsonResponse({
        results: [
          {
            symbol: "PETR3",
            name: "Petrobras",
            subType: "stock",
            isActive: true,
          },
        ],
        pagination: { hasNextPage: true },
      }),
    );
    const provider = new BrapiScreenerProvider(fetcher, "test-token");
    await expect(provider.getCatalog()).rejects.toThrow(
      "BRAPI catalog exceeded the 100-page safety limit",
    );
    expect(fetcher).toHaveBeenCalledTimes(100);
  });

  it("rejects an unrecognized catalog envelope and defaults an unnamed profile to its ticker", async () => {
    const catalog = new BrapiScreenerProvider(
      vi.fn().mockResolvedValue(jsonResponse({})),
      "test-token",
    );
    await expect(catalog.getCatalog()).rejects.toThrow(
      "BRAPI catalog response did not contain results",
    );

    const profile = new BrapiScreenerProvider(
      vi.fn().mockResolvedValue(
        jsonResponse({
          results: [{ data: {} }],
        }),
      ),
      "test-token",
    );
    await expect(profile.getProfile("PETR3")).resolves.toMatchObject({
      ticker: "PETR3",
      name: "PETR3",
      cnpj: null,
      changed: false,
    });
  });

  it("supports legacy stocks catalog payload and rejects an empty first page", async () => {
    const provider = new BrapiScreenerProvider(
      vi.fn().mockResolvedValueOnce(
        jsonResponse({
          stocks: [
            {
              stock: "PETR4",
              name: "Petrobras",
              subType: "stock",
              isActive: true,
            },
          ],
        }),
      ),
      "test-token",
    );
    await expect(provider.getCatalog()).resolves.toHaveLength(1);
    const empty = new BrapiScreenerProvider(
      vi.fn().mockResolvedValue(jsonResponse({ results: [] })),
      "test-token",
    );
    await expect(empty.getCatalog()).rejects.toThrow(
      "BRAPI catalog response did not contain results",
    );
  });

  it("stops when a populated page advertises zero BRAPI quota", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ results: [] }, 200, { "ratelimit-remaining": "0" }),
      );
    const provider = new BrapiScreenerProvider(fetcher, "test-token");
    await expect(provider.getCatalog()).rejects.toMatchObject({
      statusCode: 429,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("requires a server token without returning or logging its value", async () => {
    const provider = new BrapiScreenerProvider(vi.fn(), " ");
    await expect(provider.getCatalog()).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("resolves a profile, strips CNPJ punctuation, and handles changed symbols", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              symbol: "PETR4",
              changed: false,
              data: { cnpj: validCnpj, longName: "Petrobras" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              symbol: "PETR4",
              changed: true,
              data: { cnpj: null, shortName: "Alterada" },
            },
          ],
        }),
      );
    const provider = new BrapiScreenerProvider(fetcher, "secret-token");
    await expect(provider.getProfile("PETR4")).resolves.toMatchObject({
      ticker: "PETR4",
      cnpj: "33000167000101",
      changed: false,
    });
    await expect(provider.getProfile("PETR4")).resolves.toMatchObject({
      ticker: "PETR4",
      name: "Alterada",
      cnpj: null,
      changed: true,
    });
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("secret-token");
  });

  it("uses the real Retry-After delay when no wait function is injected", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({}, 429, { "retry-after": "0.001" }),
        )
        .mockResolvedValueOnce(
          jsonResponse({ results: [{ symbol: "PETR4", data: {} }] }),
        );
      const provider = new BrapiScreenerProvider(fetcher, "test-token");
      const result = provider.getProfile("PETR4");
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toMatchObject({
        ticker: "PETR4",
        name: "PETR4",
      });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits once for Retry-After and retries a BRAPI rate-limited call sequentially", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "0.01" }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            results: [
              { symbol: "PETR4", changed: false, data: { cnpj: validCnpj } },
            ],
          },
          200,
          { "ratelimit-remaining": "5" },
        ),
      );
    const provider = new BrapiScreenerProvider(fetcher, "token", wait);
    await expect(provider.getProfile("PETR4")).resolves.toMatchObject({
      ticker: "PETR4",
    });
    expect(wait).toHaveBeenCalledWith(10);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("uses a safe retry delay and stops when a retry is still limited", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const retried = new BrapiScreenerProvider(
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({}, 429, {
            "retry-after": "Tue, 01 Jan 2030 00:00:00 GMT",
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            results: [{ symbol: "PETR4", changed: false, data: {} }],
          }),
        ),
      "token",
      wait,
    );
    await expect(retried.getProfile("PETR4")).resolves.toMatchObject({
      ticker: "PETR4",
    });
    expect(wait).toHaveBeenCalledWith(expect.any(Number));
    expect(wait.mock.calls[0]?.[0]).toBeGreaterThan(0);

    const quota = new BrapiScreenerProvider(
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "0.01" }))
        .mockResolvedValueOnce(
          jsonResponse({}, 200, { "ratelimit-remaining": "0" }),
        ),
      "token",
      vi.fn().mockResolvedValue(undefined),
    );
    await expect(quota.getProfile("PETR4")).rejects.toMatchObject({
      statusCode: 429,
    });

    const limited = new BrapiScreenerProvider(
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "0.01" }))
        .mockResolvedValueOnce(jsonResponse({}, 503)),
      "token",
      vi.fn().mockResolvedValue(undefined),
    );
    await expect(limited.getProfile("PETR4")).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it("does not retry a malformed Retry-After header", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({}, 429, { "retry-after": "not-a-date" }),
      );
    const provider = new BrapiScreenerProvider(fetcher, "test-token");
    await expect(provider.getProfile("PETR4")).rejects.toMatchObject({
      statusCode: 429,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("surfaces quota exhaustion and a rate limit without Retry-After", async () => {
    const exhausted = new BrapiScreenerProvider(
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({}, 200, { "ratelimit-remaining": "0" }),
        ),
      "token",
    );
    await expect(exhausted.getProfile("PETR4")).rejects.toMatchObject({
      statusCode: 429,
    });
    const limited = new BrapiScreenerProvider(
      vi.fn().mockResolvedValue(jsonResponse({}, 429)),
      "token",
    );
    await expect(limited.getProfile("PETR4")).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it("rejects failed and malformed BRAPI responses", async () => {
    const failed = new BrapiScreenerProvider(
      vi.fn().mockResolvedValue(jsonResponse({}, 500)),
      "token",
    );
    await expect(failed.getCatalog()).rejects.toThrow(
      "BRAPI request failed: 500",
    );
    const malformed = new BrapiScreenerProvider(
      vi.fn().mockResolvedValue(jsonResponse({ results: [{}] })),
      "token",
    );
    await expect(malformed.getProfile("PETR4")).rejects.toBeTruthy();
  });
});
