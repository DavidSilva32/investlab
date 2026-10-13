// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardQuickActions } from "@/app/_components/dashboard-quick-actions";

vi.mock("@/components/portfolio-import", () => ({
  PortfolioImport: () => <p>Prévia de importação</p>,
}));
vi.mock("@/app/portfolio/_components/portfolio-objectives", () => ({
  PortfolioObjectives: () => <p>Gerenciar objetivos</p>,
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
});
