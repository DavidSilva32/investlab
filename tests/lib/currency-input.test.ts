import { describe, expect, it } from "vitest";
import {
  caretPositionForDigitCount,
  countDigitsBefore,
  formatAmountInput,
  formatBrazilianAmountValue,
  getCurrencyInputSelection,
  parseBrazilianAmount,
  resolveCurrencyInputSelection,
} from "@/lib/currency-input";

describe("currency input helpers", () => {
  it("formats digit entry as grouped Brazilian currency with an optional prefix", () => {
    expect(formatAmountInput("4727491")).toBe("R$ 47.274,91");
    expect(formatAmountInput("0001", "US$ ")).toBe("US$ 0,01");
    expect(formatAmountInput("123456789", "EUR ")).toBe("EUR 1.234.567,89");
    expect(formatAmountInput("000")).toBe("R$ 0,00");
    expect(formatAmountInput("")).toBe("");
  });

  it("formats canonical values for editing and handles empty or invalid values", () => {
    expect(formatBrazilianAmountValue("1234.5")).toBe("R$ 1.234,50");
    expect(formatBrazilianAmountValue("50", "US$ ")).toBe("US$ 50,00");
    expect(formatBrazilianAmountValue("")).toBe("");
    expect(formatBrazilianAmountValue("invalid")).toBe("");
  });

  it("parses localized amounts and reports empty input as invalid", () => {
    expect(parseBrazilianAmount("R$ 47.274,91")).toBe(47274.91);
    expect(parseBrazilianAmount("US$ 5.464,44")).toBe(5464.44);
    expect(Number.isNaN(parseBrazilianAmount(""))).toBe(true);
  });

  it("maps the selection through inserted grouping characters", () => {
    expect(countDigitsBefore("R$ 1.234,50", 8)).toBe(4);
    expect(countDigitsBefore("R$ ", 3)).toBe(0);
    expect(caretPositionForDigitCount("R$ 12.345,00", 0)).toBe(3);
    expect(caretPositionForDigitCount("R$ 12.345,00", 5)).toBe(9);
    expect(caretPositionForDigitCount("R$ 12.345,00", 99)).toBe(12);
    expect(caretPositionForDigitCount("R$ ", 0)).toBe(3);

    const selection = getCurrencyInputSelection(
      "12345",
      "R$ 123,45",
      2,
      4,
      "backward",
    );
    expect(selection).toEqual({
      start: 2,
      end: 4,
      direction: "backward",
      endOfInput: false,
    });
    expect(getCurrencyInputSelection("same", "same", 2, 2, "none")).toBeNull();
    expect(
      getCurrencyInputSelection("123", "R$ 1,23", 3, 3, null)?.direction,
    ).toBe("none");
    expect(
      getCurrencyInputSelection("12345", "R$ 123,45", 5, 5, "none")?.endOfInput,
    ).toBe(true);
    expect(resolveCurrencyInputSelection("R$ 123,45", selection!)).toEqual({
      start: 5,
      end: 8,
      direction: "backward",
    });
    expect(
      resolveCurrencyInputSelection("R$ 123,45", {
        start: 5,
        end: 5,
        direction: "none",
        endOfInput: true,
      }),
    ).toEqual({ start: 9, end: 9, direction: "none" });
  });
});
