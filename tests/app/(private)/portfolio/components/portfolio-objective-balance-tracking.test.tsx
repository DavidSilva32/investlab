// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortfolioObjectiveBalanceTracking } from "@/app/(private)/portfolio/_components/portfolio-objective-balance-tracking";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

describe("PortfolioObjectiveBalanceTracking", () => {
  afterEach(cleanup);

  it("shows the current observed balance and date", () => {
    render(
      <PortfolioObjectiveBalanceTracking
        objectiveId={reserveObjectiveId}
        objectiveName="Reserva"
        saving={false}
        onSave={vi.fn()}
        tracking={{ observedAmountCents: "5604248", observedOn: "2026-11-14" }}
      />,
    );

    expect(screen.getByText("Atualizar saldo da Reserva")).toBeTruthy();
    expect(screen.getByLabelText("Saldo atual (R$)")).toBeTruthy();
    expect(screen.getByLabelText("Data-base")).toBeTruthy();
    expect(screen.queryByLabelText(/Rendimento contratado/u)).toBeNull();
    expect(
      screen.getByText(/as posições da carteira continuam independentes/u),
    ).toBeTruthy();
  });

  it("saves only the objective balance and date", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PortfolioObjectiveBalanceTracking
        objectiveId={reserveObjectiveId}
        objectiveName="Reserva"
        saving={false}
        onSave={onSave}
        tracking={null}
      />,
    );

    await user.type(
      screen.getByLabelText("Saldo observado de Reserva"),
      "56042,48",
    );
    await user.click(screen.getByRole("button", { name: "Salvar saldo" }));
    expect(onSave).toHaveBeenCalledWith({
      objectiveId: reserveObjectiveId,
      amount: "56042.48",
      observedOn: expect.any(String),
    });
    expect(screen.queryByLabelText(/Rendimento contratado/u)).toBeNull();
  });

  it("keeps the existing amount when editing a goal balance", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PortfolioObjectiveBalanceTracking
        objectiveId="00000000-0000-4000-8000-000000000001"
        objectiveName="Viagem"
        saving={false}
        onSave={onSave}
        tracking={{ observedAmountCents: "10000", observedOn: "2026-10-02" }}
      />,
    );

    const amount = screen.getByLabelText("Saldo observado de Viagem");
    expect((amount as HTMLInputElement).value).toBe("R$ 100,00");
    await user.clear(amount);
    await user.type(amount, "250,50");
    await user.click(screen.getByRole("button", { name: "Salvar saldo" }));
    expect(onSave).toHaveBeenCalledWith({
      objectiveId: "00000000-0000-4000-8000-000000000001",
      amount: "250.50",
      observedOn: "2026-10-02",
    });
  });

  it("saves a valid changed date and shows the saving state", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { rerender } = render(
      <PortfolioObjectiveBalanceTracking
        objectiveId="goal-date"
        objectiveName="Viagem"
        saving={false}
        onSave={onSave}
        tracking={{ observedAmountCents: "10000", observedOn: "2026-10-02" }}
      />,
    );

    const date = screen.getByLabelText("Data-base");
    fireEvent.change(date, { target: { value: "15/11/2026" } });
    expect((date as HTMLInputElement).value).toBe("15/11/2026");
    await user.click(screen.getByRole("button", { name: "Salvar saldo" }));
    expect(onSave).toHaveBeenCalledWith({
      objectiveId: "goal-date",
      amount: "100.00",
      observedOn: "2026-11-15",
    });
    rerender(
      <PortfolioObjectiveBalanceTracking
        objectiveId="goal-date"
        objectiveName="Viagem"
        saving={true}
        onSave={onSave}
        tracking={{ observedAmountCents: "10000", observedOn: "2026-10-02" }}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Salvando…" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("rejects invalid, future, and excessive amounts without saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PortfolioObjectiveBalanceTracking
        objectiveId="goal-invalid"
        objectiveName="Viagem"
        saving={false}
        onSave={onSave}
        tracking={{ observedAmountCents: "", observedOn: "2026-10-02" }}
      />,
    );

    const amount = screen.getByLabelText("Saldo observado de Viagem");
    await user.clear(amount);
    await user.click(screen.getByRole("button", { name: "Salvar saldo" }));
    expect(screen.getByRole("alert").textContent).toContain("R$ 1 trilhão");

    await user.clear(amount);
    await user.type(amount, "1000000000001,00");
    await user.click(screen.getByRole("button", { name: "Salvar saldo" }));
    expect(screen.getByRole("alert").textContent).toContain("R$ 1 trilhão");

    await user.clear(amount);
    await user.type(amount, "100,00");
    const date = screen.getByLabelText("Data-base");
    fireEvent.change(date, { target: { value: "31/12/2999" } });
    await user.click(screen.getByRole("button", { name: "Salvar saldo" }));
    expect(screen.getByText("A data-base não pode ser futura.")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(date, { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "Salvar saldo" }));
    expect(screen.getByText("Informe uma data-base válida.")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});
