// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioObjectives } from "@/app/portfolio/_components/portfolio-objectives";
import type { ObjectivePosition } from "@/app/portfolio/_components/portfolio-objective-assignment";
import type { PortfolioObjective } from "@/app/portfolio/_components/portfolio-objective-card";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/app/portfolio/_components/emergency-reserve-editor", () => ({
  EmergencyReserveEditor: () => (
    <div>
      <div>Editor da reserva existente</div>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("portfolio:updated"))}
      >
        Salvar reserva (mock)
      </button>
    </div>
  ),
}));
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  ),
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));
vi.mock("recharts", () => ({
  Cell: () => null,
  Pie: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  PieChart: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

function objective(
  overrides: Partial<PortfolioObjective> &
    Pick<PortfolioObjective, "id" | "kind" | "name">,
): PortfolioObjective {
  return {
    targetAmount: 1000,
    monthlyPlannedAmount: null,
    currentValue: 400,
    knownValue: 400,
    remainingAmount: 600,
    progressPercent: 40,
    assignedPositionCount: 1,
    missingPositionCount: 0,
    unvaluedPositionCount: 0,
    assignedAssetKeys: [],
    canEditAssignments: true,
    ...overrides,
  };
}

const reserveKey = "v1:reserve";
const freeKey = "v1:free";
const baseData = {
  objectives: [
    objective({
      id: reserveObjectiveId,
      kind: "RESERVE",
      name: "Reserva",
      targetAmount: 1000,
      currentValue: 400,
      knownValue: 400,
      remainingAmount: 600,
      progressPercent: 40,
      assignedAssetKeys: [reserveKey],
      canEditAssignments: false,
    }),
    objective({
      id: "objective-trip",
      kind: "CUSTOM",
      name: "Viagem",
      targetAmount: 2000,
      currentValue: 0,
      knownValue: 0,
      remainingAmount: 2000,
      progressPercent: 0,
      monthlyPlannedAmount: 100,
      canEditAssignments: true,
    }),
  ],
  positions: [
    {
      assetKey: reserveKey,
      product: "CDB reserva",
      assetCode: "CDB1",
      institution: "Banco A",
      assetClass: "Renda fixa",
      positionCount: 1,
      value: 400,
      unvaluedPositions: 0,
      objectiveId: reserveObjectiveId,
      objectiveName: "Reserva",
    },
    {
      assetKey: freeKey,
      product: "Tesouro Selic",
      assetCode: "LFT",
      institution: "Custódia",
      assetClass: "Renda fixa",
      positionCount: 1,
      value: 250,
      unvaluedPositions: 0,
      objectiveId: null,
      objectiveName: null,
    },
  ] satisfies ObjectivePosition[],
  unassignedKnownValue: 250,
  unassignedPositionCount: 1,
  unassignedUnvaluedPositionCount: 0,
  destinationSummary: {
    categories: [
      { key: "reserve" as const, value: 400, percentage: 61.5 },
      { key: "personal" as const, value: 0, percentage: 0 },
      { key: "long_term" as const, value: 0, percentage: 0 },
      { key: "purpose_unknown" as const, value: 0, percentage: 0 },
      { key: "unassigned" as const, value: 250, percentage: 38.5 },
    ],
    knownTotal: 650,
    missingPositionCount: 0,
    unvaluedPositionCount: 0,
  },
};

let fetchMock: ReturnType<typeof vi.fn>;
let currentData: typeof baseData;

function response(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

describe("PortfolioObjectives", () => {
  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
    for (const method of [
      "hasPointerCapture",
      "setPointerCapture",
      "releasePointerCapture",
      "scrollIntoView",
    ]) {
      Object.defineProperty(HTMLElement.prototype, method, {
        configurable: true,
        value: () => false,
      });
    }
    currentData = structuredClone(baseData);
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/portfolio/objectives/suggestions") {
        return response({
          status: "suggestions",
          kind: "exact",
          candidates: [{ assetKeys: [freeKey], total: 250, difference: 0 }],
        });
      }
      if (url === "/api/portfolio/objectives/allocation/preview") {
        return response({
          valuationDate: "2026-10-01",
          effectiveValuationDates: ["2026-10-01"],
          optimal: true,
          exploredStates: 10,
          stateLimit: 1000,
          canConfirm: true,
          allocation: { [reserveKey]: reserveObjectiveId, [freeKey]: null },
          expectedOwners: {
            [reserveKey]: reserveObjectiveId,
            [freeKey]: null,
          },
          objectives: [
            {
              objectiveId: reserveObjectiveId,
              name: "Reserva",
              observedBalanceCents: "1000",
              proposedValueCents: "40000",
              differenceCents: "39000",
              assetKeys: [reserveKey],
            },
          ],
          transfers: [],
          unassignedPositions: [
            {
              assetKey: freeKey,
              product: "Tesouro Selic",
              valueCents: "25000",
            },
          ],
          limitations: [],
        });
      }
      if (url === "/api/portfolio/objectives/allocation/confirm") {
        return response({ message: "Distribuição confirmada." });
      }
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        const created = objective({
          id: "objective-new",
          kind: "CUSTOM",
          name: body.name,
          purpose: body.purpose,
          targetAmount: body.targetAmount,
          currentValue: 0,
          knownValue: 0,
          remainingAmount: body.targetAmount,
          progressPercent: 0,
          monthlyPlannedAmount: body.monthlyPlannedAmount,
        });
        currentData = {
          ...currentData,
          objectives: [...currentData.objectives, created],
        };
        return response(created);
      }
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        currentData = {
          ...currentData,
          objectives: currentData.objectives.map((item) =>
            item.id === body.objectiveId
              ? { ...item, ...body, currentValue: item.currentValue }
              : item,
          ),
        };
        return response({ id: body.objectiveId });
      }
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        currentData = {
          ...currentData,
          objectives: currentData.objectives.map((item) =>
            item.id === body.objectiveId
              ? { ...item, assignedAssetKeys: body.assetKeys }
              : item,
          ),
          positions: currentData.positions.map((position) =>
            position.assetKey === freeKey
              ? {
                  ...position,
                  objectiveId: body.objectiveId,
                  objectiveName: "Viagem",
                }
              : position,
          ),
        };
        return response({ message: "saved" });
      }
      if (init?.method === "DELETE") {
        const objectiveId = new URL(
          String(url),
          "http://localhost",
        ).searchParams.get("objectiveId");
        currentData = {
          ...currentData,
          objectives: currentData.objectives.filter(
            (item) => item.id !== objectiveId,
          ),
        };
        return response({ message: "deleted" });
      }
      return response(currentData);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    for (const method of [
      "hasPointerCapture",
      "setPointerCapture",
      "releasePointerCapture",
      "scrollIntoView",
    ])
      Reflect.deleteProperty(HTMLElement.prototype, method);
  });

  it.each([
    ["reserve", null, "Configurar reserva", "Reserva"],
    ["objective-trip", null, "Gerenciar posições", "Viagem"],
  ])(
    "opens the deep-linked objective %s",
    async (objectiveId, routeScreen, action, heading) => {
      vi.stubGlobal("fetch", fetchMock);
      const navigation = { open: true, objectiveId, screen: routeScreen };

      render(
        <PortfolioObjectives
          navigation={navigation}
          onNavigationChange={vi.fn()}
        />,
      );

      expect(
        await screen.findByRole("heading", { name: heading }),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: action })).toBeTruthy();
    },
  );

  it("opens reserve settings directly from its deep link", async () => {
    vi.stubGlobal("fetch", fetchMock);
    render(
      <PortfolioObjectives
        navigation={{
          open: true,
          objectiveId: "reserve",
          screen: "reserve-settings",
        }}
        onNavigationChange={vi.fn()}
      />,
    );

    expect(await screen.findByText("Editor da reserva existente")).toBeTruthy();
  });

  it("returns to the objectives overview when the panel route closes", async () => {
    vi.stubGlobal("fetch", fetchMock);
    const result = render(
      <PortfolioObjectives
        navigation={{ open: true, objectiveId: "reserve", screen: null }}
        onNavigationChange={vi.fn()}
      />,
    );
    await screen.findByRole("heading", { name: "Reserva" });

    result.rerender(
      <PortfolioObjectives
        navigation={{ open: false, objectiveId: null, screen: null }}
        onNavigationChange={vi.fn()}
      />,
    );

    expect(await screen.findByText("Patrimônio por destino")).toBeTruthy();
  });

  it("opens on an answer-first overview and mounts no editing forms until requested", async () => {
    render(<PortfolioObjectives />);
    expect(await screen.findByText("Patrimônio por destino")).toBeTruthy();
    expect(screen.getByText("R$ 650,00")).toBeTruthy();
    expect(screen.queryByLabelText("Nome do objetivo")).toBeNull();
    expect(
      screen.queryByLabelText("Objetivo para associar posições"),
    ).toBeNull();
    expect(
      screen.getByRole("img", {
        name: "Gráfico de rosca dos valores conhecidos por destino",
      }),
    ).toBeTruthy();
    expect(screen.getByText("61,5%")).toBeTruthy();
    expect(screen.getByText("38,5%")).toBeTruthy();
  });

  it("opens the joint organizer from the objectives overview and returns without changing assignments", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(
      screen.getByRole("button", { name: "Organizar objetivos" }),
    );
    expect(await screen.findByText("Saldos observados no banco")).toBeTruthy();
    expect(screen.getByLabelText("Reserva")).toBeTruthy();
    expect(screen.getByLabelText("Viagem")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getAllByRole("button", { name: "Voltar" })[1]);
    expect(await screen.findByText("Patrimônio por destino")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns to the overview after confirming an organized distribution", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(
      screen.getByRole("button", { name: "Organizar objetivos" }),
    );
    await user.type(screen.getByLabelText("Reserva"), "1000");
    await user.click(
      screen.getByRole("button", { name: "Buscar distribuição" }),
    );
    await screen.findByText("Revise a distribuição");
    await user.click(
      screen.getByRole("button", { name: "Confirmar distribuição" }),
    );
    expect(await screen.findByText("Patrimônio por destino")).toBeTruthy();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Distribuição confirmada."),
    );
  });

  it("creates an objective only from the requested form and opens its detail", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(screen.getByRole("button", { name: "Novo objetivo" }));
    expect(screen.getByRole("heading", { name: "Novo objetivo" })).toBeTruthy();
    await user.type(screen.getByLabelText("Nome do objetivo"), "Carro");
    await user.click(
      screen.getByRole("combobox", { name: "Finalidade deste destino" }),
    );
    await user.click(screen.getByRole("option", { name: "Objetivo pessoal" }));
    fireEvent.change(screen.getByLabelText("Meta em reais (opcional)"), {
      target: { value: "R$ 12.500,00" },
    });
    await user.click(screen.getByRole("button", { name: "Criar objetivo" }));
    expect(await screen.findByRole("heading", { name: "Carro" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Gerenciar posições" }),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/portfolio/objectives",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Carro",
          purpose: "PERSONAL_GOAL",
          targetAmount: 12500,
          monthlyPlannedAmount: null,
        }),
      }),
    );
  });

  it("separates objective detail, edit, and assignment views", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(
      screen.getByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    expect(screen.getByRole("heading", { name: "Viagem" })).toBeTruthy();
    expect(screen.queryByLabelText("Nome do objetivo")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Editar objetivo" }));
    expect(
      screen.getByRole("heading", { name: "Editar objetivo" }),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Nome do objetivo") as HTMLInputElement).value,
    ).toBe("Viagem");
    fireEvent.change(screen.getByLabelText("Meta em reais (opcional)"), {
      target: { value: "R$ 20.000,00" },
    });
    await user.click(screen.getByRole("button", { name: "Salvar objetivo" }));
    expect(await screen.findByRole("heading", { name: "Viagem" })).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "Editar objetivo" }));
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByRole("heading", { name: "Viagem" })).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Gerenciar posições" }),
    );
    expect(
      screen.getByRole("heading", { name: "Gerenciar posições" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Posições do objetivo" }),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Objetivo para associar posições"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("img", {
        name: "Gráfico de rosca dos valores conhecidos por destino",
      }),
    ).toBeNull();
  });

  it("returns from an objective detail to the overview", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(
      screen.getByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByText("Patrimônio por destino")).toBeTruthy();
  });

  it("returns a canceled create to the overview and can edit from objective actions", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");

    await user.click(screen.getByRole("button", { name: "Novo objetivo" }));
    expect(screen.getByRole("heading", { name: "Novo objetivo" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByText("Patrimônio por destino")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: /A.*es do objetivo Viagem/ }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Editar objetivo" }),
    );
    expect(
      screen.getByRole("heading", { name: "Editar objetivo" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("Patrimônio por destino")).toBeTruthy();
  });

  it("returns from position management to the selected objective", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(
      screen.getByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    await user.click(
      screen.getByRole("button", { name: /Gerenciar posições/ }),
    );
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByRole("heading", { name: "Viagem" })).toBeTruthy();
  });

  it("routes the Reserve detail to the existing reserve editor", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(
      screen.getByRole("button", { name: "Abrir objetivo Reserva" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Configurar reserva" }),
    );
    expect(screen.getByText("Editor da reserva existente")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Configurar reserva" }),
    ).toBeTruthy();
    currentData.objectives[0] = {
      ...currentData.objectives[0],
      targetAmount: 2000,
      remainingAmount: 1600,
      progressPercent: 20,
    };
    await user.click(
      screen.getByRole("button", { name: "Salvar reserva (mock)" }),
    );
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByRole("heading", { name: "Reserva" })).toBeTruthy();
    expect(await screen.findByText("R$ 2.000,00")).toBeTruthy();
    expect(
      screen.getByRole("progressbar", { name: "Progresso de Reserva: 20%" }),
    ).toBeTruthy();
  });

  it("searches unassigned position combinations, previews selection, then saves from assignment view", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(
      screen.getByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Gerenciar posições" }),
    );
    await user.click(
      screen.getByRole("button", { name: /Buscar uma combina/ }),
    );
    fireEvent.change(
      screen.getByLabelText("Saldo atual do objetivo no banco"),
      {
        target: { value: "R$ 250,00" },
      },
    );
    await user.click(
      screen.getByRole("button", { name: "Buscar combinações" }),
    );
    await screen.findByText(/Combinação exata encontrada/);
    await user.click(screen.getByRole("button", { name: "Pré-selecionar 1" }));
    expect(
      screen.getByText(
        "Pré-selecionar substitui a seleção atual nesta revisão; nada muda até Salvar posições. O filtro apenas limita a busca.",
      ),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
    ).toBe(false);
    await user.click(screen.getByRole("button", { name: "Salvar posições" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/portfolio/objectives",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            objectiveId: "objective-trip",
            assetKeys: [freeKey],
            transfers: [],
          }),
        }),
      ),
    );
    expect(await screen.findByRole("heading", { name: "Viagem" })).toBeTruthy();
  });

  it.each([
    { count: 1, message: "1 posição foi transferida para Viagem." },
    { count: 2, message: "2 posições foram transferidas para Viagem." },
  ])(
    "confirms and reports objective transfers ($count)",
    async ({ count, message }) => {
      const user = userEvent.setup();
      const transferKeys = Array.from(
        { length: count },
        (_, index) => `v1:transfer-${index}`,
      );
      const sourceId = "objective-home";
      currentData = {
        ...currentData,
        objectives: [
          ...currentData.objectives,
          objective({
            id: sourceId,
            kind: "CUSTOM",
            name: "Casa",
            currentValue: 100,
            knownValue: 100,
            assignedAssetKeys: transferKeys,
          }),
        ],
        positions: [
          ...currentData.positions,
          ...transferKeys.map((assetKey, index) => ({
            assetKey,
            product: `CDB da Casa ${index + 1}`,
            assetCode: `CASA${index + 1}`,
            institution: "Banco A",
            assetClass: "Renda fixa",
            positionCount: 1,
            value: 100 / count,
            unvaluedPositions: 0,
            objectiveId: sourceId,
            objectiveName: "Casa",
          })),
        ],
      };
      render(<PortfolioObjectives />);
      await screen.findByText("Patrimônio por destino");
      await user.click(
        screen.getByRole("button", { name: "Abrir objetivo Viagem" }),
      );
      await user.click(
        screen.getByRole("button", { name: /Gerenciar posições/ }),
      );
      await user.click(
        screen.getByRole("button", { name: /Buscar uma combinação/ }),
      );
      fireEvent.change(
        screen.getByLabelText("Saldo atual do objetivo no banco"),
        {
          target: { value: "R$ 100,00" },
        },
      );
      fetchMock.mockImplementationOnce(() =>
        response({
          status: "suggestions",
          kind: "exact",
          valuationDate: "2026-09-30",
          candidates: [
            {
              assetKeys: transferKeys,
              total: 100,
              difference: 0,
              positions: transferKeys.map((assetKey, index) => ({
                assetKey,
                product: `CDB da Casa ${index + 1}`,
                institution: "Banco A",
                value: 100 / count,
              })),
              transfers: transferKeys.map((assetKey, index) => ({
                assetKey,
                product: `CDB da Casa ${index + 1}`,
                value: 100 / count,
                fromObjectiveId: sourceId,
                fromObjectiveName: "Casa",
                toObjectiveId: "objective-trip",
              })),
              impacts: [],
            },
          ],
          searchLimited: false,
          alternativesLimited: false,
        }),
      );
      await user.click(
        screen.getByRole("button", { name: "Buscar combinações" }),
      );
      await screen.findByText(/Data informada: 30\/09\/2026/);
      await user.click(
        screen.getByRole("button", { name: `Ver ${count} posições` }),
      );
      await user.click(
        screen.getByRole("button", { name: "Usar e transferir" }),
      );
      const transferDialog = await screen.findByRole("alertdialog");
      await user.click(
        within(transferDialog).getByRole("button", {
          name: "Usar e transferir",
        }),
      );
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith(message));
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
      ).toBe(true);
    },
  );

  it("deletes a personal objective through its actions menu and keeps the position in the portfolio", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(
      screen.getByRole("button", { name: "Ações do objetivo Viagem" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Excluir objetivo" }),
    );
    expect(await screen.findByText(/As posições serão mantidas/)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/portfolio/objectives?objectiveId=objective-trip",
        { method: "DELETE" },
      ),
    );
    expect(
      currentData.positions.some((position) => position.assetKey === freeKey),
    ).toBe(true);
    expect(
      currentData.objectives.some((item) => item.id === "objective-trip"),
    ).toBe(false);
  });

  it("shows a form error when objective creation fails with a transport value", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(screen.getByRole("button", { name: "Novo objetivo" }));
    await user.type(screen.getByLabelText("Nome do objetivo"), "Casa");
    await user.click(
      screen.getByRole("combobox", { name: "Finalidade deste destino" }),
    );
    await user.click(screen.getByRole("option", { name: "Objetivo pessoal" }));
    fireEvent.change(screen.getByLabelText("Meta em reais (opcional)"), {
      target: { value: "R$ 100.000,00" },
    });
    fetchMock.mockRejectedValueOnce("offline");
    await user.click(screen.getByRole("button", { name: "Criar objetivo" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar o objetivo.",
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the create form open when a successful response has no objective id", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(screen.getByRole("button", { name: "Novo objetivo" }));
    await user.type(screen.getByLabelText("Nome do objetivo"), "Casa");
    await user.click(
      screen.getByRole("combobox", { name: "Finalidade deste destino" }),
    );
    await user.click(screen.getByRole("option", { name: "Objetivo pessoal" }));
    fireEvent.change(screen.getByLabelText("Meta em reais (opcional)"), {
      target: { value: "R$ 100.000,00" },
    });
    fetchMock.mockResolvedValueOnce(response({ message: "Objetivo criado." }));
    fetchMock.mockResolvedValueOnce(response(currentData));

    await user.click(screen.getByRole("button", { name: "Criar objetivo" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Objetivo criado."),
    );
    expect(await screen.findByLabelText("Nome do objetivo")).toBeTruthy();
  });

  it("shows an assignment error when saving fails with a transport value", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(
      screen.getByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    await user.click(
      screen.getByRole("button", { name: /Gerenciar posições/ }),
    );
    fetchMock.mockRejectedValueOnce("offline");
    await user.click(screen.getByRole("button", { name: /Salvar posições/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar as posições.",
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("can cancel deleting a personal objective without issuing a request", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(
      screen.getByRole("button", { name: /A.*es do objetivo Viagem/ }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Excluir objetivo" }),
    );
    expect(await screen.findByText("Excluir Viagem?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText("Excluir Viagem?")).toBeNull();
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false);
  });

  it("shows a fallback toast when deleting an objective fails due to transport", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    fetchMock.mockRejectedValueOnce("offline");
    await user.click(
      screen.getByRole("button", { name: "Ações do objetivo Viagem" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Excluir objetivo" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível excluir o objetivo.",
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the server error when an objective delete is rejected", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    fetchMock.mockImplementationOnce(() =>
      response({ message: "A posição ainda está vinculada." }, false),
    );
    await user.click(
      screen.getByRole("button", { name: /A.*es do objetivo Viagem/ }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Excluir objetivo" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "A posição ainda está vinculada.",
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an unavailable state when the selected objective disappears", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(
      screen.getByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    currentData = {
      ...currentData,
      objectives: currentData.objectives.filter(
        (item) => item.id !== "objective-trip",
      ),
    };
    window.dispatchEvent(new Event("portfolio:updated"));
    expect(
      await screen.findByText("Este objetivo não está mais disponível."),
    ).toBeTruthy();
  });

  it("saves a manual observed balance and reloads the objective overview", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(
      screen.getByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    await user.type(
      await screen.findByLabelText("Saldo observado de Viagem"),
      "350,25",
    );
    fetchMock.mockImplementationOnce(() =>
      response({ message: "Saldo observado salvo." }),
    );
    await user.click(
      screen.getByRole("button", { name: "Salvar saldo observado" }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Saldo observado salvo."),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/portfolio/objectives/balance",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"amount":"350.25"'),
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shows the API message when saving a manual observed balance fails", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(
      screen.getByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    await user.type(
      await screen.findByLabelText("Saldo observado de Viagem"),
      "350,25",
    );
    fetchMock.mockImplementationOnce(() =>
      response({ message: "Data-base inválida." }, false),
    );
    await user.click(
      screen.getByRole("button", { name: "Salvar saldo observado" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Data-base inválida."),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a safe fallback when saving an observed balance fails in transport", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(
      screen.getByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    await user.type(
      await screen.findByLabelText("Saldo observado de Viagem"),
      "350,25",
    );
    fetchMock.mockRejectedValueOnce(new Error("private transport detail"));
    await user.click(
      screen.getByRole("button", { name: "Salvar saldo observado" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar o saldo.",
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows the API message when loading the overview returns an error", async () => {
    fetchMock.mockImplementationOnce(() =>
      response({ message: "Carteira indisponível." }, false),
    );
    render(<PortfolioObjectives />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Carteira indisponível.",
    );
  });

  it("shows an API error toast when creating an objective fails", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(screen.getByRole("button", { name: "Novo objetivo" }));
    await user.type(screen.getByLabelText("Nome do objetivo"), "Casa");
    await user.click(
      screen.getByRole("combobox", { name: "Finalidade deste destino" }),
    );
    await user.click(screen.getByRole("option", { name: "Objetivo pessoal" }));
    fireEvent.change(screen.getByLabelText("Meta em reais (opcional)"), {
      target: { value: "R$ 100.000,00" },
    });
    fetchMock.mockImplementationOnce(() =>
      response({ message: "Meta inválida no servidor." }, false),
    );
    await user.click(screen.getByRole("button", { name: "Criar objetivo" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Meta inválida no servidor."),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an API message when saving objective positions fails", async () => {
    const user = userEvent.setup();
    render(<PortfolioObjectives />);
    await screen.findByText("Patrimônio por destino");
    await user.click(
      screen.getByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    await user.click(
      screen.getByRole("button", { name: /Gerenciar posições/ }),
    );
    fetchMock.mockImplementationOnce(() =>
      response({ message: "As posições mudaram." }, false),
    );
    await user.click(screen.getByRole("button", { name: /Salvar posições/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("As posições mudaram."),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows retry after an initial load failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    render(<PortfolioObjectives />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar seus objetivos e posições.",
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Patrimônio por destino")).toBeTruthy();
  });
});
