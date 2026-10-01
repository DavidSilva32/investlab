export type PortfolioMoneySource =
  | "CDB_ESTIMATE"
  | "B3_IMPORTED"
  | "MANUAL_REPORTED"
  | "MANUAL_CONVERTED"
  | "UNVALUED";

export type PortfolioMoney = {
  cents: bigint | null;
  source: PortfolioMoneySource;
};

type DecimalInput = string | number | null | undefined;

type PositionMoneyInput = {
  source?: string | null;
  currency?: string | null;
  totalValue?: DecimalInput;
  estimatedValue?: DecimalInput;
  estimatedValueCents?: string | null;
  convertedValueBrl?: DecimalInput;
};

const decimalPattern = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i;

export function decimalToCents(value: DecimalInput): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;

  const match = decimalPattern.exec(String(value).trim());
  if (!match) return null;

  const [, sign, integer, fractional = "", exponentText = "0"] = match;
  const exponent = Number(exponentText);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 100) return null;

  const digits = BigInt(`${integer}${fractional}`);
  const scale = exponent - fractional.length + 2;
  let absoluteCents: bigint;

  if (scale >= 0) {
    absoluteCents = digits * 10n ** BigInt(scale);
  } else {
    const divisor = 10n ** BigInt(-scale);
    const quotient = digits / divisor;
    const remainder = digits % divisor;
    absoluteCents = remainder * 2n >= divisor ? quotient + 1n : quotient;
  }

  return sign === "-" ? -absoluteCents : absoluteCents;
}

export function resolvePositionMoney(
  position: PositionMoneyInput,
): PortfolioMoney {
  if (
    position.estimatedValueCents !== null &&
    position.estimatedValueCents !== undefined
  ) {
    if (/^-?\d+$/.test(position.estimatedValueCents)) {
      return {
        cents: BigInt(position.estimatedValueCents),
        source: "CDB_ESTIMATE",
      };
    }
  }

  const estimate = decimalToCents(position.estimatedValue);
  if (estimate !== null) return { cents: estimate, source: "CDB_ESTIMATE" };

  const imported = decimalToCents(position.totalValue);
  if (imported !== null) {
    return {
      cents: imported,
      source:
        position.source === "MANUAL"
          ? position.currency && position.currency !== "BRL"
            ? "MANUAL_CONVERTED"
            : "MANUAL_REPORTED"
          : "B3_IMPORTED",
    };
  }

  const converted = decimalToCents(position.convertedValueBrl);
  if (converted !== null) {
    return { cents: converted, source: "MANUAL_CONVERTED" };
  }

  return { cents: null, source: "UNVALUED" };
}

export function sumMoneyCents(values: Array<bigint | null | undefined>) {
  return values.reduce<bigint>((total, value) => total + (value ?? 0n), 0n);
}

export function centsToDecimalString(cents: bigint) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const units = absolute / 100n;
  const fractional = String(absolute % 100n).padStart(2, "0");
  return `${negative ? "-" : ""}${units}.${fractional}`;
}

export function centsToNumber(cents: bigint | null) {
  return cents === null ? null : Number(centsToDecimalString(cents));
}

const currencyPartsFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integerFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

export function formatCurrencyCents(cents: bigint | string | null) {
  if (cents === null) return "—";
  const value = typeof cents === "bigint" ? cents : BigInt(cents);
  const absolute = value < 0n ? -value : value;
  const parts = currencyPartsFormatter.formatToParts(value < 0n ? -1 : 1);
  return parts
    .map((part) => {
      if (part.type === "integer") {
        return integerFormatter.format(absolute / 100n);
      }
      if (part.type === "fraction") {
        return String(absolute % 100n).padStart(2, "0");
      }
      return part.value;
    })
    .join("");
}
