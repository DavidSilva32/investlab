// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

  it("provides a concise FII analysis checklist and historical DY explanation", () => {
    render(
      <AssetClassLearningLesson
        selectedClass="fiis"
        lessonIndex={3}
        lesson={assetClassLearningContent.fiis.courseLessons[3]}
      />,
    );

    expect(
      screen.getByLabelText("Roteiro simples para analisar um fundo"),
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

    expect(screen.queryByText("Ideia principal")).toBeNull();
    expect(screen.queryByLabelText("Exemplo de vacância física")).toBeNull();
  });
});
