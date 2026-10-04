import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getStrategyAssetClassColor,
  neutralAssetClassColor,
  strategyAssetClasses,
  type StrategyAssetClassId,
} from "@/lib/strategy-allocation";

describe("design system semantic color tokens", () => {
  const css = readFileSync(
    resolve(process.cwd(), "src/app/globals.css"),
    "utf8",
  );
  const lightTheme = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
  const darkTheme = css.match(/\.dark\s*\{([^}]*)\}/)?.[1] ?? "";
  const themeValues = (theme: string) =>
    Object.fromEntries(
      [...theme.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, key, value]) => [
        key,
        value,
      ]),
    );
  const lightValues = themeValues(lightTheme);
  const darkValues = themeValues(darkTheme);
  const oklchHue = (value: string | undefined) => {
    const hue = value?.match(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s*\)/);
    return hue ? Number(hue[1]) : null;
  };

  it("defines asset class, status, and destination tokens for both themes", () => {
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

  it("maps primary and focus to the blue brand token in both themes", () => {
    expect(lightValues.primary).toBe("var(--brand)");
    expect(lightValues.ring).toBe("var(--brand)");
    expect(darkValues.primary).toBe("var(--brand)");
    expect(darkValues.ring).toBe("var(--brand)");
    expect(oklchHue(lightValues.brand)).toBe(255);
    expect(oklchHue(darkValues.brand)).toBe(255);
  });

  it("keeps asset colors tied to stable IDs and reserves neutral for unknown IDs", () => {
    const hues: Record<StrategyAssetClassId, readonly [number, number]> = {
      fixed_income: [55, 70],
      brazilian_equities: [255, 250],
      international_etfs: [305, 305],
      fiis: [150, 150],
    };

    expect(
      strategyAssetClasses.map(({ id, colorToken }) => {
        const cssName = colorToken.slice(2);
        return [
          getStrategyAssetClassColor(id),
          colorToken,
          oklchHue(lightValues[cssName]),
          oklchHue(darkValues[cssName]),
        ];
      }),
    ).toEqual(
      strategyAssetClasses.map(({ id, colorToken }) => [
        `var(${colorToken})`,
        colorToken,
        ...hues[id],
      ]),
    );
    expect(getStrategyAssetClassColor(null)).toBe(neutralAssetClassColor);
    expect(neutralAssetClassColor).toBe("var(--asset-class-neutral)");
    expect(oklchHue(lightValues["asset-class-neutral"])).toBe(160);
    expect(oklchHue(darkValues["asset-class-neutral"])).toBe(160);
  });
});
