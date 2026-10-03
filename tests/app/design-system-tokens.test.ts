import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("design system semantic color tokens", () => {
  const css = readFileSync(
    resolve(process.cwd(), "src/app/globals.css"),
    "utf8",
  );

  it("defines asset class, status, and destination tokens for both themes", () => {
    const lightTheme = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
    const darkTheme = css.match(/\.dark\s*\{([^}]*)\}/)?.[1] ?? "";
    const semanticTokens = [
      "asset-class-fixed-income",
      "asset-class-brazilian-equities",
      "asset-class-international-etfs",
      "asset-class-fiis",
      "asset-class-neutral",
      "status-success",
      "status-warning",
      "status-danger",
      "status-info",
      "destination-reserve",
      "destination-personal",
      "destination-long-term",
      "destination-purpose-unknown",
      "destination-unassigned",
      "chart-category-1",
      "chart-category-2",
      "chart-category-3",
      "chart-category-4",
      "chart-category-5",
      "chart-category-6",
    ];

    for (const token of semanticTokens) {
      expect(lightTheme).toMatch(new RegExp(`--${token}:`));
      expect(darkTheme).toMatch(new RegExp(`--${token}:`));
      expect(css).toMatch(new RegExp(`--color-${token}: var\\(--${token}\\)`));
    }
  });
});
