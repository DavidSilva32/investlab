// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortfolioObjectiveBalanceTracking } from "@/app/portfolio/_components/portfolio-objective-balance-tracking";

describe("PortfolioObjectiveBalanceTracking", () => {
  afterEach(cleanup);

  it("separates the observed amount from its gross CDI projection and saves the observation", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PortfolioObjectiveBalanceTracking
        objectiveId="goal-1"
        objectiveName="Viagem"
        saving={false}
        onSave={onSave}
        tracking={{
          observedAmountCents: "10000",
          observedOn: "2026-10-02",
          cdiPercentage: "100.0000",
          projection: {
            projectedAmountCents: "10010",
            projectedOn: "2026-10-06",
            estimatedThrough: "2026-10-05",
            cdiPercentage: "100.0000",
            status: "provisional",
          },
        }}
      />,
    );

    expect(
      screen.getByText("Saldo observado").parentElement?.textContent,
    ).toMatch(/R\$\s*100,00/u);
    expect(
      (screen.getByLabelText("Saldo observado de Viagem") as HTMLInputElement)
        .value,
    ).toBe("R$ 100,00");
    expect(
      screen.getByText("Projeção bruta antes de impostos").parentElement
        ?.textContent,
    ).toMatch(/R\$\s*100,10/u);
    expect(screen.getByText("Em 02/10/2026")).toBeTruthy();
    expect(
      screen.getByText(/Avaliada em 06\/10\/2026; CDI até 05\/10\/2026/u),
    ).toBeTruthy();
    expect(
      screen.getByText(/não inclui impostos, aportes ou resgates/u),
    ).toBeTruthy();
    expect(screen.getByText(/última taxa oficial conhecida/)).toBeTruthy();
    await user.clear(screen.getByLabelText("Saldo observado de Viagem"));
    await user.type(
      screen.getByLabelText("Saldo observado de Viagem"),
      "250,50",
    );
    await user.click(
      screen.getByRole("button", { name: "Salvar saldo observado" }),
    );
    expect(onSave).toHaveBeenCalledWith({
      objectiveId: "goal-1",
      amount: "250.50",
      observedOn: "2026-10-02",
      cdiPercentage: "100.0000",
    });
  });

  it("explains why an old observation remains unprojected", () => {
    render(
      <PortfolioObjectiveBalanceTracking
        objectiveId="goal-1"
        objectiveName="Viagem"
        saving={false}
        onSave={vi.fn()}
        tracking={{
          observedAmountCents: "12500",
          observedOn: "2026-09-01",
          cdiPercentage: null,
          projection: null,
        }}
      />,
    );
    expect(screen.getByText("R$ 125,00")).toBeTruthy();
    expect(
      screen.getByText(/Sem condições suficientes para projetar/),
    ).toBeTruthy();
  });

  it("labels an official projection and preserves an unrecognized source date", () => {
    render(
      <PortfolioObjectiveBalanceTracking
        objectiveId="goal-1"
        objectiveName="Viagem"
        saving={false}
        onSave={vi.fn()}
        tracking={{
          observedAmountCents: "12500",
          observedOn: "data desconhecida",
          cdiPercentage: "100.0000",
          projection: {
            projectedAmountCents: "12510",
            projectedOn: "2026-10-06",
            estimatedThrough: "2026-10-06",
            cdiPercentage: "100.0000",
            status: "projected",
          },
        }}
      />,
    );

    expect(screen.getByText("Em data desconhecida")).toBeTruthy();
    expect(
      screen.getByText(/Avaliada em 06\/10\/2026.*06\/10\/2026/),
    ).toBeTruthy();
    expect(screen.getByText(/taxas oficiais/)).toBeTruthy();
  });

  it("explains why a CDI-backed observation has no projection yet", () => {
    render(
      <PortfolioObjectiveBalanceTracking
        objectiveId="goal-1"
        objectiveName="Viagem"
        saving={false}
        onSave={vi.fn()}
        tracking={{
          observedAmountCents: "12500",
          observedOn: "2026-10-02",
          cdiPercentage: "100.0000",
          projectionUnavailableReason: "no_eligible_days",
          projection: null,
        }}
      />,
    );
    expect(
      screen.getByText(/Ainda não há dias úteis elegíveis para projetar/),
    ).toBeTruthy();
    expect(
      screen.queryByText(/Sem condições suficientes para projetar/),
    ).toBeNull();
  });

  it("explains when CDI rates are unavailable for an eligible projection", () => {
    render(
      <PortfolioObjectiveBalanceTracking
        objectiveId="goal-1"
        objectiveName="Viagem"
        saving={false}
        onSave={vi.fn()}
        tracking={{
          observedAmountCents: "12500",
          observedOn: "2026-09-01",
          cdiPercentage: "100.0000",
          projectionUnavailableReason: "rates_unavailable",
          projection: null,
        }}
      />,
    );
    expect(
      screen.getByText(/Não foi possível obter taxas CDI oficiais suficientes/),
    ).toBeTruthy();
    expect(screen.queryByText(/Ainda não há dias úteis elegíveis/)).toBeNull();
  });

  it("requires an observed amount before saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PortfolioObjectiveBalanceTracking
        objectiveId="goal-1"
        objectiveName="Viagem"
        saving={false}
        onSave={onSave}
        tracking={null}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Salvar saldo observado" }),
    );

    expect(screen.getByText(/Informe um valor entre/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps invalid amount, future date, and CDI fields beside their controls", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PortfolioObjectiveBalanceTracking
        objectiveId="goal-1"
        objectiveName="Viagem"
        saving={false}
        onSave={onSave}
        tracking={null}
      />,
    );
    await user.type(
      screen.getByLabelText("Saldo observado de Viagem"),
      "100000000000001",
    );
    const date = screen.getByLabelText("Data-base");
    await user.clear(date);
    await user.type(date, "31/12/2099");
    await user.type(screen.getByLabelText(/Rendimento contratado/), "1001");
    await user.click(
      screen.getByRole("button", { name: "Salvar saldo observado" }),
    );

    expect(screen.getByText(/Informe um valor entre/)).toBeTruthy();
    expect(screen.getByText("A data-base não pode ser futura.")).toBeTruthy();
    expect(screen.getByText(/Informe um percentual maior que 0/)).toBeTruthy();
    expect(
      screen
        .getByLabelText("Saldo observado de Viagem")
        .getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      screen.getByLabelText("Data-base").getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      screen
        .getByLabelText(/Rendimento contratado/)
        .getAttribute("aria-describedby"),
    ).toBe("objective-cdi-error");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps an invalid calendar date beside the date field", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PortfolioObjectiveBalanceTracking
        objectiveId="goal-1"
        objectiveName="Viagem"
        saving={false}
        onSave={onSave}
        tracking={null}
      />,
    );

    await user.type(screen.getByLabelText("Saldo observado de Viagem"), "10");
    const date = screen.getByLabelText("Data-base");
    await user.clear(date);
    await user.type(date, "31/02/2026");
    await user.click(
      screen.getByRole("button", { name: "Salvar saldo observado" }),
    );

    expect(screen.getByRole("alert").textContent).toMatch(/data-base/);
    expect(date.getAttribute("aria-invalid")).toBe("true");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("reloads the editor when the objective and saved observation change", () => {
    const onSave = vi.fn();
    const view = render(
      <PortfolioObjectiveBalanceTracking
        objectiveId="goal-1"
        objectiveName="Viagem"
        saving={false}
        onSave={onSave}
        tracking={{
          observedAmountCents: "10000",
          observedOn: "2026-10-02",
          cdiPercentage: "90.0000",
          projection: null,
        }}
      />,
    );
    view.rerender(
      <PortfolioObjectiveBalanceTracking
        objectiveId="goal-2"
        objectiveName="Casa"
        saving={false}
        onSave={onSave}
        tracking={{
          observedAmountCents: "27550",
          observedOn: "2026-10-01",
          cdiPercentage: "100.0000",
          projection: null,
        }}
      />,
    );
    expect(
      (screen.getByLabelText("Saldo observado de Casa") as HTMLInputElement)
        .value,
    ).toBe("R$ 275,50");
    expect((screen.getByLabelText("Data-base") as HTMLInputElement).value).toBe(
      "01/10/2026",
    );
    expect(
      (screen.getByLabelText(/Rendimento contratado/) as HTMLInputElement)
        .value,
    ).toBe("100.0000");
  });
});
