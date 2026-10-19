// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("keeps first-access choices reachable by keyboard with visible focus styles", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    const onCreateManual = vi.fn();
    render(
      <DashboardFirstAccess
        onImport={onImport}
        onCreateManual={onCreateManual}
      />,
    );

    await user.tab();
    const investorAreaLink = screen.getByRole("link", {
      name: /Investidor da B3/,
    });
    expect(document.activeElement).toBe(investorAreaLink);

    await user.tab();
    const importButton = screen.getByRole("button", {
      name: /Importar arquivo da B3/,
    });
    expect(document.activeElement).toBe(importButton);
    expect(importButton.className).toContain("focus-visible");
    await user.keyboard("{Enter}");
    expect(onImport).toHaveBeenCalledOnce();

    await user.tab();
    const manualButton = screen.getByRole("button", {
      name: "Cadastrar manualmente",
    });
    expect(document.activeElement).toBe(manualButton);
    expect(manualButton.className).toContain("focus-visible");
    await user.keyboard("{Enter}");
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

  it("shows a neutral pending context without exposing any onboarding action", () => {
    render(
      <DashboardFirstAccess
        onImport={vi.fn()}
        onCreateManual={vi.fn()}
        readOnly
        contextPending
      />,
    );

    expect(screen.getByRole("status").textContent).toMatch(
      /Verificando o acesso a esta conta/,
    );
    expect(screen.queryByText(/somente leitura/i)).toBeNull();
    expect(screen.queryByText(/titular da conta/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Importar arquivo da B3/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Cadastrar manualmente" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: /Investidor da B3/ })).toBeNull();
  });

  it("keeps first-access actions blocked after support status fails", () => {
    render(
      <DashboardFirstAccess
        onImport={vi.fn()}
        onCreateManual={vi.fn()}
        readOnly
        contextError
      />,
    );

    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Tentar novamente" }),
    ).toBeNull();
    expect(screen.queryByText(/somente leitura/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Importar arquivo da B3/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Cadastrar manualmente" }),
    ).toBeNull();
  });
});
