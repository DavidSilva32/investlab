import { describe, expect, it } from "vitest";
import { isThemePaletteId, themePalettes } from "@/lib/theme-palettes";

describe("theme palettes", () => {
  it("provides six independent hue palettes with unique identifiers", () => {
    expect(themePalettes).toHaveLength(6);
    expect(new Set(themePalettes.map(({ value }) => value)).size).toBe(6);
    expect(themePalettes.map(({ value }) => value)).toEqual([
      "blue",
      "teal",
      "green",
      "violet",
      "orange",
      "rose",
    ]);
    expect(themePalettes.map(({ label }) => label)).toEqual([
      "Azul",
      "Turquesa",
      "Verde",
      "Violeta",
      "Laranja",
      "Rosa",
    ]);
    expect(themePalettes.every(({ value }) => isThemePaletteId(value))).toBe(
      true,
    );
    expect(isThemePaletteId("dark")).toBe(false);
  });
});
