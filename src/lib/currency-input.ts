export type CurrencyInputSelection = {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
  endOfInput: boolean;
};

export function parseBrazilianAmount(value: string) {
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/^[^\d-]*/, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return normalized ? Number(normalized) : Number.NaN;
}

export function formatAmountInput(value: string, prefix = "R$ ") {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  const cents = digits.padStart(3, "0");
  const integer = cents.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${prefix}${integer},${cents.slice(-2)}`;
}

export function formatBrazilianAmountValue(value: string, prefix = "R$ ") {
  if (!value || !Number.isFinite(Number(value))) return "";
  const cents = Math.round(Number(value) * 100).toString();
  return formatAmountInput(cents, prefix);
}

export function countDigitsBefore(value: string, position: number) {
  return (value.slice(0, position).match(/\d/g) ?? []).length;
}

export function caretPositionForDigitCount(
  value: string,
  digitsBefore: number,
) {
  if (digitsBefore === 0) {
    const firstDigit = value.search(/\d/);
    return firstDigit < 0 ? value.length : firstDigit;
  }

  let digitCount = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index]) && ++digitCount === digitsBefore) {
      return index + 1;
    }
  }
  return value.length;
}

export function getCurrencyInputSelection(
  value: string,
  nextValue: string,
  start: number,
  end: number,
  direction: CurrencyInputSelection["direction"] | null,
): CurrencyInputSelection | null {
  if (nextValue === value) return null;
  return {
    start: countDigitsBefore(value, start),
    end: countDigitsBefore(value, end),
    direction: direction ?? "none",
    endOfInput: start === value.length && end === value.length,
  };
}

export function resolveCurrencyInputSelection(
  value: string,
  selection: CurrencyInputSelection,
) {
  return {
    start: selection.endOfInput
      ? value.length
      : caretPositionForDigitCount(value, selection.start),
    end: selection.endOfInput
      ? value.length
      : caretPositionForDigitCount(value, selection.end),
    direction: selection.direction,
  };
}
