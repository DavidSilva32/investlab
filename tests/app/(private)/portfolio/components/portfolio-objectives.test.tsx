// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioObjectives } from "@/app/(private)/portfolio/_components/portfolio-objectives";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";
import { QueryClientWrapper } from "../../../../utils/query-client-wrapper";

vi.mock(
  "@/app/(private)/portfolio/_components/emergency-reserve-editor",
  () => ({
    EmergencyReserveEditor: () => <p>Editor de configuração da Reserva</p>,
  }),
);

const objective = {
  id: "00000000-0000-4000-8000-000000000001",
  kind: "CUSTOM",
  purpose: "PERSONAL_GOAL" as const,
  name: "Viagem",
  targetAmount: 16000,
  monthlyPlannedAmount: 2000,
  currentValue: 14200.99,
  remainingAmount: 1799.01,
  progressPercent: 88.75,
  balanceTracking: {
    observedAmountCents: "1420099",
    observedOn: "2026-11-14",
  },
};

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

describe("PortfolioObjectives", () => {
  it("loads observed balances and opens goal details without position management", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ objectives: [objective] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioObjectives />, { wrapper: QueryClientWrapper });

    expect(await screen.findByText("R$ 14.200,99")).toBeTruthy();
    expect(screen.getByText("Informado em 14/11/2026")).toBeTruthy();
    expect(
      screen.getByText(/A carteira B3 é calculada separadamente/u),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    expect(await screen.findByRole("heading", { name: "Viagem" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /gerenciar posições/i }),
    ).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/portfolio/objectives");
  });

  it("leaves an objective without an observation unvalued", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          objectives: [
            { ...objective, currentValue: null, balanceTracking: null },
          ],
        }),
      ),
    );
    render(<PortfolioObjectives />, { wrapper: QueryClientWrapper });
    expect(await screen.findByText("Saldo não informado")).toBeTruthy();
  });

  it("shows loading and a retryable load error", async () => {
    let release: ((response: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: "falha" }, { status: 500 }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioObjectives />, { wrapper: QueryClientWrapper });

    expect(
      screen.getByRole("status", { name: "Carregando objetivos" }),
    ).toBeTruthy();
    expect(await screen.findByRole("alert")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    release?.(Response.json({ objectives: [] }));
    expect(
      await screen.findByText(/Ainda não há objetivos\. Crie um/u),
    ).toBeTruthy();
  });

  it("creates an objective and navigates to its detail after a successful save", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ objectives: [] }))
      .mockResolvedValueOnce(Response.json({ id: objective.id }))
      .mockResolvedValueOnce(Response.json({ objectives: [objective] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onNavigationChange = vi.fn();
    render(<PortfolioObjectives onNavigationChange={onNavigationChange} />, {
      wrapper: QueryClientWrapper,
    });

    await user.click(
      await screen.findByRole("button", { name: "Novo objetivo" }),
    );
    await user.type(screen.getByLabelText("Nome do objetivo"), "Viagem");
    await user.click(
      screen.getByRole("combobox", { name: "Finalidade deste destino" }),
    );
    await user.click(screen.getByRole("option", { name: "Objetivo pessoal" }));
    await user.click(screen.getByRole("button", { name: "Criar objetivo" }));

    expect(await screen.findByRole("heading", { name: "Viagem" })).toBeTruthy();
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/portfolio/objectives");
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)),
    ).toMatchObject({
      name: "Viagem",
      purpose: "PERSONAL_GOAL",
    });
    expect(onNavigationChange).toHaveBeenCalledWith(objective.id, null);
  });

  it("keeps the form open when create fails and retries with the safe API message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ objectives: [] }))
      .mockResolvedValueOnce(
        Response.json(
          { message: "Não foi possível salvar agora." },
          { status: 400 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioObjectives />, { wrapper: QueryClientWrapper });

    await user.click(
      await screen.findByRole("button", { name: "Novo objetivo" }),
    );
    await user.type(screen.getByLabelText("Nome do objetivo"), "Viagem");
    await user.click(
      screen.getByRole("combobox", { name: "Finalidade deste destino" }),
    );
    await user.click(screen.getByRole("option", { name: "Objetivo pessoal" }));
    await user.click(screen.getByRole("button", { name: "Criar objetivo" }));

    expect(
      await screen.findByText("Defina os dados do novo objetivo."),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("updates the observed balance and refreshes objectives", async () => {
    const updated = {
      ...objective,
      currentValue: 15000,
      balanceTracking: {
        observedAmountCents: "1500000",
        observedOn: "2026-11-15",
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ objectives: [objective] }))
      .mockResolvedValueOnce(Response.json({ message: "Saldo atualizado." }))
      .mockResolvedValueOnce(Response.json({ objectives: [updated] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioObjectives />, { wrapper: QueryClientWrapper });

    await user.click(
      await screen.findByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    await user.clear(
      screen.getByRole("textbox", { name: "Saldo observado de Viagem" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Saldo observado de Viagem" }),
      "15000",
    );
    await user.click(screen.getByRole("button", { name: "Salvar saldo" }));

    expect(await screen.findByText("R$ 15.000,00")).toBeTruthy();
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/portfolio/objectives/balance",
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)),
    ).toMatchObject({
      objectiveId: objective.id,
      amount: "150.00",
    });
  });

  it("edits an objective from the overview and returns to the updated detail", async () => {
    const updated = { ...objective, name: "Férias" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ objectives: [objective] }))
      .mockResolvedValueOnce(Response.json({ message: "Objetivo atualizado." }))
      .mockResolvedValueOnce(Response.json({ objectives: [updated] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onNavigationChange = vi.fn();
    render(<PortfolioObjectives onNavigationChange={onNavigationChange} />, {
      wrapper: QueryClientWrapper,
    });

    await user.click(
      await screen.findByRole("button", { name: "Ações do objetivo Viagem" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar objetivo" }));
    await user.clear(screen.getByLabelText("Nome do objetivo"));
    await user.type(screen.getByLabelText("Nome do objetivo"), "Férias");
    await user.click(screen.getByRole("button", { name: "Salvar objetivo" }));

    expect(await screen.findByRole("heading", { name: "Férias" })).toBeTruthy();
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)),
    ).toMatchObject({
      objectiveId: objective.id,
      name: "Férias",
    });
    expect(onNavigationChange).toHaveBeenLastCalledWith(objective.id, null);
  });

  it("returns from edit to detail and from detail to overview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ objectives: [objective] })),
    );
    const user = userEvent.setup();
    render(<PortfolioObjectives />, { wrapper: QueryClientWrapper });

    await user.click(
      await screen.findByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    await user.click(screen.getByRole("button", { name: "Editar objetivo" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText("Saldo informado")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(await screen.findByText("Seus objetivos")).toBeTruthy();
  });

  it("cancels an edit started from the overview without entering detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ objectives: [objective] })),
    );
    const user = userEvent.setup();
    render(<PortfolioObjectives />, { wrapper: QueryClientWrapper });

    await user.click(
      await screen.findByRole("button", { name: "Ações do objetivo Viagem" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar objetivo" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText("Seus objetivos")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Viagem" })).toBeNull();
  });

  it("deletes an objective and refreshes the overview", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ objectives: [objective] }))
      .mockResolvedValueOnce(Response.json({ message: "Objetivo excluído." }))
      .mockResolvedValueOnce(Response.json({ objectives: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onNavigationChange = vi.fn();
    render(<PortfolioObjectives onNavigationChange={onNavigationChange} />, {
      wrapper: QueryClientWrapper,
    });

    await user.click(
      await screen.findByRole("button", { name: "Ações do objetivo Viagem" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Excluir objetivo" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );

    expect(
      await screen.findByText(/Ainda não há objetivos\. Crie um/u),
    ).toBeTruthy();
    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      encodeURIComponent(objective.id),
    );
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("DELETE");
    expect(onNavigationChange).toHaveBeenLastCalledWith(null, null);
  });

  it("closes a deletion confirmation without deleting the objective", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ objectives: [objective] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioObjectives />, { wrapper: QueryClientWrapper });

    await user.click(
      await screen.findByRole("button", { name: "Ações do objetivo Viagem" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Excluir objetivo" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      await screen.findByRole("button", { name: "Abrir objetivo Viagem" }),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("opens and closes reserve settings from navigation and detail controls", async () => {
    const reserve = {
      ...objective,
      id: reserveObjectiveId,
      kind: "RESERVE",
      name: "Reserva",
      purpose: "RESERVE" as const,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ objectives: [reserve] })),
    );
    const user = userEvent.setup();
    const onNavigationChange = vi.fn();
    const { rerender } = render(
      <PortfolioObjectives
        navigation={{ open: true, objectiveId: "reserve", screen: null }}
        onNavigationChange={onNavigationChange}
      />,
      { wrapper: QueryClientWrapper },
    );

    expect(
      await screen.findByRole("heading", { name: "Reserva" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Opções avançadas" }));
    await user.click(
      screen.getByRole("button", { name: "Editar despesas e meta" }),
    );
    expect(
      await screen.findByText("Editor de configuração da Reserva"),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(
      await screen.findByRole("heading", { name: "Reserva" }),
    ).toBeTruthy();
    expect(onNavigationChange).toHaveBeenLastCalledWith("reserve", null);

    rerender(
      <PortfolioObjectives
        navigation={{
          open: true,
          objectiveId: null,
          screen: "reserve-settings",
        }}
        onNavigationChange={onNavigationChange}
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "Editar reserva" }),
    ).toBeTruthy();
    expect(screen.getByText("Editor de configuração da Reserva")).toBeTruthy();
  });

  it("opens the overview when navigation closes and handles a removed objective", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ objectives: [] })),
    );
    const user = userEvent.setup();
    const { rerender } = render(
      <PortfolioObjectives
        navigation={{
          open: true,
          objectiveId: "missing-objective",
          screen: null,
        }}
      />,
      { wrapper: QueryClientWrapper },
    );
    expect(
      await screen.findByText("Este objetivo não está mais disponível."),
    ).toBeTruthy();

    rerender(
      <PortfolioObjectives
        navigation={{
          open: false,
          objectiveId: "missing-objective",
          screen: null,
        }}
      />,
    );
    expect(await screen.findByText("Seus objetivos")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Novo objetivo" }));
    expect(
      await screen.findByRole("heading", { name: "Novo objetivo" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(await screen.findByText("Seus objetivos")).toBeTruthy();
  });

  it("keeps the balance editor open after API and network errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ objectives: [objective] }))
      .mockResolvedValueOnce(
        Response.json({ message: "Saldo recusado." }, { status: 400 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioObjectives />, { wrapper: QueryClientWrapper });

    await user.click(
      await screen.findByRole("button", { name: "Abrir objetivo Viagem" }),
    );
    await user.click(screen.getByRole("button", { name: "Salvar saldo" }));
    expect(await screen.findByRole("heading", { name: "Viagem" })).toBeTruthy();

    fetchMock.mockRejectedValueOnce(new Error("network detail"));
    await user.click(screen.getByRole("button", { name: "Salvar saldo" }));
    expect(await screen.findByRole("heading", { name: "Viagem" })).toBeTruthy();
  });

  it("keeps an objective after delete API or network failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ objectives: [objective] }))
      .mockResolvedValueOnce(
        Response.json({ message: "Exclusão recusada." }, { status: 409 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioObjectives />, { wrapper: QueryClientWrapper });

    await user.click(
      await screen.findByRole("button", { name: "Ações do objetivo Viagem" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Excluir objetivo" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );
    expect(
      screen.getByRole("alertdialog", { name: "Excluir Viagem?" }),
    ).toBeTruthy();

    fetchMock.mockRejectedValueOnce(new Error("network detail"));
    await user.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );
    expect(
      screen.getByRole("button", { name: "Abrir objetivo Viagem" }),
    ).toBeTruthy();
  });

  it("keeps the create form open after a network error and does not navigate without an id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ objectives: [] }))
      .mockRejectedValueOnce(new Error("network detail"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onNavigationChange = vi.fn();
    render(<PortfolioObjectives onNavigationChange={onNavigationChange} />, {
      wrapper: QueryClientWrapper,
    });

    await user.click(
      await screen.findByRole("button", { name: "Novo objetivo" }),
    );
    await user.type(screen.getByLabelText("Nome do objetivo"), "Viagem");
    await user.click(
      screen.getByRole("combobox", { name: "Finalidade deste destino" }),
    );
    await user.click(screen.getByRole("option", { name: "Objetivo pessoal" }));
    await user.click(screen.getByRole("button", { name: "Criar objetivo" }));
    expect(
      await screen.findByText("Defina os dados do novo objetivo."),
    ).toBeTruthy();
    expect(onNavigationChange).not.toHaveBeenCalled();
  });

  it("keeps the form open when a successful create response omits its objective id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ objectives: [] }))
      .mockResolvedValueOnce(Response.json({ message: "Objetivo criado." }))
      .mockResolvedValueOnce(Response.json({ objectives: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const onNavigationChange = vi.fn();
    render(<PortfolioObjectives onNavigationChange={onNavigationChange} />, {
      wrapper: QueryClientWrapper,
    });

    await user.click(
      await screen.findByRole("button", { name: "Novo objetivo" }),
    );
    await user.type(screen.getByLabelText("Nome do objetivo"), "Curso");
    await user.click(
      screen.getByRole("combobox", { name: "Finalidade deste destino" }),
    );
    await user.click(screen.getByRole("option", { name: "Objetivo pessoal" }));
    await user.click(screen.getByRole("button", { name: "Criar objetivo" }));

    expect(
      await screen.findByText("Defina os dados do novo objetivo."),
    ).toBeTruthy();
    expect(onNavigationChange).not.toHaveBeenCalled();
  });
});
