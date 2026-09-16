import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/backend/repositories/import.repository", () => ({
  importRepository: { listLatestPositions: mocks.list },
}));
vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button>Sair</button>,
}));

import HomePage, { dynamic } from "@/app/page";

describe("HomePage", () => {
  it("renders the reduced dashboard dynamically", async () => {
    mocks.list.mockResolvedValue([]);
    const html = renderToStaticMarkup(await HomePage());
    expect(dynamic).toBe("force-dynamic");
    expect(html).toContain("Patrimônio total");
    expect(html).toContain("Importar dados");
    expect(html).toContain('href="/imports"');
  });

  it("renders a dash when positions have no current value", async () => {
    mocks.list.mockResolvedValue([{ totalValue: null }]);
    expect(renderToStaticMarkup(await HomePage())).toContain("—");
  });

  it("does not show unavailable performance cards", async () => {
    mocks.list.mockResolvedValue([{ totalValue: "1200" }]);
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("R$ 1.200,00");
    expect(html).not.toContain("Valor investido");
    expect(html).not.toContain("Resultado");
    expect(html).not.toContain("Rentabilidade");
  });
});
