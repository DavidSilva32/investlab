// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const next = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => next.redirect(href),
}));

import RecurringExpensesPage, {
  dynamic,
} from "@/app/(private)/despesas-recorrentes/page";

describe("RecurringExpensesPage", () => {
  it("redirects saved links to the recurring management panel in finances", () => {
    RecurringExpensesPage();
    expect(dynamic).toBe("force-dynamic");
    expect(next.redirect).toHaveBeenCalledWith(
      "/financas?gerenciar=recorrencias",
    );
  });
});
