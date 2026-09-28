// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getTodayDateIso,
  DatePickerField,
} from "@/components/ui/date-picker-field";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DatePickerField", () => {
  it("shows a saved date in Brazilian format and emits ISO while typing", () => {
    const onChange = vi.fn();
    render(
      <DatePickerField
        id="date"
        label="Data do valor"
        value="2026-09-20"
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("Data do valor") as HTMLInputElement;
    expect(input.value).toBe("20/09/2026");
    fireEvent.change(input, { target: { value: "21/09/2026" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-09-21");
  });

  it("rejects impossible typed dates and exposes an accessible error", () => {
    const onChange = vi.fn();
    render(
      <DatePickerField
        id="date"
        label="Data do valor"
        value=""
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("Data do valor") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "31/02/2026" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("resets a typed error when its saved value changes externally", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DatePickerField
        id="date"
        label="Data do valor"
        value=""
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("Data do valor") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "32/01/2026" } });
    fireEvent.blur(input);
    expect(screen.getByRole("alert")).toBeTruthy();

    rerender(
      <DatePickerField
        id="date"
        label="Data do valor"
        value="2026-09-22"
        onChange={onChange}
      />,
    );
    expect(input.value).toBe("22/09/2026");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("selects dates from the calendar and returns an ISO date", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DatePickerField
        id="date"
        label="Data do valor"
        value="2026-09-15"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /abrir calend/i }));
    const day = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button[data-day]"),
    ).find((button) => button.textContent?.trim() === "16");
    if (!day) throw new Error("calendar day missing");
    await user.click(day);
    expect(onChange).toHaveBeenLastCalledWith("2026-09-16");
    expect(
      (screen.getByLabelText("Data do valor") as HTMLInputElement).value,
    ).toBe("16/09/2026");
  });

  it("clears the selected date when it is selected again in the calendar", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DatePickerField
        id="date"
        label="Data do valor"
        value="2026-09-15"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /abrir calend/i }));
    const selectedDay = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button[data-day]"),
    ).find((button) => button.textContent?.trim() === "15");
    if (!selectedDay) throw new Error("selected calendar day missing");
    await user.click(selectedDay);

    expect(onChange).toHaveBeenLastCalledWith("");
    expect(
      (screen.getByLabelText("Data do valor") as HTMLInputElement).value,
    ).toBe("");
  });

  it("uses the local date when defaulting to today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 27, 23, 30));
    expect(getTodayDateIso()).toBe("2026-09-27");
  });
});
