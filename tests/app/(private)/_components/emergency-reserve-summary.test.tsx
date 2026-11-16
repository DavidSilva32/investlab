// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmergencyReserveSummary } from "@/app/(private)/_components/emergency-reserve-summary";
import { calculateEmergencyReserve } from "@/lib/emergency-reserve";

const calculation = calculateEmergencyReserve({
  monthlyExpenses: 1000,
  targetMonths: 6,
  balance: 2500,
  referenceDate: "2026-09-01",
});

describe("EmergencyReserveSummary", () => {
  afterEach(cleanup);

  it("does not show progress until a bank balance is informed", () => {
    render(
      <EmergencyReserveSummary
        calculation={calculation}
        reserveObservation={null}
      />,
    );

    expect(screen.getByText("Saldo não informado")).toBeTruthy();
    expect(screen.getByText(/Informe o saldo atual da Reserva/)).toBeTruthy();
    expect(screen.queryByText("Cobertura em meses")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/posições vinculadas/i)).toBeNull();
  });

  it("calculates coverage and progress from the latest observed balance", () => {
    render(
      <EmergencyReserveSummary
        calculation={calculation}
        reserveObservation={{
          observedAmountCents: "1200000",
          observedOn: "2026-11-14",
        }}
      />,
    );

    expect(screen.getByText("R$ 12.000,00")).toBeTruthy();
    expect(screen.getByText("12 meses de despesas")).toBeTruthy();
    expect(screen.getByText(/Sua meta está atingida/u)).toBeTruthy();
    expect(screen.getByText(/Informado em 14\/11\/2026/)).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("keeps the observed balance visible when monthly expenses are not available", () => {
    render(
      <EmergencyReserveSummary
        calculation={{
          ...calculation,
          monthlyExpenses: null,
          coveredMonths: null,
        }}
        reserveObservation={{
          observedAmountCents: "5604248",
          observedOn: "2026-11-14",
        }}
      />,
    );

    expect(screen.getByText("R$ 56.042,48")).toBeTruthy();
    expect(screen.getByText(/Informe suas despesas mensais/)).toBeTruthy();
    expect(screen.queryByText("Cobertura em meses")).toBeNull();
  });

  it("keeps settings and import actions out of read-only mode", () => {
    const onOpenReserve = vi.fn();
    const onOpenImport = vi.fn();
    render(
      <EmergencyReserveSummary
        calculation={{
          ...calculation,
          essentialMonthlyExpenses: 900,
          essentialExpenseSources: [
            {
              id: "rent",
              description: "Moradia",
              frequency: "Mensal",
              amount: 900,
              monthlyEquivalent: 900,
            },
          ],
        }}
        reserveObservation={{
          observedAmountCents: "1200000",
          observedOn: "2026-11-14",
        }}
        onOpenReserve={onOpenReserve}
        onOpenImport={onOpenImport}
        readOnly
      />,
    );

    expect(screen.queryByRole("button", { name: "Ver reserva" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Atualizar dados da B3" }),
    ).toBeNull();
  });

  it("opens calculation details and explains that the balance is not added to wealth", async () => {
    const user = userEvent.setup();
    render(
      <EmergencyReserveSummary
        calculation={{
          ...calculation,
          essentialMonthlyExpenses: 900,
          essentialExpenseSources: [
            {
              id: "rent",
              description: "Moradia",
              frequency: "Mensal",
              amount: 900,
              monthlyEquivalent: 900,
            },
          ],
        }}
        reserveObservation={{
          observedAmountCents: "1200000",
          observedOn: "2026-11-14",
        }}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Origem, cálculo e limitações",
    });

    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByText(/não é somado novamente ao patrimônio da carteira/),
    ).toBeTruthy();
    expect(screen.getByText(/Moradia \(Mensal\)/)).toBeTruthy();
    expect(screen.queryByText(/vinculadas à reserva/i)).toBeNull();
  });

  it("shows retry-independent data loading failure inline", () => {
    render(<EmergencyReserveSummary />);
    expect(
      screen.getByText(/Não foi possível carregar os dados da reserva/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver reserva" }));
  });

  it("opens reserve and import actions when editing is allowed", () => {
    const onOpenReserve = vi.fn();
    const onOpenImport = vi.fn();
    render(
      <EmergencyReserveSummary
        calculation={calculation}
        onOpenReserve={onOpenReserve}
        onOpenImport={onOpenImport}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ver reserva" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar dados da B3" }),
    );
    expect(onOpenReserve).toHaveBeenCalledOnce();
    expect(onOpenImport).toHaveBeenCalledOnce();
  });

  it("shows below-target gaps in the horizon comparison from the observed amount", async () => {
    const user = userEvent.setup();
    render(
      <EmergencyReserveSummary
        calculation={calculation}
        reserveObservation={{
          observedAmountCents: "300000",
          observedOn: "2026-11-14",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Comparar metas de 3, 6, 9 e 12 meses",
      }),
    );
    expect(screen.getByText("Valor atingido")).toBeTruthy();
    expect(screen.getAllByText(/Faltam R\$/u).length).toBeGreaterThan(0);
    expect(screen.getByText(/Faltam R\$ 3\.000,00 para a meta/)).toBeTruthy();
  });

  it("supports a reserve with no personal month target", () => {
    render(
      <EmergencyReserveSummary
        calculation={{
          ...calculation,
          targetMonths: null,
          targetValue: null,
          difference: null,
          progressPercentage: null,
        }}
        reserveObservation={{
          observedAmountCents: "120000",
          observedOn: "2026-11-14",
        }}
      />,
    );

    expect(screen.getByText("Sem meta pessoal configurada")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows the on-target result without describing it as above the target", () => {
    render(
      <EmergencyReserveSummary
        calculation={calculation}
        reserveObservation={{
          observedAmountCents: "600000",
          observedOn: "2026-11-14",
        }}
      />,
    );

    expect(screen.getByText("Sua meta pessoal está atingida.")).toBeTruthy();
    expect(screen.queryByText(/acima dela/)).toBeNull();
  });

  it("asks for positive expenses when zero expense data cannot produce coverage", () => {
    render(
      <EmergencyReserveSummary
        calculation={calculateEmergencyReserve({
          monthlyExpenses: 0,
          targetMonths: 6,
          balance: 1200,
          referenceDate: "2026-11-14",
        })}
        reserveObservation={{
          observedAmountCents: "120000",
          observedOn: "2026-11-14",
        }}
      />,
    );

    expect(
      screen.getByText(/despesas informadas precisam ser maiores que zero/),
    ).toBeTruthy();
  });
});
