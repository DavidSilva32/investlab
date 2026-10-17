// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardFirstAccess } from "@/app/(private)/_components/dashboard-first-access";

describe("DashboardFirstAccess", () => {
  afterEach(cleanup);

  it("offers the existing B3 import and manual registration paths", () => {
    const onImport = vi.fn();
    const onCreateManual = vi.fn();
    render(
      <DashboardFirstAccess
        onImport={onImport}
        onCreateManual={onCreateManual}
      />,
    );

    expect(screen.getByRole("region", { name: /carteira/ })).toBeTruthy();
    const investorAreaLink = screen.getByRole("link", {
      name: /Investidor da B3/,
    });
    expect(investorAreaLink.getAttribute("href")).toBe(
      "https://www.investidor.b3.com.br/",
    );
    expect(investorAreaLink.getAttribute("target")).toBe("_blank");
    expect(investorAreaLink.getAttribute("rel")).toBe("noopener noreferrer");
    fireEvent.click(
      screen.getByRole("button", { name: /Importar arquivo da B3/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Cadastrar manualmente" }),
    );
    expect(onImport).toHaveBeenCalledOnce();
    expect(onCreateManual).toHaveBeenCalledOnce();
  });

  it("explains the read-only support view without showing write actions", () => {
    render(
      <DashboardFirstAccess
        onImport={vi.fn()}
        onCreateManual={vi.fn()}
        readOnly
      />,
    );

    expect(screen.getByText(/somente leitura/i)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Importar arquivo da B3/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Cadastrar manualmente" }),
    ).toBeNull();
    expect(screen.getAllByText(/titular da conta/)).toHaveLength(3);
    expect(screen.queryByRole("link", { name: /Investidor da B3/ })).toBeNull();
  });
});
