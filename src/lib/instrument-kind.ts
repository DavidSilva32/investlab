export type InstrumentKind =
  "EQUITY" | "FII" | "ETF" | "FIXED_INCOME" | "INVESTMENT_FUND" | "UNKNOWN";

type InstrumentEvidence = {
  product?: string | null;
  sourceType?: string | null;
  sourceSheet?: string | null;
};

const normalize = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");

const isFiiEvidence = (value: string) =>
  /\bfii\b/.test(value) ||
  /\bfundos? imobiliarios?\b/.test(value) ||
  /\bfdo\.?\s+inv\.?\s+imob\b/.test(value) ||
  /\bfdo\.?\s+imob\b/.test(value);

const isFixedIncomeEvidence = (value: string) =>
  /\b(tesouro|cdb|rdb|lci|lca|debenture|cri|cra|letra financeira|renda fixa)\b/.test(
    value,
  );

export function classifyInstrumentKind({
  product,
  sourceType,
  sourceSheet,
}: InstrumentEvidence): InstrumentKind {
  const normalizedProduct = normalize(product);
  const normalizedType = normalize(sourceType);
  const normalizedSheet = normalize(sourceSheet);
  const evidence = `${normalizedProduct} ${normalizedType}`;

  if (isFiiEvidence(evidence)) return "FII";
  if (/\betf\b/.test(evidence)) return "ETF";
  if (/\brenda fixa\b/.test(normalizedSheet)) return "FIXED_INCOME";
  if (isFixedIncomeEvidence(evidence)) return "FIXED_INCOME";
  if (/\b(acoes|bdr|on|pn|units?)\b/.test(normalizedType)) return "EQUITY";
  if (/\bacoes\b/.test(normalizedSheet)) return "EQUITY";
  if (
    /\b(fundo(s)? de investimento|fundo(s)?|cotas?)\b/.test(normalizedType) ||
    /\bfundo de investimento\b/.test(normalizedSheet)
  ) {
    return "INVESTMENT_FUND";
  }
  if (/\b(acao|acoes|bdr)\b/.test(normalizedProduct)) return "EQUITY";
  return "UNKNOWN";
}
