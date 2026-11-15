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
  it("shows only useful account totals and directs the admin to the people list", () => {
    render(<AdminOverview stats={stats} loading={false} />);

    expect(screen.getByRole("heading", { name: "Visão geral" })).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Resumo de pessoas e acessos" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Pessoas cadastradas").parentElement?.textContent,
    ).toContain("12");
    expect(
      screen.getByText("Contas ativas").parentElement?.textContent,
    ).toContain("8");
    expect(
      screen.getByText("Convites aguardando").parentElement?.textContent,
    ).toContain("4");
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent?.replace(/\s+/g, " ").trim() ===
            "3 acessos vencem em 7 dias · 1 acesso vencido",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Gerenciar pessoas e acessos" })
        .getAttribute("href"),
    ).toBe("/admin/usuarios");
    expect(screen.queryByText("JORNADA DO PARTICIPANTE")).toBeNull();
    expect(screen.queryByText("Estado das contas")).toBeNull();
  });

  it("distinguishes loading, unavailable metrics, and no access attention", () => {
    const { rerender } = render(
      <AdminOverview stats={undefined} loading={true} />,
    );
    expect(screen.getByText("Consultando acessos…")).toBeTruthy();

    rerender(<AdminOverview stats={undefined} loading={false} />);
    expect(
      screen.getByText("Os indicadores de acesso não estão disponíveis."),
    ).toBeTruthy();

    rerender(
      <AdminOverview
        stats={{
          ...stats,
          expiringTrials: 0,
          expiredTrials: 0,
        }}
        loading={false}
      />,
    );
    expect(
      screen.getByText("Nenhum acesso precisa de atenção agora."),
    ).toBeTruthy();

    rerender(
      <AdminOverview
        stats={{ ...stats, invitationsPending: 0 }}
        loading={false}
      />,
    );
    expect(screen.queryByText("Convites aguardando")).toBeNull();

    rerender(
      <AdminOverview
        stats={{ ...stats, invitationsPending: 1 }}
        loading={false}
      />,
    );
    expect(screen.getByText("Convites aguardando")).toBeTruthy();
  });

  it("uses zero when a partially returned metric is absent", () => {
    render(
      <AdminOverview
        stats={{
          ...stats,
          totalUsers: undefined as unknown as number,
          invitationsPending: undefined as unknown as number,
        }}
        loading={false}
      />,
    );

    expect(
      screen.getByText("Pessoas cadastradas").parentElement?.textContent,
    ).toContain("0");
    expect(screen.queryByText("Convites aguardando")).toBeNull();
  });
});
