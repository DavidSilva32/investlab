// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioObjectiveAssignment } from "@/app/portfolio/_components/portfolio-objective-assignment";
import type { PortfolioObjective } from "@/app/portfolio/_components/portfolio-objective-card";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

const goals: PortfolioObjective[] = [
  {
    id: reserveObjectiveId,
    kind: "RESERVE",
    name: "Reserva",
    targetAmount: 1000,
    monthlyPlannedAmount: null,
    currentValue: 0,
    knownValue: 0,
    remainingAmount: 1000,
    progressPercent: 0,
    assignedPositionCount: 0,
    missingPositionCount: 0,
    unvaluedPositionCount: 0,
    assignedAssetKeys: [],
    canEditAssignments: false,
  },
  {
    id: "trip",
    kind: "CUSTOM",
    name: "Viagem",
    targetAmount: 10000,
    monthlyPlannedAmount: null,
    currentValue: 0,
    knownValue: 0,
    remainingAmount: 10000,
    progressPercent: 0,
    assignedPositionCount: 0,
    missingPositionCount: 0,
    unvaluedPositionCount: 0,
    assignedAssetKeys: ["previously-selected"],
    canEditAssignments: true,
  },
];
const positions = [
  {
    assetKey: "cdb-free",
    product: "CDB",
    assetCode: "CDB1",
    institution: "Banco",
    assetClass: "Renda fixa",
    positionCount: 1,
    value: 100,
    unvaluedPositions: 0,
    objectiveId: null,
    objectiveName: null,
  },
  {
    assetKey: "equity-free",
    product: "Ação",
    assetCode: "ABCD3",
    institution: "B3",
    assetClass: "Renda variável",
    positionCount: 1,
    value: 200,
    unvaluedPositions: 0,
    objectiveId: null,
    objectiveName: null,
  },
  {
    assetKey: "already-used",
    product: "CDB reservado",
    assetCode: "CDB2",
    institution: "Banco",
    assetClass: "Renda fixa",
    positionCount: 1,
    value: 300,
    unvaluedPositions: 0,
    objectiveId: reserveObjectiveId,
    objectiveName: "Reserva",
  },
  {
    assetKey: "previously-selected",
    product: "CDB já vinculado à Viagem",
    assetCode: "CDB0",
    institution: "Banco",
    assetClass: "Renda fixa",
    positionCount: 1,
    value: 50,
    unvaluedPositions: 0,
    objectiveId: "trip",
    objectiveName: "Viagem",
  },
  {
    assetKey: "stale-goal-assignment",
    product: "Ativo associado a objetivo removido",
    assetCode: null,
    institution: null,
    assetClass: null,
    positionCount: 1,
    value: 75,
    unvaluedPositions: 0,
    objectiveId: "deleted-goal",
    objectiveName: null,
  },
];

function render(ui: ReactElement) {
  const result = rtlRender(ui);
  const finder = result.queryByRole("button", {
    name: /Buscar uma combinação pelo valor/,
  });
  if (finder) fireEvent.click(finder);
  const positionList = result.queryByRole("button", {
    name: /Ver \d+ posições/,
  });
  if (positionList) fireEvent.click(positionList);
  return result;
}

describe("PortfolioObjectiveAssignment", () => {
  beforeEach(() => {
    for (const method of [
      "hasPointerCapture",
      "setPointerCapture",
      "releasePointerCapture",
      "scrollIntoView",
    ])
      Object.defineProperty(HTMLElement.prototype, method, {
        configurable: true,
        value: () => false,
      });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps suggestions local until explicit save and does not offer positions owned by another goal", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "suggestions",
        kind: "exact",
        candidates: [{ assetKeys: ["cdb-free"], total: 100, difference: 0 }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <PortfolioObjectiveAssignment
        objectives={goals}
        positions={positions}
        preferredObjectiveId="trip"
        saving={false}
        error={null}
        onSave={onSave}
      />,
    );
    expect(
      screen
        .getByRole("checkbox", { name: /CDB reservado/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Valor desejado"), {
      target: { value: "R$ 100,00" },
    });
    await user.click(
      screen.getByRole("button", { name: "Buscar combinações" }),
    );
    await screen.findByText(/Combinação exata encontrada/);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/portfolio/objectives/suggestions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ targetAmount: 100, instrumentType: "ALL" }),
      }),
    );
    await user.click(screen.getByRole("button", { name: "Ver 1 posições" }));
    await user.click(screen.getByRole("button", { name: "Pré-selecionar 1" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Pré-selecionar substitui a seleção atual nesta revisão; nada muda até Salvar posições. O filtro apenas limita a busca.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("checkbox", { name: /CDB já vinculado à Viagem/ })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen
        .getByRole("checkbox", { name: /Associar CDB a Viagem/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
    await user.click(screen.getByRole("button", { name: "Salvar posições" }));
    expect(onSave).toHaveBeenCalledWith("trip", ["cdb-free"]);
  });

  it("sends the instrument filter only as a search parameter and reports an invalid target", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <PortfolioObjectiveAssignment
        objectives={goals}
        positions={positions}
        preferredObjectiveId="trip"
        saving={false}
        error={null}
        onSave={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Buscar combinações" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Informe um valor maior que zero para comparar as posições.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Valor desejado"), {
      target: { value: "R$ 100,00" },
    });
    await user.click(
      screen.getByRole("combobox", { name: "Filtrar por instrumento" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Somente CDB identificado" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Buscar combinações" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/portfolio/objectives/suggestions",
      expect.objectContaining({
        body: JSON.stringify({ targetAmount: 100, instrumentType: "CDB" }),
      }),
    );
  });

  it("toggles candidate positions in the pending selection before saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PortfolioObjectiveAssignment
        objectives={goals}
        positions={positions}
        preferredObjectiveId="trip"
        saving={false}
        error={null}
        onSave={onSave}
      />,
    );

    const available = screen.getByRole("checkbox", {
      name: "Associar CDB a Viagem",
    });
    const alreadySelected = screen.getByRole("checkbox", {
      name: /CDB j.*vinculado.*Viagem/,
    });
    await user.click(available);
    await user.click(alreadySelected);
    expect(available.getAttribute("aria-checked")).toBe("true");
    expect(alreadySelected.getAttribute("aria-checked")).toBe("false");
    await user.click(screen.getByRole("button", { name: /Salvar posições/ }));
    expect(onSave).toHaveBeenCalledWith("trip", ["cdb-free"]);
  });

  it("switches objective selection and uses Reserve's existing configuration", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioObjectiveAssignment
        objectives={goals}
        positions={positions}
        preferredObjectiveId="trip"
        saving={false}
        error={null}
        onSave={vi.fn()}
      />,
    );

    const selector = screen.getByRole("combobox", {
      name: /Objetivo para associar/,
    });
    await user.click(selector);
    await user.click(await screen.findByRole("option", { name: "Reserva" }));
    expect(
      screen.getByText(
        /A Reserva usa a seleção e as regras próprias existentes/,
      ),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("combobox", { name: /Objetivo para associar/ }),
    );
    await user.click(await screen.findByRole("option", { name: "Viagem" }));
    await user.click(screen.getByRole("button", { name: "Ver 5 posições" }));
    expect(
      screen
        .getByRole("checkbox", { name: /CDB j.*vinculado.*Viagem/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("shows incomplete position values, grouped lots and a save error", () => {
    render(
      <PortfolioObjectiveAssignment
        objectives={goals}
        positions={[
          {
            ...positions[0],
            assetKey: "incomplete-group",
            product: "CDB com lotes sem valor",
            value: null,
            positionCount: 2,
            unvaluedPositions: 1,
            objectiveId: null,
            objectiveName: null,
          },
        ]}
        preferredObjectiveId="trip"
        saving={false}
        error="Não foi possível salvar as posições."
        onSave={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "Valor indisponível · 2 posições agrupadas · 1 sem valor",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "Não foi possível salvar as posições.",
    );
  });

  it("guides the user to import when no current portfolio positions exist", () => {
    render(
      <PortfolioObjectiveAssignment
        objectives={goals}
        positions={[]}
        preferredObjectiveId="trip"
        saving={false}
        error={null}
        onSave={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Ainda não há posições para associar"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Importar posições" })
        .getAttribute("href"),
    ).toBe("/imports");
  });

  it("keeps the import path available when objectives and positions are empty", () => {
    render(
      <PortfolioObjectiveAssignment
        objectives={[]}
        positions={[]}
        saving={false}
        error={null}
        onSave={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Ainda não há posições para associar"),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Importar posições" }),
    ).toBeTruthy();
  });

  it("explains when positions exist but no objective is available", () => {
    render(
      <PortfolioObjectiveAssignment
        objectives={[]}
        positions={positions}
        saving={false}
        error={null}
        onSave={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "Nenhum objetivo está disponível para associar posições.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("defaults to an editable goal when the preferred objective is Reserve", () => {
    render(
      <PortfolioObjectiveAssignment
        objectives={goals}
        positions={positions}
        preferredObjectiveId={reserveObjectiveId}
        saving={false}
        error={null}
        onSave={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: "Associar CDB a Viagem" }),
    ).toBeTruthy();
  });

  it("falls back to the protected Reserve when no editable goal exists", () => {
    render(
      <PortfolioObjectiveAssignment
        objectives={[goals[0]]}
        positions={positions}
        saving={false}
        error={null}
        onSave={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        /A Reserva usa a seleção e as regras próprias existentes/,
      ),
    ).toBeTruthy();
  });

  it("discloses positions whose previous objective name is no longer available", () => {
    render(
      <PortfolioObjectiveAssignment
        objectives={goals}
        positions={positions}
        preferredObjectiveId="trip"
        saving={false}
        error={null}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText(/Já vinculada a outro objetivo/)).toBeTruthy();
  });
});
