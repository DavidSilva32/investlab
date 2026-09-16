import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/backend/repositories/import.repository", () => ({
  importRepository: { listLatestPositions: mocks.list },
}));
vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button>Sair</button>,
}));
vi.mock("@/components/portfolio-import", () => ({
  PortfolioImport: () => <div>import component</div>,
}));

import HomePage, { dynamic } from "@/app/page";

describe("HomePage", () => {
  it("renders the empty portfolio state dynamically", async () => {
    mocks.list.mockResolvedValue([]);
    expect(dynamic).toBe("force-dynamic");
    expect(renderToStaticMarkup(await HomePage())).toContain(
      "Nenhuma posição importada",
    );
  });
  it("renders imported positions", async () => {
    mocks.list.mockResolvedValue([
      { id: "1", product: "ETF", assetCode: "BOVA11", quantity: "2" },
      { id: "2", product: "Tesouro", assetCode: null, quantity: "1" },
    ]);
    expect(renderToStaticMarkup(await HomePage())).toContain("ETF");
    expect(renderToStaticMarkup(await HomePage())).toContain("Tesouro");
  });
});
