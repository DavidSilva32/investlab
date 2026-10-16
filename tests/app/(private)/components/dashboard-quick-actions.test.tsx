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

    expect(screen.getByRole("region", { name: "Ações rápidas" })).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Adicionar posição" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar posição" }));
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "portfolio:manual-position:create" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Importar e conciliar" }),
    );
    expect(await screen.findByText("Prévia de importação")).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Importação e conciliação" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Ver objetivos" }));
    expect(await screen.findByText("Gerenciar objetivos")).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Objetivos e destinos da carteira" }),
    ).toBeTruthy();
    expect(screen.queryByText(/quando houver correspondência/)).toBeTruthy();
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
});
