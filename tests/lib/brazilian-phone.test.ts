import { describe, expect, it } from "vitest";
import {
  brazilianPhoneDigits,
  formatBrazilianPhone,
  isValidBrazilianPhoneDigits,
  normalizeBrazilianPhone,
} from "@/lib/brazilian-phone";

describe("Brazilian phone helpers", () => {
  it("masks partial input and both landline and mobile numbers", () => {
    expect(formatBrazilianPhone("1")).toBe("(1");
    expect(formatBrazilianPhone("11987654321")).toBe("(11) 98765-4321");
    expect(formatBrazilianPhone("1133334444")).toBe("(11) 3333-4444");
  });

  it("accepts a valid optional country code and preserves excess digits", () => {
    expect(brazilianPhoneDigits("+55 (11) 98765-4321")).toBe("11987654321");
    expect(brazilianPhoneDigits("+55 (11) 3333-4444")).toBe("1133334444");
    expect(brazilianPhoneDigits("11987654321")).toBe("11987654321");
    expect(brazilianPhoneDigits("1133334444")).toBe("1133334444");
    expect(brazilianPhoneDigits("5511987654321")).toBe("5511987654321");
    expect(brazilianPhoneDigits("551133334444")).toBe("551133334444");
    expect(brazilianPhoneDigits("1198765432100")).toBe("1198765432100");
    expect(formatBrazilianPhone("+55 (11) 98")).toBe("+55 (11) 98");
    expect(formatBrazilianPhone("5511987654321")).toBe("5511987654321");
    expect(formatBrazilianPhone("1198765432100")).toBe("1198765432100");
  });

  it("validates exact national phone lengths without truncating", () => {
    expect(isValidBrazilianPhoneDigits("11987654321")).toBe(true);
    expect(isValidBrazilianPhoneDigits("1133334444")).toBe(true);
    expect(isValidBrazilianPhoneDigits("123456789")).toBe(false);
    expect(normalizeBrazilianPhone("(11) 98765-4321")).toBe("11987654321");
    expect(normalizeBrazilianPhone("+55 (11) 98765-4321")).toBe("11987654321");
    expect(normalizeBrazilianPhone("+55 (11) 98765-4")).toBeUndefined();
    expect(normalizeBrazilianPhone("+55 (11) 98765-43210")).toBeUndefined();
    expect(normalizeBrazilianPhone("   ")).toBeNull();
    expect(normalizeBrazilianPhone("123")).toBeUndefined();
    expect(normalizeBrazilianPhone("5511987654321")).toBeUndefined();
    expect(normalizeBrazilianPhone("1198765432100")).toBeUndefined();
  });
});
