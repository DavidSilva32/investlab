import { beforeEach, describe, expect, it, vi } from "vitest";

const allocation = vi.hoisted(() => ({ getAllocation: vi.fn() }));
vi.mock("@/backend/services/portfolio-allocation.service", () => ({
  portfolioAllocationService: allocation,
}));

import { PortfolioChatQueryService } from "@/backend/services/portfolio-chat-query.service";

const stock = {
  id: "itub4-1",
  product: "Ação preferencial",
  assetCode: "ITUB4",
  issuer: "Itaú Unibanco",
  institution: "Corretora Exemplo",
  totalValue: "120.00",
  canonicalValueCents: "12000",
  classification: {
    assetClass: "Renda variável",
    subClass: "Ação preferencial",
    geography: "Brasil",
  },
};
const fii = {
  id: "hglg11-1",
  product: "FII HGLG11",
  assetCode: "HGLG11",
  issuer: "CSHG Logística",
  institution: null,
  totalValue: "250.00",
  canonicalValueCents: "25000",
  classification: {
    assetClass: "Fundos",
    subClass: "Logística",
    geography: "Brasil",
  },
};
const unclassified = {
  ...stock,
  id: "unknown",
  product: "Ativo sem classe",
  assetCode: null,
  issuer: null,
  classification: { assetClass: null, subClass: null, geography: null },
};

describe("PortfolioChatQueryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allocation.getAllocation.mockResolvedValue([stock, fii]);
  });

  it("lists individually classified equity positions and reports unclassified positions", async () => {
    allocation.getAllocation.mockResolvedValue([stock, fii, unclassified]);
    const result = await new PortfolioChatQueryService().query(
      { intent: "asset-list", assetClassId: "brazilian_equities" },
      "req-1",
    );
    expect(result).toEqual({
      message:
        "Encontrei 1 posição(ões) em Ações e BDRs. Há 1 posição(ões) sem classe confirmada.",
      items: [
        expect.objectContaining({
          id: "itub4-1",
          assetCode: "ITUB4",
          issuer: "Itaú Unibanco",
        }),
      ],
      incompleteCount: 1,
      unvaluedCount: 0,
    });
    expect(allocation.getAllocation).toHaveBeenCalledWith("req-1");
  });

  it("lists individually classified FIIs", async () => {
    allocation.getAllocation.mockResolvedValue([fii, stock]);
    await expect(
      new PortfolioChatQueryService().query(
        { intent: "asset-list", assetClassId: "fiis" },
        "req-1",
      ),
    ).resolves.toEqual({
      message: "Encontrei 1 posição(ões) em Fundos imobiliários (FIIs).",
      items: [
        expect.objectContaining({
          id: "hglg11-1",
          assetCode: "HGLG11",
          issuer: "CSHG Logística",
        }),
      ],
      incompleteCount: 0,
      unvaluedCount: 0,
    });
  });

  it("reports empty listings with or without unclassified positions", async () => {
    allocation.getAllocation.mockResolvedValueOnce([unclassified]);
    await expect(
      new PortfolioChatQueryService().query(
        { intent: "asset-list", assetClassId: "fiis" },
        "req-1",
      ),
    ).resolves.toMatchObject({
      message: expect.stringContaining("1 posição(ões) sem classe confirmada"),
      items: [],
      incompleteCount: 1,
    });
    allocation.getAllocation.mockResolvedValueOnce([]);
    await expect(
      new PortfolioChatQueryService().query(
        { intent: "asset-list", assetClassId: "fiis" },
        "req-1",
      ),
    ).resolves.toMatchObject({
      message: "Não encontrei posições em Fundos imobiliários (FIIs).",
      items: [],
      incompleteCount: 0,
    });
  });

  it("rejects unsupported listing classes safely", async () => {
    await expect(
      new PortfolioChatQueryService().query(
        { intent: "asset-list", assetClassId: "fixed_income" },
        "req-1",
      ),
    ).resolves.toMatchObject({
      message: expect.stringContaining("classe compatível"),
      items: [],
    });
  });

  it("handles missing class and malformed values without throwing", async () => {
    const service = new PortfolioChatQueryService();
    await expect(
      service.query({ intent: "asset-class-value" }, "req-1"),
    ).resolves.toEqual({ message: "Informe uma classe de ativos." });

    allocation.getAllocation.mockResolvedValue([
      { ...stock, canonicalValueCents: "malformed", estimatedValue: null },
    ]);
    await expect(
      service.query({ intent: "asset-value", query: "ITUB4" }, "req-1"),
    ).resolves.toMatchObject({
      message:
        "Encontrei Ação preferencial, mas não há valor atual confirmado.",
    });
  });

  it("discloses listed positions that have no confirmed current value", async () => {
    allocation.getAllocation.mockResolvedValue([
      { ...fii, canonicalValueCents: null, totalValue: null },
    ]);
    await expect(
      new PortfolioChatQueryService().query(
        { intent: "asset-list", assetClassId: "fiis" },
        "req-1",
      ),
    ).resolves.toMatchObject({
      message: expect.stringContaining("1 sem valor atual confirmado"),
      unvaluedCount: 1,
    });
  });

  it("calculates known class value and discloses positions without a value", async () => {
    allocation.getAllocation.mockResolvedValue([
      stock,
      { ...stock, id: "no-value", canonicalValueCents: null, totalValue: null },
    ]);
    await expect(
      new PortfolioChatQueryService().query(
        { intent: "asset-class-value", assetClassId: "brazilian_equities" },
        "req-1",
      ),
    ).resolves.toEqual({
      message:
        "O valor atual acompanhado em Ações e BDRs é R$ 120,00. 1 posição(ões) estão sem valor confirmado.",
    });
  });

  it("distinguishes classes with no confirmed values from empty classes", async () => {
    allocation.getAllocation.mockResolvedValueOnce([
      { ...stock, canonicalValueCents: null, totalValue: null },
    ]);
    await expect(
      new PortfolioChatQueryService().query(
        { intent: "asset-class-value", assetClassId: "brazilian_equities" },
        "req-1",
      ),
    ).resolves.toMatchObject({
      message: expect.stringContaining("valor atual confirmado"),
    });
    allocation.getAllocation.mockResolvedValueOnce([]);
    await expect(
      new PortfolioChatQueryService().query(
        { intent: "asset-class-value", assetClassId: "brazilian_equities" },
        "req-1",
      ),
    ).resolves.toMatchObject({
      message: expect.stringContaining("Não encontrei posições"),
    });
  });

  it("discloses unclassified positions in class value results", async () => {
    allocation.getAllocation.mockResolvedValue([stock, unclassified]);
    await expect(
      new PortfolioChatQueryService().query(
        { intent: "asset-class-value", assetClassId: "brazilian_equities" },
        "req-1",
      ),
    ).resolves.toMatchObject({
      message: expect.stringContaining("1 posição(ões) sem classe confirmada"),
    });
    allocation.getAllocation.mockResolvedValueOnce([unclassified]);
    await expect(
      new PortfolioChatQueryService().query(
        { intent: "asset-class-value", assetClassId: "brazilian_equities" },
        "req-1",
      ),
    ).resolves.toMatchObject({
      message: expect.stringContaining("Não encontrei posições classificadas"),
    });
  });

  it("matches exact tickers and returns the confirmed position value", async () => {
    await expect(
      new PortfolioChatQueryService().query(
        { intent: "asset-value", query: "ITUB4" },
        "req-1",
      ),
    ).resolves.toEqual({
      message:
        "O valor atual acompanhado de Ação preferencial (ITUB4 · Itaú Unibanco) é R$ 120,00.",
    });
  });

  it("sums positions for an exact issuer name without guessing a ticker", async () => {
    allocation.getAllocation.mockResolvedValue([
      stock,
      {
        ...stock,
        id: "itub3",
        assetCode: "ITUB3",
        canonicalValueCents: "30000",
      },
    ]);
    await expect(
      new PortfolioChatQueryService().query(
        { intent: "asset-value", query: "Itaú Unibanco" },
        "req-1",
      ),
    ).resolves.toEqual({
      message: "O valor atual acompanhado em Itaú Unibanco é R$ 420,00.",
    });
  });

  it("discloses a partial subtotal when some issuer positions have no value", async () => {
    allocation.getAllocation.mockResolvedValue([
      stock,
      {
        ...stock,
        id: "itub3",
        canonicalValueCents: null,
        totalValue: null,
      },
    ]);
    await expect(
      new PortfolioChatQueryService().query(
        { intent: "asset-value", query: "Itaú Unibanco" },
        "req-1",
      ),
    ).resolves.toMatchObject({
      message: expect.stringContaining(
        "O subtotal não inclui 1 posição(ões) sem valor confirmado.",
      ),
    });
  });

  it("reports an exact issuer with no confirmed position values", async () => {
    allocation.getAllocation.mockResolvedValue([
      {
        ...stock,
        canonicalValueCents: null,
        totalValue: null,
        estimatedValue: null,
      },
    ]);
    await expect(
      new PortfolioChatQueryService().query(
        { intent: "asset-value", query: "Itaú Unibanco" },
        "req-1",
      ),
    ).resolves.toMatchObject({
      message: "Não encontrei valor atual confirmado para Itaú Unibanco.",
    });
  });

  it("returns candidates when the asset name matches multiple positions", async () => {
    allocation.getAllocation.mockResolvedValue([
      stock,
      { ...stock, id: "itub3", assetCode: "ITUB3" },
    ]);
    await expect(
      new PortfolioChatQueryService().query(
        { intent: "asset-value", query: "Ação preferencial" },
        "req-1",
      ),
    ).resolves.toMatchObject({
      message: expect.stringContaining("mais de uma posição"),
      items: [{ id: "itub4-1" }, { id: "itub3" }],
    });
  });

  it("reports missing asset matches and ignores positions outside the requested class", async () => {
    await expect(
      new PortfolioChatQueryService().query(
        { intent: "asset-value", query: "ITUB4", assetClassId: "fiis" },
        "req-1",
      ),
    ).resolves.toMatchObject({
      message: expect.stringContaining("Não encontrei um ativo"),
    });
  });

  it("reports a missing asset query and handles candidates without code or issuer", async () => {
    const service = new PortfolioChatQueryService();
    await expect(
      service.query({ intent: "asset-value" }, "req-1"),
    ).resolves.toMatchObject({
      message: "Encontrei mais de uma posição para “undefined”.",
    });

    allocation.getAllocation.mockResolvedValue([
      {
        ...stock,
        assetCode: null,
        issuer: "Itaú Unibanco",
        institution: null,
        canonicalValueCents: "12000",
      },
    ]);
    await expect(
      service.query(
        { intent: "asset-value", query: "Ação preferencial" },
        "req-1",
      ),
    ).resolves.toMatchObject({
      message:
        "O valor atual acompanhado de Ação preferencial (Itaú Unibanco) é R$ 120,00.",
    });
    allocation.getAllocation.mockResolvedValue([
      {
        ...stock,
        assetCode: "ITUB4",
        issuer: null,
        institution: null,
      },
    ]);
    await expect(
      service.query(
        { intent: "asset-value", query: "Ação preferencial" },
        "req-1",
      ),
    ).resolves.toMatchObject({
      message:
        "O valor atual acompanhado de Ação preferencial (ITUB4) é R$ 120,00.",
    });
    allocation.getAllocation.mockResolvedValue([
      {
        ...stock,
        assetCode: null,
        issuer: null,
        institution: null,
      },
    ]);
    await expect(
      service.query(
        { intent: "asset-value", query: "Ação preferencial" },
        "req-1",
      ),
    ).resolves.toMatchObject({
      message: "O valor atual acompanhado de Ação preferencial é R$ 120,00.",
    });
  });
});
