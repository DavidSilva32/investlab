// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AdminOverview,
  type AdminStats,
} from "@/app/(private)/admin/users/_components/admin-overview";

afterEach(cleanup);

const stats: AdminStats = {
  totalUsers: 12,
  activeUsers: 8,
  pendingUsers: 2,
  disabledUsers: 2,
  expiringTrials: 3,
  expiredTrials: 1,
  invitationsPending: 4,
};

describe("AdminOverview", () => {
  it("renders metrics and account states from the server summary", () => {
    render(<AdminOverview stats={stats} />);

    expect(screen.getByText("Central de operação")).toBeTruthy();
    expect(
      screen.getByText("Contas cadastradas").parentElement?.textContent,
    ).toContain("12");
    expect(
      screen.getByText("Aguardando ativação").parentElement?.textContent,
    ).toContain("2");
    expect(
      screen.getByRole("img", { name: "Ativas: 8 de 12 contas" }),
    ).toBeTruthy();
  });

  it("marks missing metrics unavailable rather than reporting zero", () => {
    render(<AdminOverview stats={undefined} />);

    expect(
      screen.getByText("Contas cadastradas").parentElement?.textContent,
    ).toContain("—");
    expect(
      screen.getByRole("img", { name: "Ativas: dados indisponíveis" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Vencem em 7 dias").parentElement?.textContent,
    ).toContain("—");
  });

  it("renders empty account metrics without inventing progress", () => {
    render(
      <AdminOverview
        stats={{
          totalUsers: 0,
          activeUsers: 0,
          pendingUsers: 0,
          disabledUsers: 0,
          expiringTrials: 0,
          expiredTrials: 0,
          invitationsPending: 0,
        }}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Ativas: 0 de 0 contas" }),
    ).toBeTruthy();
  });

  it("uses zero fallbacks when an older summary omits access counts", () => {
    render(
      <AdminOverview
        stats={
          {
            ...stats,
            activeUsers: undefined,
            pendingUsers: undefined,
            disabledUsers: undefined,
          } as unknown as AdminStats
        }
      />,
    );

    expect(
      screen.getByRole("img", { name: "Ativas: 0 de 0 contas" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Aguardando ativação: 0 de 0 contas" }),
    ).toBeTruthy();
  });

  it("calculates an omitted state as zero when other accounts are counted", () => {
    render(
      <AdminOverview
        stats={
          {
            ...stats,
            activeUsers: undefined,
            pendingUsers: 2,
            disabledUsers: 0,
          } as unknown as AdminStats
        }
      />,
    );

    expect(
      screen.getByRole("img", { name: "Ativas: 0 de 2 contas" }),
    ).toBeTruthy();
  });
});
