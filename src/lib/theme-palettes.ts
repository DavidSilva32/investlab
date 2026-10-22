export const themePalettes = [
  { value: "blue", label: "Azul" },
  { value: "teal", label: "Turquesa" },
  { value: "green", label: "Verde" },
  { value: "violet", label: "Violeta" },
  { value: "orange", label: "Laranja" },
  { value: "rose", label: "Rosa" },
] as const;

export type ThemePaletteId = (typeof themePalettes)[number]["value"];

export function isThemePaletteId(value: string): value is ThemePaletteId {
  return themePalettes.some((palette) => palette.value === value);
}
