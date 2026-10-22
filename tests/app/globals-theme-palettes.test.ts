import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8",
);

function declarations(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = stylesheet.match(
    new RegExp(`(?:^|\\n)\\s*${escapedSelector}\\s*\\{([^}]*)\\}`),
  );
  if (!rule) {
    throw new Error(`Regra CSS ausente: ${selector}`);
  }
  return new Map(
    [...rule[1].matchAll(/((?:--)?[\w-]+)\s*:\s*([^;]+);/g)].map(
      ([, property, value]) => [property, value.trim()],
    ),
  );
}

function parseOklch(value: string | undefined) {
  const match = value?.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/);
  if (!match) throw new Error(`Cor OKLCH inválida: ${value ?? "ausente"}`);

  const [, lightnessText, chromaText, hueText] = match;
  const lightness = Number(lightnessText);
  const chroma = Number(chromaText);
  const hue = (Number(hueText) * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linearRgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const rgb = linearRgb.map((channel) => {
    const clamped = Math.min(1, Math.max(0, channel));
    return clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * clamped ** (1 / 2.4) - 0.055;
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrastRatio(
  foreground: string | undefined,
  background: string | undefined,
  hue: number,
) {
  const withHue = (value: string | undefined) =>
    value?.replaceAll("var(--brand-hue)", String(hue));
  const foregroundLuminance = parseOklch(withHue(foreground));
  const backgroundLuminance = parseOklch(withHue(background));
  const brightest = Math.max(foregroundLuminance, backgroundLuminance);
  const darkest = Math.min(foregroundLuminance, backgroundLuminance);
  return (brightest + 0.05) / (darkest + 0.05);
}

describe("paletas globais", () => {
  it("keeps palette identity hue-only and readable in both appearance modes", () => {
    const root = declarations(":root");
    const dark = declarations(".dark");
    for (const [palette, hue] of Object.entries({
      blue: 255,
      teal: 190,
      green: 145,
      violet: 305,
      orange: 40,
      rose: 350,
    })) {
      const selector = `[data-palette="${palette}"]`;
      const tokens = declarations(selector);
      expect(tokens.get("--brand-hue"), selector).toBe(String(hue));
      expect(tokens.size, `${selector} only overrides identity hue`).toBe(1);
      for (const appearance of [root, dark]) {
        expect(appearance.get("--primary")).toBe("var(--brand)");
        expect(appearance.get("--primary-foreground")).toBe(
          "var(--brand-foreground)",
        );
        expect(
          contrastRatio(
            appearance.get("--brand-foreground"),
            appearance.get("--brand"),
            hue,
          ),
          `${selector} brand contrast`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(
            appearance.get("--foreground"),
            appearance.get("--background"),
            hue,
          ),
          `${selector} surface contrast`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(declarations(":root").get("color-scheme")).toBe("light");
    expect(declarations(".dark").get("color-scheme")).toBe("dark");
    expect(declarations(":root").get("--foreground")).toBeTruthy();
    expect(declarations(".dark").get("--foreground")).toBeTruthy();
  });

  it("preserves semantic class, status, destination, and chart colors across palette hues", () => {
    const lightTokens = declarations(":root");
    const nightTokens = declarations(".dark");
    const semanticNames = [...lightTokens.keys()].filter((name) =>
      /^(--status-|--destination-|--asset-class-|--chart-category-|--destructive)/.test(
        name,
      ),
    );
    for (const [palette] of Object.entries({
      blue: 1,
      teal: 1,
      green: 1,
      violet: 1,
      orange: 1,
      rose: 1,
    })) {
      const tokens = declarations(`[data-palette="${palette}"]`);
      for (const name of semanticNames)
        expect(tokens.has(name), `${palette} ${name}`).toBe(false);
      expect(tokens.size).toBe(1);
    }
    for (const name of semanticNames) {
      expect(nightTokens.has(name), `${name} night token`).toBe(true);
    }
    expect(stylesheet).not.toMatch(/\.(green-dark|violet-dark)\s*\{/);
  });

  it("defines independent primary aliases for both modes", () => {
    for (const selector of [":root", ".dark"]) {
      const tokens = declarations(selector);
      expect(tokens.get("--primary"), selector).toBe("var(--brand)");
      expect(tokens.get("--primary-foreground"), selector).toBe(
        "var(--brand-foreground)",
      );
    }
  });
});
