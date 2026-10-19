import { describe, expect, it } from "vitest";
import { TERMS_OF_USE_SECTIONS } from "@/lib/terms-of-use";

describe("TERMS_OF_USE_SECTIONS", () => {
  it("covers current product use, access, financial information, and account requests", () => {
    const text = TERMS_OF_USE_SECTIONS.flatMap((section) => [
      section.title,
      ...section.paragraphs,
      ...(section.bullets ?? []),
    ]).join(" ");

    expect(text).toContain("importação de arquivos compatíveis da B3");
    expect(text).toContain("O InvestLab não envia ordens de compra ou venda");
    expect(text).toContain("não oferece uma ferramenta de autoatendimento");
    expect(text).toMatch(/cookies.*separadamente/i);
  });

  it("has uniquely identified sections and avoids invented legal identity or contact details", () => {
    const titles = TERMS_OF_USE_SECTIONS.map(({ title }) => title);
    const text = TERMS_OF_USE_SECTIONS.flatMap(
      ({ paragraphs }) => paragraphs,
    ).join(" ");

    expect(new Set(titles).size).toBe(titles.length);
    expect(text).not.toMatch(/advogado|escritório de advocacia|suporte@|dpo@/i);
  });
});
