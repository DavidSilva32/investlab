// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => <main aria-label={title}>{children}</main>,
}));

vi.mock(
  "@/app/(private)/despesas-recorrentes/_components/recurring-expenses-client",
  () => ({
    RecurringExpensesClient: () => <p>Controles de despesas recorrentes</p>,
  }),
);

import RecurringExpensesPage, {
  dynamic,
} from "@/app/(private)/despesas-recorrentes/page";

afterEach(cleanup);

describe("RecurringExpensesPage", () => {
  it("renders the recurring expense experience in the authenticated shell", () => {
    render(<RecurringExpensesPage />);
    expect(dynamic).toBe("force-dynamic");
    expect(screen.getByRole("main", { name: "Despesas" })).toBeTruthy();
    expect(screen.getByText("Controles de despesas recorrentes")).toBeTruthy();
  });
});
