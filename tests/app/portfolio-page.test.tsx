import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const list = vi.hoisted(() => vi.fn());
vi.mock("@/backend/repositories/import.repository", () => ({
  importRepository: { listLatestPositions: list },
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
import PortfolioPage from "@/app/portfolio/page";
describe("PortfolioPage", () => {
  it("renders empty and populated snapshots", async () => {
    list.mockResolvedValue([]);
    expect(renderToStaticMarkup(await PortfolioPage())).toContain(
      "Nenhuma posição importada",
    );
    list.mockResolvedValue([
      {
        id: "1",
        product: "CDB",
        assetCode: "CDB",
        quantity: "300000",
        institution: null,
        totalValue: "3177.67",
      },
      {
        id: "2",
        product: "Tesouro",
        assetCode: null,
        quantity: "1",
        institution: "B3",
        totalValue: null,
      },
    ]);
    expect(renderToStaticMarkup(await PortfolioPage())).toContain("Tesouro");
  });
});
