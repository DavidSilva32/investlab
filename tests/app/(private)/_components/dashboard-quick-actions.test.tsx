// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardQuickActions } from "@/app/(private)/_components/dashboard-quick-actions";

vi.mock("@/components/portfolio-import", () => ({
  PortfolioImport: () => <p>Prévia de importação</p>,
}));
vi.mock("@/app/(private)/portfolio/_components/portfolio-objectives", () => ({
  PortfolioObjectives: ({
    navigation,
  }: {
    navigation?: { objectiveId: string | null };
  }) => (
    <>
      <p>Gerenciar objetivos</p>
      {navigation?.objectiveId && (
        <p>Objetivo no painel: {navigation.objectiveId}</p>
      )}
    </>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DashboardQuickActions", () => {
  it("opens the existing manual-position, import and objectives flows in place", async () => {
    function Harness() {
      const [objectivesOpen, setObjectivesOpen] = useState(false);
      const [importOpen, setImportOpen] = useState(false);
      return (
        <DashboardQuickActions
          positions={[]}
          importOpen={importOpen}
          onImportOpenChange={setImportOpen}
          objectivesOpen={objectivesOpen}
          onObjectivesOpenChange={setObjectivesOpen}
        />
      );
    }

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    render(<Harness />);

    expect(screen.getByRole("region")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Adicionar posi/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Adicionar posi/ }));
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "portfolio:manual-position:create" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Importar e conciliar" }),
    );
    expect(await screen.findByText(/via de importa/)).toBeTruthy();
    expect(screen.getByRole("region", { name: /concilia/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Ver objetivos" }));
    expect(await screen.findByText("Gerenciar objetivos")).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Objetivos e destinos da carteira" }),
    ).toBeTruthy();
    expect(screen.queryByText(/quando houver/)).toBeTruthy();
  });

  it("uses the first-access actions to open the existing import and manual flows", async () => {
    function Harness() {
      const [importOpen, setImportOpen] = useState(false);
      return (
        <DashboardQuickActions
          positions={[]}
          importOpen={importOpen}
          onImportOpenChange={setImportOpen}
          objectivesOpen={false}
          onObjectivesOpenChange={vi.fn()}
          firstAccess
        />
      );
    }

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    render(<Harness />);

    fireEvent.click(
      screen.getByRole("button", { name: "Importar arquivo da B3" }),
    );
    expect(await screen.findByText(/via de importa/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Cadastrar manualmente" }),
    );
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "portfolio:manual-position:create" }),
    );
  });

  it("reopens the short onboarding guide and routes to existing actions", async () => {
    const onImportOpenChange = vi.fn();
    render(
      <DashboardQuickActions
        positions={[]}
        importOpen={false}
        onImportOpenChange={onImportOpenChange}
        objectivesOpen={false}
        onObjectivesOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Como começar" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Comece pela sua carteira")).toBeTruthy();
    const planningLink = screen.getByRole("link", {
      name: /Conhecer o planejamento/,
    });
    expect(planningLink.getAttribute("href")).toBe("/planejamento");
    expect(screen.getByText("Acompanhe os próximos passos")).toBeTruthy();

    fireEvent.click(planningLink);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Como começar" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Importar arquivo da B3" }),
    );
    expect(onImportOpenChange).toHaveBeenCalledWith(true);
  });

  it("closes the onboarding guide before opening manual position entry", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    render(
      <DashboardQuickActions
        positions={[]}
        importOpen={false}
        onImportOpenChange={vi.fn()}
        objectivesOpen={false}
        onObjectivesOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Como começar" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Cadastrar manualmente" }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "portfolio:manual-position:create" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Adicionar posição manual" }),
    ).toBeTruthy();
  });

  it("opens the selected objective inside the existing dashboard sheet", () => {
    render(
      <DashboardQuickActions
        positions={[]}
        importOpen={false}
        onImportOpenChange={vi.fn()}
        objectivesOpen
        onObjectivesOpenChange={vi.fn()}
        objectivesNavigation={{
          open: true,
          objectiveId: "reserve",
          screen: null,
        }}
      />,
    );

    expect(screen.getByText("Objetivo no painel: reserve")).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Objetivos e destinos da carteira" }),
    ).toBeTruthy();
  });

  it("hides manual creation and import in the read-only dashboard even with positions", () => {
    const onImportOpenChange = vi.fn();
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    render(
      <DashboardQuickActions
        positions={[
          {
            id: "position-1",
            product: "CDB",
            assetCode: null,
            institution: null,
            indexer: null,
            issuedAt: null,
            maturityAt: null,
            quantity: "1",
            totalValue: "100",
          },
        ]}
        importOpen={false}
        onImportOpenChange={onImportOpenChange}
        objectivesOpen
        onObjectivesOpenChange={vi.fn()}
        supportReadOnly
      />,
    );

    expect(screen.queryByRole("button", { name: /Adicionar posi/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Ações rápidas" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Importar e conciliar" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Ver objetivos" })).toBeNull();
    expect(
      screen.queryByRole("region", {
        name: "Objetivos e destinos da carteira",
      }),
    ).toBeNull();
    expect(onImportOpenChange).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "portfolio:manual-position:create" }),
    );
    window.dispatchEvent(new Event("portfolio:manual-position:create"));
    expect(
      screen.queryByRole("heading", { name: "Adicionar posição manual" }),
    ).toBeNull();
  });

  it("keeps first-access actions blocked after support status fails", () => {
    render(
      <DashboardQuickActions
        positions={[]}
        importOpen={false}
        onImportOpenChange={vi.fn()}
        objectivesOpen={false}
        onObjectivesOpenChange={vi.fn()}
        firstAccess
        supportCheckError
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Tentar novamente" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Importar arquivo da B3/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Cadastrar manualmente" }),
    ).toBeNull();
  });
});
