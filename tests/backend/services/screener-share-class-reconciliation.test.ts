import { describe, expect, it } from "vitest";
import type { CvmShareCapitalRecord } from "@/backend/providers/cvm-share-capital.provider";
import type { ScreenerSecurityRecord } from "@/backend/repositories/screener-sync.repository";
import { reconcileShareClassFacts } from "@/backend/services/screener-share-class-reconciliation";

const security = (
  ticker: string,
  subtype = "stock",
): ScreenerSecurityRecord => ({
  ticker,
  name: ticker,
  subtype,
  active: true,
  cnpj: "33000167000101",
  changed: false,
  issuerCnpj: "33000167000101",
  baseTicker: null,
});

const fact = (
  recordKind: CvmShareCapitalRecord["recordKind"],
  overrides: Partial<CvmShareCapitalRecord> = {},
): CvmShareCapitalRecord => ({
  factKey: `${recordKind}-key`,
  issuerCnpj: "33000167000101",
  referenceDate: "2026-12-31",
  documentVersion: 2,
  documentId: "777",
  documentReceivedDate: "2026-05-29",
  metadataStatus: "MATCHED",
  recordKind,
  capitalId: "100",
  shareholderId: null,
  sourceArchive: "fre_cia_aberta_2026.zip",
  sourceFile: "fre_cia_aberta_capital_social_2026.csv",
  sourceRow: 2,
  rawFields: {},
  tickerClassStatus: "UNAVAILABLE",
  quantitySemantics: "REPORTED_CAPITAL_NOT_CURRENT_OUTSTANDING",
  fetchedAt: "2026-09-28T12:00:00.000Z",
  ...overrides,
});

describe("reconcileShareClassFacts", () => {
  it("keeps issuer evidence separate from ticker class, unit, and economic date claims", () => {
    const results = reconcileShareClassFacts(
      [security("PETR4"), security("EXMP11", "unit")],
      [
        fact("CAPITAL_SOCIAL_CLASS", {
          rawFields: { Tipo_Classe_Acao_Preferencial: "Preferencial Classe A" },
        }),
        fact("CAPITAL_DISTRIBUTION", {
          sourceFile: "fre_cia_aberta_distribuicao_capital_2026.csv",
          quantitySemantics: "REPORTED_FREE_FLOAT_NOT_TOTAL_OUTSTANDING",
        }),
      ],
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      ticker: "PETR4",
      issuerIdentityStatus: "CNPJ_MATCHED",
      tickerClassStatus: "AMBIGUOUS",
      unitCompositionStatus: "UNAVAILABLE",
      freDocumentAlignmentStatus: "ALIGNED",
      crossSourceAlignmentStatus: "UNAVAILABLE",
      effectiveDateStatus: "UNAVAILABLE",
      eventHistoryStatus: "UNAVAILABLE",
      treasuryStatus: "UNAVAILABLE",
    });
    expect(results[0].reasons.join(" ")).toContain(
      "não identifica uma classe acionária específica",
    );
    expect(results[0]).not.toHaveProperty("shareQuantity");
    expect(results[1]).toMatchObject({
      ticker: "EXMP11",
      tickerClassStatus: "AMBIGUOUS",
      unitCompositionStatus: "UNAVAILABLE",
    });
    expect(results[1].reasons.join(" ")).toContain("composição da unit");
  });

  it("does not report FRE document alignment if metadata is missing or ambiguous", () => {
    const [result] = reconcileShareClassFacts(
      [security("PETR4")],
      [fact("CAPITAL_SOCIAL", { metadataStatus: "UNAVAILABLE" })],
    );
    expect(result.freDocumentAlignmentStatus).toBe("UNAVAILABLE");
    expect(result.crossSourceAlignmentStatus).toBe("UNAVAILABLE");

    const [ambiguous] = reconcileShareClassFacts(
      [security("PETR4")],
      [fact("CAPITAL_SOCIAL", { metadataStatus: "AMBIGUOUS" })],
    );
    expect(ambiguous.freDocumentAlignmentStatus).toBe("AMBIGUOUS");

    const [differentDocuments] = reconcileShareClassFacts(
      [security("PETR4")],
      [
        fact("CAPITAL_SOCIAL", { documentId: "doc-a" }),
        fact("CAPITAL_DISTRIBUTION", { documentId: "doc-b" }),
      ],
    );
    expect(differentDocuments.freDocumentAlignmentStatus).toBe("AMBIGUOUS");
  });

  it("does not transfer a base ticker class identity to its fractional code", () => {
    const [fractional] = reconcileShareClassFacts(
      [{ ...security("PETR4F"), baseTicker: "PETR4" }],
      [fact("CAPITAL_SOCIAL_CLASS")],
    );
    expect(fractional).toMatchObject({
      tickerClassStatus: "UNAVAILABLE",
      issuerIdentityStatus: "CNPJ_MATCHED",
    });
    expect(fractional.reasons.join(" ")).toContain(
      "código fracionário herdou apenas o vínculo de emissor",
    );
  });

  it("returns an explicit unavailable case for a catalog unit without issuer identity", () => {
    const [unit] = reconcileShareClassFacts(
      [],
      [],
      [
        {
          ticker: "EXMP11",
          name: "Example Unit",
          subtype: "unit",
          active: true,
          cnpj: null,
          changed: false,
        },
      ],
    );
    expect(unit).toMatchObject({
      issuerCnpj: null,
      ticker: "EXMP11",
      instrumentSubtype: "unit",
      issuerIdentityStatus: "UNAVAILABLE",
      unitCompositionStatus: "UNAVAILABLE",
      freDocumentAlignmentStatus: "UNAVAILABLE",
      evidence: [],
    });
    expect(unit.reasons.join(" ")).toContain(
      "catálogo BRAPI classifica este instrumento como unit",
    );
    expect(unit.reasons.join(" ")).toContain(
      "Não foram atribuídas quantidades de ações a esta unit.",
    );
    expect(unit.reasons.join(" ")).toContain(
      "data efetiva e versão conciliáveis",
    );
  });

  it("keeps unsupported class and treasury facts unavailable when absent", () => {
    const [result] = reconcileShareClassFacts([security("OTHER3")], []);
    expect(result).toMatchObject({
      tickerClassStatus: "UNAVAILABLE",
      unitCompositionStatus: "UNAVAILABLE",
      freDocumentAlignmentStatus: "UNAVAILABLE",
      treasuryStatus: "UNAVAILABLE",
      evidence: [],
    });
  });
});
