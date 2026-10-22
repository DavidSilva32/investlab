// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetClassLearningLesson } from "@/app/(private)/learn/_components/asset-class-learning-lesson";
import { assetClassLearningContent } from "@/lib/asset-class-learning";

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

afterEach(cleanup);

describe("AssetClassLearningLesson", () => {
  it("illustrates how cotistas share participation in the fund", () => {
    render(
      <AssetClassLearningLesson
        selectedClass="fiis"
        lessonIndex={1}
        lesson={assetClassLearningContent.fiis.courseLessons[1]}
      />,
    );

    expect(
      screen.getByLabelText("Como funciona a participação em um fundo"),
    ).toBeTruthy();
    expect(screen.getByRole("img", { name: /seis investidores/ })).toBeTruthy();
    expect(screen.getAllByText("Cotista")).toHaveLength(5);
    expect(screen.queryByText("Cota", { exact: true })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Exemplos de portfólio" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("img")).toHaveLength(4);
  });

  it("shows vacancy as occupied and empty spaces with physical and financial context", () => {
    render(
      <AssetClassLearningLesson
        selectedClass="fiis"
        lessonIndex={2}
        lesson={assetClassLearningContent.fiis.courseLessons[2]}
      />,
    );

    expect(screen.getByLabelText("Exemplo de vacância física")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /Oito salas ocupadas/ }),
    ).toBeTruthy();
    expect(screen.getByText("Vacância financeira")).toBeTruthy();
  });

  it.each([
    ["fiis", "Fundos imobiliários (FIIs)", "Objetivo e estratégia"],
    ["fixed_income", "Renda fixa", "Emissor e crédito"],
    ["brazilian_equities", "Ações e BDRs", "Indicadores e contexto"],
    ["international_etfs", "ETFs internacionais", "Índice e carteira"],
  ] as const)(
    "provides a compact, class-specific analysis roadmap for %s",
    (selectedClass, className, representativeStep) => {
      render(
        <AssetClassLearningLesson
          selectedClass={selectedClass}
          lessonIndex={3}
          lesson={assetClassLearningContent[selectedClass].courseLessons[3]}
        />,
      );

      expect(
        screen.getByRole("region", {
          name: `Roteiro de análise: ${className}`,
        }),
      ).toBeTruthy();
      expect(screen.getByText(representativeStep)).toBeTruthy();
      expect(screen.getAllByRole("listitem")).toHaveLength(4);
    },
  );

  it("keeps the FII historical DY caveat in its analysis roadmap", () => {
    render(
      <AssetClassLearningLesson
        selectedClass="fiis"
        lessonIndex={3}
        lesson={assetClassLearningContent.fiis.courseLessons[3]}
      />,
    );

    expect(
      screen.getByLabelText("Roteiro de análise: Fundos imobiliários (FIIs)"),
    ).toBeTruthy();
    expect(screen.getByText("DY histórico")).toBeTruthy();
    expect(screen.getByText(/não promessa de rendimento/)).toBeTruthy();
  });

  it("keeps the remaining FII lessons focused without duplicate visual panels", () => {
    const lesson = assetClassLearningContent.fiis.courseLessons[0];
    render(
      <AssetClassLearningLesson
        selectedClass="fiis"
        lessonIndex={0}
        lesson={lesson}
      />,
    );

    expect(screen.queryByLabelText("Exemplo de vacância física")).toBeNull();
    expect(
      screen.queryByLabelText("Como funciona a participação em um fundo"),
    ).toBeNull();
  });

  it("does not add unrelated FII diagrams to another class", () => {
    const lesson =
      assetClassLearningContent.brazilian_equities.courseLessons[0];
    render(
      <AssetClassLearningLesson
        selectedClass="brazilian_equities"
        lessonIndex={0}
        lesson={lesson}
      />,
    );

    expect(screen.queryByLabelText("Exemplo de vacância física")).toBeNull();
  });

  it.each([
    [
      "fixed_income",
      1,
      "Prazo e liquidez definem quando usar o recurso",
      "Prazo",
      "Liquidez",
      "Produto",
    ],
    [
      "fixed_income",
      2,
      "Emissor e proteções também importam",
      "Emissor",
      "Proteções",
      "Crédito",
    ],
    [
      "fixed_income",
      3,
      "Compare as condições lado a lado",
      "Remuneração",
      "Prazo",
      "Liquidez",
    ],
    [
      "brazilian_equities",
      1,
      "O resultado começa no negócio",
      "Empresa",
      "Receita",
      "Lucro",
    ],
    [
      "brazilian_equities",
      2,
      "Cada indicador responde uma pergunta",
      "P/L",
      "P/VP",
      "ROE",
    ],
    [
      "brazilian_equities",
      3,
      "Preço observado e estimativa são diferentes",
      "Preço de mercado",
      "Método",
      "Estimativa",
    ],
    [
      "international_etfs",
      1,
      "Entenda a referência e a composição",
      "Índice",
      "Regras",
      "Ativos",
    ],
    [
      "international_etfs",
      2,
      "Ativos, mercados e câmbio podem influenciar",
      "Ativos",
      "Mercados",
      "Câmbio",
    ],
    [
      "international_etfs",
      3,
      "Diversificar distribui exposição, sem zerar riscos",
      "Cesta",
      "Concentração",
      "Riscos",
    ],
  ] as const)(
    "shows the visual for %s lesson %i using that lesson's concepts",
    (
      selectedClass,
      lessonIndex,
      title,
      firstLabel,
      secondLabel,
      thirdLabel,
    ) => {
      render(
        <AssetClassLearningLesson
          selectedClass={selectedClass}
          lessonIndex={lessonIndex}
          lesson={
            assetClassLearningContent[selectedClass].courseLessons[lessonIndex]
          }
        />,
      );

      const visual = screen.getByRole("region", { name: title });
      expect(visual).toBeTruthy();
      expect(within(visual).getByText(firstLabel)).toBeTruthy();
      expect(within(visual).getByText(secondLabel)).toBeTruthy();
      expect(within(visual).getByText(thirdLabel)).toBeTruthy();
      expect(screen.getByText("Esquema simplificado")).toBeTruthy();
    },
  );

  it("states the precise per-share bases for equity indicators", () => {
    render(
      <AssetClassLearningLesson
        selectedClass="brazilian_equities"
        lessonIndex={2}
        lesson={assetClassLearningContent.brazilian_equities.courseLessons[2]}
      />,
    );

    expect(screen.getByText("Preço da ação ÷ lucro por ação")).toBeTruthy();
    expect(
      screen.getByText("Preço da ação ÷ valor patrimonial por ação"),
    ).toBeTruthy();
    const roeBasis = screen.getByText(
      "Lucro líquido ÷ patrimônio líquido médio do período × 100",
    );
    expect(roeBasis).toBeTruthy();
    expect(roeBasis.className).toContain("text-xs");
  });
});
