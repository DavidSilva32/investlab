// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortfolioAllocationTargets } from "@/app/portfolio/_components/portfolio-allocation-targets";

const positions = [
  {
    id: "b8b74f5e-784e-4ef6-aa9e-3ad9b330ca1a",
    product: "CDB",
    institution: "Banco Exemplo",
    estimatedValue: 600,
    totalValue: "600",
    classification: {
      assetClass: "Renda fixa",
      subClass: "CDB",
      geography: null,
    },
    classificationSource: "inferred" as const,
  },
  {
    id: "a98bde34-1730-42ab-8c9c-97a88b52a7df",
    product: "Fundo",
    institution: "Corretora",
    estimatedValue: 300,
    totalValue: "300",
    classification: { assetClass: "Fundos", subClass: null, geography: null },
    classificationSource: "manual" as const,
  },
  {
    id: "e05c0a4d-ace8-49ae-a670-74723a9ff983",
    product: "Ativo desconhecido",
    institution: null,
    estimatedValue: 100,
    totalValue: "100",
    classification: { assetClass: null, subClass: null, geography: null },
    classificationSource: "unclassified" as const,
  },
  {
    id: "caa441ed-36f4-4c66-ade6-a9152c17bdab",
    product: "Sem valor",
    institution: null,
    estimatedValue: null,
    totalValue: null,
    classification: { assetClass: null, subClass: null, geography: null },
    classificationSource: "unclassified" as const,
  },
];

const savedTargets = {
  "Renda fixa": 50,
  "Renda variável": 20,
  Fundos: 20,
  Criptoativos: 5,
  Imóveis: 0,
  Outros: 5,
};

describe("PortfolioAllocationTargets", () => {
  afterEach(cleanup);

  it("compares user targets with current values and explains missing coverage", () => {
    render(
      <PortfolioAllocationTargets
        positions={positions}
        targetPercentages={savedTargets}
        saving={false}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Metas da sua estratégia")).toBeTruthy();
    expect(screen.getByText("60.0%")).toBeTruthy();
    expect(screen.getByText("50.0%")).toBeTruthy();
    expect(screen.getAllByText("-10.0 p.p.")).toHaveLength(2);
    expect(screen.getByText("Meta − atual")).toBeTruthy();
    expect(
      screen.getByText(
        /valor positivo significa que a alocação está abaixo da meta/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/sem classe não entram nas linhas acima/),
    ).toBeTruthy();
    expect(
      screen.getByText(/sem valor atual não entram no cálculo/),
    ).toBeTruthy();
    expect(screen.getByText(/não são recomendações universais/)).toBeTruthy();
  });

  it("requires the edited target percentages to total exactly 100%", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <PortfolioAllocationTargets
        positions={positions}
        targetPercentages={{}}
        saving={false}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Definir metas" }));
    await user.clear(
      screen.getByRole("spinbutton", { name: "Meta de Renda fixa" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "Meta de Renda fixa" }),
      "99",
    );
    await user.click(screen.getByRole("button", { name: "Salvar metas" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Use percentuais entre 0 e 100, com até duas casas decimais, somando 100%.",
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves all configured classes and returns to the comparison", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <PortfolioAllocationTargets
        positions={positions}
        targetPercentages={{}}
        saving={false}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Definir metas" }));
    await user.clear(
      screen.getByRole("spinbutton", { name: "Meta de Renda fixa" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "Meta de Renda fixa" }),
      "60",
    );
    await user.clear(
      screen.getByRole("spinbutton", { name: "Meta de Fundos" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "Meta de Fundos" }),
      "40",
    );
    await user.click(screen.getByRole("button", { name: "Salvar metas" }));

    expect(onSave).toHaveBeenCalledWith({
      "Renda fixa": 60,
      "Renda variável": 0,
      Fundos: 40,
      Criptoativos: 0,
      Imóveis: 0,
      Outros: 0,
    });
    expect(screen.queryByRole("button", { name: "Salvar metas" })).toBeNull();
  });

  it("shows unavailable current values for saved targets without portfolio positions", () => {
    render(
      <PortfolioAllocationTargets
        positions={[]}
        targetPercentages={savedTargets}
        saving={false}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getAllByText("—")).toHaveLength(12);
    expect(
      screen.getByText(
        "Não há valores atuais disponíveis para comparar com as metas.",
      ),
    ).toBeTruthy();
  });

  it("rejects percentages with more than two decimal places", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PortfolioAllocationTargets
        positions={[]}
        targetPercentages={{}}
        saving={false}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Definir metas" }));
    await user.clear(
      screen.getByRole("spinbutton", { name: "Meta de Renda fixa" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "Meta de Renda fixa" }),
      "50.001",
    );
    await user.clear(
      screen.getByRole("spinbutton", { name: "Meta de Renda variável" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "Meta de Renda variável" }),
      "49.999",
    );
    const fixedInput = screen.getByRole("spinbutton", {
      name: "Meta de Renda fixa",
    }) as HTMLInputElement;
    expect(fixedInput.validity.stepMismatch).toBe(true);
    await user.click(screen.getByRole("button", { name: "Salvar metas" }));
    expect(onSave).not.toHaveBeenCalled();
  });
  it("shows zero for classes omitted from a saved partial target object", () => {
    render(
      <PortfolioAllocationTargets
        positions={positions}
        targetPercentages={{ "Renda fixa": 100 }}
        saving={false}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getAllByText("0.0%")).toHaveLength(9);
  });

  it("keeps the editor open when the save callback rejects the update", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(false);
    render(
      <PortfolioAllocationTargets
        positions={positions}
        targetPercentages={{}}
        saving={false}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Definir metas" }));
    await user.clear(
      screen.getByRole("spinbutton", { name: "Meta de Renda fixa" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "Meta de Renda fixa" }),
      "100",
    );
    await user.click(screen.getByRole("button", { name: "Salvar metas" }));

    expect(onSave).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Salvar metas" })).toBeTruthy();
  });

  it("disables the editor and labels a pending save", async () => {
    const user = userEvent.setup();
    const props = {
      positions,
      targetPercentages: {},
      saving: false,
      onSave: vi.fn(),
    };
    const { rerender } = render(<PortfolioAllocationTargets {...props} />);
    await user.click(screen.getByRole("button", { name: "Definir metas" }));

    rerender(<PortfolioAllocationTargets {...props} saving />);
    expect(
      screen
        .getByRole("button", { name: "Salvando…" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it("allows cancelling without saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PortfolioAllocationTargets
        positions={positions}
        targetPercentages={{}}
        saving={false}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Definir metas" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Ainda não há metas salvas/)).toBeTruthy();
  });
});
