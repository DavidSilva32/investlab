// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AssetClassLearningCourse } from "@/app/(private)/learn/_components/asset-class-learning-course";
import { assetClassLearningContent } from "@/lib/asset-class-learning";

afterEach(cleanup);

describe("AssetClassLearningCourse", () => {
  it("guides a learner through short lessons, the existing video, and a quiz", () => {
    render(
      <AssetClassLearningCourse
        selectedClass="fiis"
        content={assetClassLearningContent.fiis}
      />,
    );

    expect(
      screen.getByRole("region", {
        name: "Mini-curso: Fundos imobiliários (FIIs)",
      }),
    ).toBeTruthy();
    expect(screen.getByText("1 de 4")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "O que é um fundo imobiliário?" }),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(/Vídeo educativo/) instanceof HTMLVideoElement,
    ).toBe(true);
    expect(screen.queryByRole("radio")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Próxima aula" }));
    expect(
      screen.getByRole("heading", { name: "A cota é sua participação" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(
      screen.getByRole("heading", { name: "O que é um fundo imobiliário?" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Próxima aula" }));
    expect(screen.queryByRole("video")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Próxima aula" }));
    expect(
      screen.getByRole("heading", { name: "Rendimentos podem variar" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ir para a pergunta" }));

    expect(screen.getByText("4 de 4")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(
      screen
        .getByRole("button", { name: "Etapa 1: O que é um fundo imobiliário?" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("celebrates only after a correct answer and allows returning to lessons", () => {
    render(
      <AssetClassLearningCourse
        selectedClass="fixed_income"
        content={assetClassLearningContent.fixed_income}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Próxima aula" }));
    fireEvent.click(screen.getByRole("button", { name: "Próxima aula" }));
    fireEvent.click(screen.getByRole("button", { name: "Ir para a pergunta" }));

    expect(screen.queryByText("Boa! Curso concluído.")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Que as regras/ }));
    fireEvent.click(screen.getByRole("button", { name: "Conferir resposta" }));

    expect(screen.getByText("Boa! Curso concluído.")).toBeTruthy();
    expect(
      screen.getByText("Você pode rever as aulas quando quiser."),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Etapa 1: O que é renda fixa?" }),
    );
    expect(
      screen.getByRole("heading", { name: "O que é renda fixa?" }),
    ).toBeTruthy();
  });
});
