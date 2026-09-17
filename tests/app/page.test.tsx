// @vitest-environment jsdom
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
  it("renders the dynamic portfolio summary with direct actions", async () => {
    mocks.list.mockResolvedValue([
      {
        product: "CDB",
        institution: "Banco A",
        maturityAt: "2030-01-01",
        totalValue: "1200",
      },
    ]);

    const html = renderToStaticMarkup(await HomePage());

    expect(dynamic).toBe("force-dynamic");
    expect(html).toContain("Patrimônio atual");
    expect(html).toContain("Maior exposição");
    expect(html).toContain("Próximo vencimento");
    expect(html).toContain("R$ 1.200,00");
    expect(html).toContain("100.0%");
    expect(html).toContain("01/01/2030");
    expect(html).toContain("Importar dados");
    expect(html).toContain('href="/imports"');
    expect(html).toContain('href="/portfolio"');
  });

  it("renders informative empty values without performance cards", async () => {
    mocks.list.mockResolvedValue([
      {
        product: "Sem valor",
        institution: null,
        maturityAt: null,
        totalValue: null,
      },
    ]);

    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain("Ainda sem valores atuais");
    expect(html).toContain("Nenhum vencimento informado");
    expect(html).toContain("1");
    expect(html).not.toContain("Valor investido");
    expect(html).not.toContain("Resultado");
    expect(html).not.toContain("Rentabilidade");
  });
});
