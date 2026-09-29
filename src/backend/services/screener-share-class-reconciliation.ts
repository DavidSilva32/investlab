import type { CvmShareCapitalRecord } from "@/backend/providers/cvm-share-capital.provider";
import type { BrapiStock } from "@/backend/providers/screener-data.provider";
import type { ScreenerSecurityRecord } from "@/backend/repositories/screener-sync.repository";

export type ShareClassReconciliationRecord = {
  issuerCnpj: string | null;
  ticker: string;
  instrumentSubtype: string;
  issuerIdentityStatus: "CNPJ_MATCHED" | "UNAVAILABLE";
  tickerClassStatus: "AMBIGUOUS" | "UNAVAILABLE";
  unitCompositionStatus: "UNAVAILABLE";
  freDocumentAlignmentStatus: "ALIGNED" | "AMBIGUOUS" | "UNAVAILABLE";
  crossSourceAlignmentStatus: "UNAVAILABLE";
  effectiveDateStatus: "UNAVAILABLE";
  eventHistoryStatus: "UNAVAILABLE";
  treasuryStatus: "REPORTED_UNRECONCILED" | "UNAVAILABLE";
  reasons: string[];
  evidence: Array<{
    factKey: string;
    recordKind: CvmShareCapitalRecord["recordKind"];
    documentId: string;
    documentVersion: number;
    referenceDate: string | null;
    documentReceivedDate: string | null;
    sourceArchive: string;
    sourceFile: string;
    sourceRow: number;
    quantitySemantics: string;
  }>;
};

function sortEvidence(records: CvmShareCapitalRecord[]) {
  return [...records].sort((left, right) => {
    const byDocument = left.documentId.localeCompare(right.documentId);
    if (byDocument !== 0) return byDocument;
    const byVersion = left.documentVersion - right.documentVersion;
    if (byVersion !== 0) return byVersion;
    return (
      left.sourceFile.localeCompare(right.sourceFile) ||
      left.sourceRow - right.sourceRow
    );
  });
}

export function reconcileShareClassFacts(
  securities: ScreenerSecurityRecord[],
  persistedFacts: CvmShareCapitalRecord[],
  units: BrapiStock[] = [],
): ShareClassReconciliationRecord[] {
  const factsByIssuer = new Map<string, CvmShareCapitalRecord[]>();
  for (const fact of persistedFacts) {
    const facts = factsByIssuer.get(fact.issuerCnpj) ?? [];
    facts.push(fact);
    factsByIssuer.set(fact.issuerCnpj, facts);
  }

  const reconciledSecurities: ShareClassReconciliationRecord[] = securities.map(
    (security) => {
      const issuerFacts = sortEvidence(
        factsByIssuer.get(security.issuerCnpj) ?? [],
      );
      const classes = issuerFacts.filter(
        (fact) =>
          fact.recordKind === "CAPITAL_SOCIAL_CLASS" ||
          fact.recordKind === "CAPITAL_DISTRIBUTION_CLASS",
      );
      const hasClassEvidence = classes.length > 0;
      const reportIdentityCount = new Set(
        issuerFacts.map(
          (fact) =>
            `${fact.documentId}:${fact.documentVersion}:${fact.referenceDate ?? ""}:${fact.documentReceivedDate ?? ""}`,
        ),
      ).size;
      const sourceFileCount = new Set(
        issuerFacts.map((fact) => fact.sourceFile),
      ).size;
      const ambiguousMetadata = issuerFacts.some(
        (fact) => fact.metadataStatus === "AMBIGUOUS",
      );
      const allRelevantMetadataMatched =
        issuerFacts.length > 0 &&
        issuerFacts.every((fact) => fact.metadataStatus === "MATCHED");
      const treasuryPresent = issuerFacts.some(
        (fact) => fact.recordKind === "TREASURY_POSITION",
      );
      const reasons = [
        "BRAPI e CVM CAD identificaram o emissor pelo mesmo CNPJ; isso não identifica uma classe acionária específica.",
        ...(sourceFileCount < 2
          ? [
              "Há menos de duas tabelas FRE com evidência correspondente para comprovar alinhamento entre tabelas.",
            ]
          : []),
        security.baseTicker !== null
          ? "O código fracionário herdou apenas o vínculo de emissor; ele não prova a identidade da classe do ticker principal."
          : security.subtype === "unit"
            ? "A composição da unit não foi comprovada por uma relação estruturada entre tickers e classes no conjunto ingerido."
            : "A reconciliação não infere a classe pelo sufixo nem pelo nome comercial do ticker.",
        "A data de referência do FRE descreve o relatório; sem evento efetivo conciliado, não define a data econômica das quantidades.",
        "O conjunto FRE consultado não contém histórico estruturado de aumentos, reduções, desdobramentos, grupamentos, bonificações ou exercício de conversíveis.",
        ...(treasuryPresent
          ? [
              "A posição identificada como tesouraria foi reportada, mas não foi conciliada com capital e classes na mesma data efetiva.",
            ]
          : [
              "Não há posição de tesouraria reportada e conciliada neste lote de documentos.",
            ]),
      ];
      return {
        issuerCnpj: security.issuerCnpj,
        ticker: security.ticker,
        instrumentSubtype: security.subtype,
        issuerIdentityStatus: "CNPJ_MATCHED",
        tickerClassStatus:
          hasClassEvidence && security.baseTicker === null
            ? "AMBIGUOUS"
            : "UNAVAILABLE",
        unitCompositionStatus: "UNAVAILABLE",
        freDocumentAlignmentStatus: ambiguousMetadata
          ? "AMBIGUOUS"
          : allRelevantMetadataMatched &&
              reportIdentityCount === 1 &&
              sourceFileCount > 1
            ? "ALIGNED"
            : reportIdentityCount > 1
              ? "AMBIGUOUS"
              : "UNAVAILABLE",
        crossSourceAlignmentStatus: "UNAVAILABLE",
        effectiveDateStatus: "UNAVAILABLE",
        eventHistoryStatus: "UNAVAILABLE",
        treasuryStatus: treasuryPresent
          ? "REPORTED_UNRECONCILED"
          : "UNAVAILABLE",
        reasons,
        evidence: issuerFacts.map((fact) => ({
          factKey: fact.factKey,
          recordKind: fact.recordKind,
          documentId: fact.documentId,
          documentVersion: fact.documentVersion,
          referenceDate: fact.referenceDate,
          documentReceivedDate: fact.documentReceivedDate,
          sourceArchive: fact.sourceArchive,
          sourceFile: fact.sourceFile,
          sourceRow: fact.sourceRow,
          quantitySemantics: fact.quantitySemantics,
        })),
      };
    },
  );

  const reconciledUnits = units.map((unit) => ({
    issuerCnpj: null,
    ticker: unit.ticker,
    instrumentSubtype: "unit",
    issuerIdentityStatus: "UNAVAILABLE" as const,
    tickerClassStatus: "UNAVAILABLE" as const,
    unitCompositionStatus: "UNAVAILABLE" as const,
    freDocumentAlignmentStatus: "UNAVAILABLE" as const,
    crossSourceAlignmentStatus: "UNAVAILABLE" as const,
    effectiveDateStatus: "UNAVAILABLE" as const,
    eventHistoryStatus: "UNAVAILABLE" as const,
    treasuryStatus: "UNAVAILABLE" as const,
    reasons: [
      "O catálogo BRAPI classifica este instrumento como unit, mas não traz CNPJ de companhia para associar documentos FRE.",
      "A composição da unit por classes e quantidades não está comprovada pelos dados estruturados disponíveis.",
      "A fonte de composição disponível não fornece data efetiva e versão conciliáveis; a composição permanece indisponível para este período.",
      "Não foram atribuídas quantidades de ações a esta unit.",
    ],
    evidence: [],
  }));

  return [...reconciledSecurities, ...reconciledUnits];
}
