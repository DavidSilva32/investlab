import { describe, expect, it } from "vitest";
import { resolveAssetLogoUrl } from "@/lib/asset-logo";

describe("resolveAssetLogoUrl", () => {
  it.each([
    "PETR3",
    "PETR4",
    "BBAS3",
    "VALE3",
    "WEGE3",
    "BOVA11",
    "AAPL34",
    "HGLG11",
    "SANB11",
  ])("uses the exact instrument %s without guessing its issuer", (ticker) => {
    expect(resolveAssetLogoUrl(ticker)).toBe(
      `https://icons.brapi.dev/icons/${ticker}.svg`,
    );
  });
  it("normalizes only ticker casing and whitespace", () => {
    expect(resolveAssetLogoUrl(" petr4 ")).toBe(
      "https://icons.brapi.dev/icons/PETR4.svg",
    );
    expect(
      resolveAssetLogoUrl("VOO", "https://icons.brapi.dev/icons/VOO.svg"),
    ).toBe("https://icons.brapi.dev/icons/VOO.svg");
  });
  it.each([
    undefined,
    null,
    "",
    "VOO",
    "CDB",
    "PETR4/",
    "../PETR4",
    "PETR 4",
    "1234",
    "ABCDEFGHIJKLM",
  ])(
    "does not generate a logo for invalid or unsupported ticker %s",
    (ticker) => {
      expect(resolveAssetLogoUrl(ticker)).toBeNull();
    },
  );
  it.each([
    "invalid",
    "http://icons.brapi.dev/icons/PETR4.svg",
    "https://evil.test/icons/PETR4.svg",
    "https://icons.brapi.dev.evil.test/icons/PETR4.svg",
    "https://icons.brapi.dev:444/icons/PETR4.svg",
    "https://user@icons.brapi.dev/icons/PETR4.svg",
    "https://user:pass@icons.brapi.dev/icons/PETR4.svg",
    "https://icons.brapi.dev/icons/PETR4.svg?token=private",
    "https://icons.brapi.dev/icons/PETR4.svg#fragment",
    "https://icons.brapi.dev/icons/PETR3.svg",
    "https://icons.brapi.dev/icons/PETR4.png",
    "data:image/svg+xml,evil",
  ])("rejects untrusted or mismatched source %s", (source) => {
    expect(resolveAssetLogoUrl("PETR4", source)).toBeNull();
  });
  it("preserves a validated provider URL", () => {
    expect(
      resolveAssetLogoUrl("PETR4", "https://icons.brapi.dev/icons/PETR4.svg"),
    ).toBe("https://icons.brapi.dev/icons/PETR4.svg");
    expect(
      resolveAssetLogoUrl(undefined, "https://icons.brapi.dev/icons/PETR4.svg"),
    ).toBeNull();
  });
});
