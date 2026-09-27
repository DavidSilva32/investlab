/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonthYearPicker } from "@/app/settings/_components/month-year-picker";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("MonthYearPicker", () => {
  it("selects a month without asking for a day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-15T12:00:00.000Z"));
    const onChange = vi.fn();
    render(
      <MonthYearPicker id="target-month" value={null} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Escolha mês e ano" }));
    expect(screen.getByRole("heading", { name: "2030" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Próximo ano" }));
    fireEvent.click(screen.getByRole("button", { name: "Ano anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Próximo ano" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Selecionar março de 2031" }),
    );

    expect(onChange).toHaveBeenCalledWith("2031-03");
  });

  it("shows the saved month and lets the user clear it", () => {
    const onChange = vi.fn();
    render(
      <MonthYearPicker id="target-month" value="2032-06" onChange={onChange} />,
    );

    expect(screen.getByRole("button", { name: "junho de 2032" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "junho de 2032" }));
    expect(
      screen
        .getByRole("button", { name: "Selecionar junho de 2032" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Limpar prazo" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("keeps the picker disabled when the context is loading", () => {
    render(
      <MonthYearPicker
        id="target-month"
        value={null}
        disabled
        onChange={vi.fn()}
      />,
    );

    expect(
      (
        screen.getByRole("button", {
          name: "Escolha mês e ano",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("disables navigation past the final supported year", () => {
    render(
      <MonthYearPicker id="target-month" value="9999-12" onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "dezembro de 9999" }));
    expect(
      (screen.getByRole("button", { name: "Próximo ano" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Ano anterior",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("keeps year navigation inside supported four-digit years", () => {
    render(
      <MonthYearPicker id="target-month" value="0000-01" onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "janeiro de 0000" }));
    expect(
      (
        screen.getByRole("button", {
          name: "Ano anterior",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Próximo ano" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
