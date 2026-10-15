import { portfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import { getStrategyAssetClassId } from "@/lib/strategy-allocation";
import { decimalToCents, formatCurrencyCents } from "@/lib/portfolio-money";
import { normalizePortfolioChatText } from "@/lib/portfolio-chat-intent";

export type PortfolioChatQuery = {
  intent: "asset-value" | "asset-class-value" | "asset-list";
  query?: string;
  assetClassId?:
    "fixed_income" | "brazilian_equities" | "international_etfs" | "fiis";
};

const classLabels = {
  fixed_income: "Renda fixa",
  brazilian_equities: "Ações e BDRs",
  international_etfs: "ETFs internacionais",
  fiis: "Fundos imobiliários (FIIs)",
} as const;

function centsOf(position: {
  canonicalValueCents?: string | null;
  estimatedValueCents?: string | null;
  estimatedValue?: string | number | null;
  totalValue?: string | number | null;
}): bigint | null {
  const raw = position.canonicalValueCents ?? position.estimatedValueCents;
  if (raw != null) return /^-?\d{1,40}$/.test(raw) ? BigInt(raw) : null;
  return decimalToCents(position.estimatedValue ?? position.totalValue);
}

function classOf(position: {
  product: string;
  classification?: {
    assetClass?: string | null;
    subClass?: string | null;
    geography?: string | null;
  } | null;
}) {
  return getStrategyAssetClassId({
    product: position.product,
    assetClass: position.classification?.assetClass ?? null,
    subClass: position.classification?.subClass ?? null,
    geography: position.classification?.geography ?? null,
  });
}

function matchesClass(
  position: Parameters<typeof classOf>[0],
  assetClassId?: PortfolioChatQuery["assetClassId"],
) {
  return assetClassId === undefined || classOf(position) === assetClassId;
}

export class PortfolioChatQueryService {
  async query(input: PortfolioChatQuery, requestId: string) {
    const positions = await portfolioAllocationService.getAllocation(requestId);
    if (input.intent === "asset-list") {
      const assetClassId = input.assetClassId;
      if (assetClassId !== "brazilian_equities" && assetClassId !== "fiis") {
        return {
          message: "Não encontrei uma classe compatível para listar.",
          items: [],
          incompleteCount: 0,
        };
      }
      const matched = positions.filter(
        (position) => classOf(position) === assetClassId,
      );
      const incompleteCount = positions.filter(
        (position) => classOf(position) === null,
      ).length;
      const items = matched.map((position) => ({
        id: position.id,
        product: position.product,
        assetCode: position.assetCode,
        issuer: position.issuer,
        institution: position.institution,
        valueCents: centsOf(position)?.toString() ?? null,
      }));
      const unvaluedCount = items.filter(
        (item) => item.valueCents === null,
      ).length;
      const message = items.length
        ? `Encontrei ${items.length} posição(ões) em ${classLabels[assetClassId]}.${unvaluedCount ? ` ${unvaluedCount} sem valor atual confirmado.` : ""}${incompleteCount ? ` Há ${incompleteCount} posição(ões) sem classe confirmada.` : ""}`
        : incompleteCount
          ? `Não encontrei posições classificadas em ${classLabels[assetClassId]}. Há ${incompleteCount} posição(ões) sem classe confirmada.`
          : `Não encontrei posições em ${classLabels[assetClassId]}.`;
      return { message, items, incompleteCount, unvaluedCount };
    }

    if (input.intent === "asset-class-value") {
      const assetClassId = input.assetClassId;
      if (!assetClassId) return { message: "Informe uma classe de ativos." };
      const matched = positions.filter(
        (position) => classOf(position) === assetClassId,
      );
      const incompleteCount = positions.filter(
        (position) => classOf(position) === null,
      ).length;
      const values = matched.map(centsOf);
      const known = values.filter((value): value is bigint => value !== null);
      if (known.length === 0) {
        return {
          message: `${matched.length ? `Não encontrei valor atual confirmado para ${classLabels[assetClassId]}.` : `Não encontrei posições classificadas em ${classLabels[assetClassId]}.`}${incompleteCount ? ` Há ${incompleteCount} posição(ões) sem classe confirmada, que podem não estar incluídas.` : ""}`,
        };
      }
      const total = known.reduce((sum, value) => sum + value, 0n);
      const unvalued = values.length - known.length;
      return {
        message: `O valor atual acompanhado em ${classLabels[assetClassId]} é ${formatCurrencyCents(total)}.${unvalued ? ` ${unvalued} posição(ões) estão sem valor confirmado.` : ""}${incompleteCount ? ` Há ${incompleteCount} posição(ões) sem classe confirmada, que podem não estar incluídas.` : ""}`,
      };
    }

    const query = normalizePortfolioChatText(input.query ?? "");
    const inClass = positions.filter((position) =>
      matchesClass(position, input.assetClassId),
    );
    const exactCode = inClass.filter(
      (position) =>
        position.assetCode &&
        normalizePortfolioChatText(position.assetCode) === query,
    );
    const organizationMatches = inClass.filter((position) =>
      [position.issuer, position.institution].some(
        (name) => name && normalizePortfolioChatText(name) === query,
      ),
    );
    if (organizationMatches.length && !exactCode.length) {
      const values = organizationMatches.map(centsOf);
      const known = values.filter((value): value is bigint => value !== null);
      if (!known.length)
        return {
          message: `Não encontrei valor atual confirmado para ${input.query}.`,
        };
      const partial = values.length - known.length;
      return {
        message: `O valor atual acompanhado em ${input.query} é ${formatCurrencyCents(known.reduce((sum, value) => sum + value, 0n))}.${partial ? ` O subtotal não inclui ${partial} posição(ões) sem valor confirmado.` : ""}`,
      };
    }
    const matches = exactCode.length
      ? exactCode
      : inClass.filter((position) =>
          [position.product, position.issuer, position.institution].some(
            (name) => name && normalizePortfolioChatText(name).includes(query),
          ),
        );
    if (!matches.length)
      return {
        message: `Não encontrei um ativo correspondente a ${input.query} na carteira atual.`,
      };
    const items = matches.map((position) => ({
      id: position.id,
      product: position.product,
      assetCode: position.assetCode,
      issuer: position.issuer,
      institution: position.institution,
      valueCents: centsOf(position)?.toString() ?? null,
    }));
    if (items.length > 1)
      return {
        message: `Encontrei mais de uma posição para “${input.query}”.`,
        items,
      };
    const [item] = items;
    return {
      message:
        item.valueCents === null
          ? `Encontrei ${item.product}, mas não há valor atual confirmado.`
          : `O valor atual acompanhado de ${item.product}${item.assetCode ? ` (${item.assetCode}${item.issuer ? ` · ${item.issuer}` : ""})` : item.issuer ? ` (${item.issuer})` : ""} é ${formatCurrencyCents(BigInt(item.valueCents))}.`,
    };
  }
}

export const portfolioChatQueryService = new PortfolioChatQueryService();
