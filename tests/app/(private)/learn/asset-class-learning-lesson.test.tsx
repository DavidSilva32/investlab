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

    expect(
      screen.getByRole("region", {
        name: "Exemplo de vacância física em 10 salas de mesma área",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: /Dez salas de mesma área: oito ocupadas e duas vazias/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(/2 de 10 vazias representam 20% da área/),
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

      const roadmap = screen.getByRole("region", {
        name: `Roteiro de análise: ${className}`,
      });
      expect(roadmap).toBeTruthy();
      expect(screen.getByText(representativeStep)).toBeTruthy();
      expect(within(roadmap).getAllByRole("listitem")).toHaveLength(4);
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

  it("shows visual examples for each asset class", () => {
    const examples = [
      ["fixed_income", 0, "CDB", "LCI e LCA", "A ‘caixinha’ do aplicativo"],
      ["brazilian_equities", 1, "Uma padaria", "Demanda recorrente"],
      ["international_etfs", 1, "Mercado amplo", "Setor ou renda fixa"],
      [
        "fiis",
        1,
        "Imóveis de renda (tijolo)",
        "Títulos imobiliários (papel)",
        "Fundos de fundos",
      ],
    ] as const;

    for (const [selectedClass, lessonIndex, ...titles] of examples) {
      const lesson =
        assetClassLearningContent[selectedClass].courseLessons[lessonIndex];
      const { unmount } = render(
        <AssetClassLearningLesson
          selectedClass={selectedClass}
          lessonIndex={lessonIndex}
          lesson={lesson}
        />,
      );

      const section = screen.getByRole("region", {
        name: `Exemplos: ${
          {
            fiis: "Fundos imobiliários (FIIs)",
            fixed_income: "Renda fixa",
            brazilian_equities: "Ações e BDRs",
            international_etfs: "ETFs internacionais",
          }[selectedClass]
        }`,
      });
      expect(
        within(section).getByRole("heading", {
          name: "Na prática",
        }),
      ).toBeTruthy();
      for (const title of titles) {
        expect(
          within(section).getByRole("heading", { name: title }),
        ).toBeTruthy();
      }
      unmount();
    }
  });

  it("uses a connected, product-focused visual for fixed-income offer terms", () => {
    render(
      <AssetClassLearningLesson
        selectedClass="fixed_income"
        lessonIndex={1}
        lesson={assetClassLearningContent.fixed_income.courseLessons[1]}
      />,
    );

    const examples = screen.getByRole("region", {
      name: "Exemplos: Renda fixa",
    });
    expect(
      within(examples).getByRole("heading", {
        name: "Três pontos para conferir na oferta",
      }),
    ).toBeTruthy();
    const list = within(examples).getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(list.className).toContain("sm:grid-cols-3");
    for (const item of items.slice(0, 2)) {
      const icons = item.querySelectorAll("svg");
      expect(icons).toHaveLength(2);
      expect(icons[1].getAttribute("class")).toContain("sm:absolute");
    }
    expect(within(examples).getByText(/resgate em dias úteis/)).toBeTruthy();
    expect(
      within(examples).getByText(/data prevista para o título terminar/),
    ).toBeTruthy();
    expect(
      within(examples).getByText(/acompanha uma referência, como o CDI/),
    ).toBeTruthy();
    expect(examples.querySelectorAll("svg")).toHaveLength(6);
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

  it("explains equity indicators in plain language", () => {
    render(
      <AssetClassLearningLesson
        selectedClass="brazilian_equities"
        lessonIndex={2}
        lesson={assetClassLearningContent.brazilian_equities.courseLessons[2]}
      />,
    );

    expect(screen.getByText("Relaciona preço e lucro por ação")).toBeTruthy();
    expect(
      screen.getByText("Compara preço e patrimônio por ação"),
    ).toBeTruthy();
    expect(
      screen.getByText("Relaciona lucro e patrimônio da empresa"),
    ).toBeTruthy();
  });
});
