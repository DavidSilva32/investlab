import type {
  TreasurySelicLiquidityFact,
  TreasurySelicPositionInput,
} from "@/backend/types/treasury-selic-liquidity";

export const TREASURY_SELIC_RULE_VERSION = "portaria-mf-1748-2024-v1";
export const TREASURY_SELIC_RULE_SOURCE =
  "https://www.tesourodireto.com.br/sobre-o-tesouro/regras-e-regulamento";
export const TREASURY_SELIC_RULE_SOURCE_TITLE =
  "Regras e Regulamento do Tesouro Direto — Liquidação do Resgate";
export const TREASURY_SELIC_RULE_OBSERVED_AT = "2026-09-29";
export const TREASURY_SELIC_RULE_EFFECTIVE_FROM = "2024-11-11";

const settlementWindows: NonNullable<
  TreasurySelicLiquidityFact["settlementEstimate"]
>["windows"] = [
  {
    requestWindow: "business_day_09_30_to_13_00",
    relativeSettlement: "same_business_day_from_13_00",
  },
  {
    requestWindow: "business_day_13_00_to_18_00",
    relativeSettlement: "next_business_day_from_13_00",
  },
  {
    requestWindow: "scheduled_after_18_00_or_non_business_day",
    relativeSettlement: "next_business_day_from_13_00",
  },
];

const estimateExclusions = [
  "Estimativa condicional ao funcionamento operacional normal; suspensões extraordinárias podem alterar o processamento.",
  "A data-base é a do snapshot importado e não confirma disponibilidade atual.",
  "A estimativa aplica-se somente à quantidade marcada como disponível no snapshot.",
  "Crédito em conta corrente depende da instituição financeira e está fora desta estimativa.",
];

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");

const isValidDate = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
};

const parseDecimal = (value: string | null) => {
  if (!value || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return null;
  const [integer, fraction = ""] = value.split(".");
  return { integer: BigInt(integer), fraction };
};

const isPositiveDecimal = (value: string | null) => {
  const parsed = parseDecimal(value);
  return (
    parsed !== null && (parsed.integer > 0n || /[1-9]/.test(parsed.fraction))
  );
};

const isNonNegativeDecimal = (value: string | null) =>
  parseDecimal(value) !== null;

const compareDecimals = (left: string, right: string) => {
  const leftValue = parseDecimal(left)!;
  const rightValue = parseDecimal(right)!;
  const scale = Math.max(leftValue.fraction.length, rightValue.fraction.length);
  const leftScaled = BigInt(
    `${leftValue.integer}${leftValue.fraction.padEnd(scale, "0")}`,
  );
  const rightScaled = BigInt(
    `${rightValue.integer}${rightValue.fraction.padEnd(scale, "0")}`,
  );
  return leftScaled === rightScaled ? 0 : leftScaled > rightScaled ? 1 : -1;
};

const decimalSumExceeds = (left: string, right: string, maximum: string) => {
  const leftValue = parseDecimal(left)!;
  const rightValue = parseDecimal(right)!;
  const maximumValue = parseDecimal(maximum)!;
  const scale = Math.max(
    leftValue.fraction.length,
    rightValue.fraction.length,
    maximumValue.fraction.length,
  );
  const toScaled = (value: NonNullable<ReturnType<typeof parseDecimal>>) =>
    BigInt(`${value.integer}${value.fraction.padEnd(scale, "0")}`);
  return toScaled(leftValue) + toScaled(rightValue) > toScaled(maximumValue);
};

export function createTreasurySelicLiquidityFact(
  position: TreasurySelicPositionInput,
): TreasurySelicLiquidityFact | null {
  const normalizedProduct = normalize(position.product);
  if (!normalizedProduct.includes("tesouro selic")) return null;

  const reasons: string[] = [];
  const exactTitle = /^tesouro selic(?: \d{4})?$/.test(normalizedProduct);
  const titleYear =
    normalizedProduct.match(/^tesouro selic (\d{4})$/)?.[1] ?? null;
  const identityKnown =
    exactTitle &&
    isValidDate(position.maturityAt) &&
    isValidDate(position.referenceDate) &&
    (titleYear === null || titleYear === position.maturityAt?.slice(0, 4));
  if (!exactTitle) reasons.push("product_identity_ambiguous");
  if (!isValidDate(position.maturityAt))
    reasons.push("maturity_missing_or_invalid");
  if (
    titleYear !== null &&
    position.maturityAt !== null &&
    isValidDate(position.maturityAt) &&
    titleYear !== position.maturityAt.slice(0, 4)
  )
    reasons.push("title_maturity_year_conflict");
  if (!isValidDate(position.referenceDate))
    reasons.push("snapshot_reference_date_missing_or_invalid");
  if (
    isValidDate(position.referenceDate) &&
    position.referenceDate !== null &&
    position.referenceDate < TREASURY_SELIC_RULE_EFFECTIVE_FROM
  )
    reasons.push("rule_not_effective_on_snapshot_date");
  if (!isPositiveDecimal(position.availableQuantity))
    reasons.push("available_quantity_missing_or_not_positive");
  if (!isNonNegativeDecimal(position.quantity))
    reasons.push("position_quantity_missing_or_invalid");
  if (
    isPositiveDecimal(position.availableQuantity) &&
    isNonNegativeDecimal(position.quantity) &&
    compareDecimals(position.availableQuantity!, position.quantity) > 0
  )
    reasons.push("available_quantity_exceeds_position_quantity");
  if (
    position.unavailableQuantity !== null &&
    !isNonNegativeDecimal(position.unavailableQuantity)
  )
    reasons.push("unavailable_quantity_invalid");
  if (
    isPositiveDecimal(position.availableQuantity) &&
    isNonNegativeDecimal(position.unavailableQuantity) &&
    isNonNegativeDecimal(position.quantity) &&
    compareDecimals(position.availableQuantity!, position.quantity) <= 0 &&
    decimalSumExceeds(
      position.availableQuantity!,
      position.unavailableQuantity!,
      position.quantity,
    )
  )
    reasons.push("position_quantities_conflict");

  const determined = reasons.length === 0;
  return {
    status: determined ? "determined" : "indeterminate",
    reasons,
    asOf: isValidDate(position.referenceDate) ? position.referenceDate : null,
    normalizedTitleType: identityKnown ? "Tesouro Selic" : null,
    maturityAt: isValidDate(position.maturityAt) ? position.maturityAt : null,
    positionQuantity: position.quantity,
    availableQuantity: position.availableQuantity,
    unavailableQuantity: position.unavailableQuantity,
    institution: position.institution,
    assetCode: position.assetCode,
    settlementEstimate: determined
      ? {
          condition: "normal_operation",
          windows: settlementWindows,
          exclusions: estimateExclusions,
        }
      : null,
    ruleVersion: TREASURY_SELIC_RULE_VERSION,
    ruleSource: TREASURY_SELIC_RULE_SOURCE,
    ruleSourceTitle: TREASURY_SELIC_RULE_SOURCE_TITLE,
    ruleSourceObservedAt: TREASURY_SELIC_RULE_OBSERVED_AT,
    positionSource: "B3_POSITION_XLSX",
    positionIdentityLimitation:
      "A identidade usa o tipo normalizado, vencimento e data-base informados no XLSX importado da B3; não há validação externa automatizada do título nesta versão.",
  };
}
