import { beforeEach, describe, expect, it, vi } from "vitest";

const chat = vi.hoisted(() => ({ query: vi.fn() }));
const logger = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("@/backend/services/portfolio-chat-query.service", () => ({
  portfolioChatQueryService: chat,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { PortfolioChatQueryController } from "@/backend/controllers/portfolio-chat-query.controller";

const makeRequest = (body: string) =>
  new Request("http://test/api/portfolio/chat/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

describe("PortfolioChatQueryController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates and delegates a portfolio query", async () => {
    chat.query.mockResolvedValue({ message: "Encontrado", items: [] });
    const response = await new PortfolioChatQueryController().post(
      makeRequest(
        JSON.stringify({ intent: "asset-list", assetClassId: "fiis" }),
      ),
      "req-1",
    );
    expect(await response.json()).toEqual({ message: "Encontrado", items: [] });
    expect(chat.query).toHaveBeenCalledWith(
      { intent: "asset-list", assetClassId: "fiis" },
      "req-1",
    );
    expect(logger.info).toHaveBeenCalledWith(
      "portfolio_chat_query_completed",
      expect.objectContaining({
        requestId: "req-1",
        intent: "asset-list",
        resultCount: 0,
      }),
    );
  });

  it("logs zero results when a service result contains a null item list", async () => {
    chat.query.mockResolvedValue({ message: "Sem resultados", items: null });
    const response = await new PortfolioChatQueryController().post(
      makeRequest(
        JSON.stringify({ intent: "asset-list", assetClassId: "fiis" }),
      ),
      "req-2",
    );
    expect(response.status).toBe(200);
    expect(logger.info).toHaveBeenCalledWith(
      "portfolio_chat_query_completed",
      expect.objectContaining({ requestId: "req-2", resultCount: 0 }),
    );
  });

  it("logs the number of listed positions", async () => {
    chat.query.mockResolvedValue({
      message: "Ativos encontrados",
      items: [{ id: "itub4" }],
    });
    await new PortfolioChatQueryController().post(
      makeRequest(
        JSON.stringify({ intent: "asset-list", assetClassId: "fiis" }),
      ),
      "req-3",
    );
    expect(logger.info).toHaveBeenCalledWith(
      "portfolio_chat_query_completed",
      expect.objectContaining({ requestId: "req-3", resultCount: 1 }),
    );
  });

  it("logs zero results for a value response without a candidate list", async () => {
    chat.query.mockResolvedValue({ message: "Valor acompanhado" });
    await new PortfolioChatQueryController().post(
      makeRequest(
        JSON.stringify({
          intent: "asset-class-value",
          assetClassId: "fiis",
        }),
      ),
      "req-4",
    );
    expect(logger.info).toHaveBeenCalledWith(
      "portfolio_chat_query_completed",
      expect.objectContaining({ requestId: "req-4", resultCount: 0 }),
    );
  });

  it("rejects malformed JSON and incomplete query contracts", async () => {
    const controller = new PortfolioChatQueryController();
    await expect(
      controller.post(makeRequest("{"), "req-1"),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      controller.post(
        makeRequest(JSON.stringify({ intent: "asset-value" })),
        "req-1",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      controller.post(
        makeRequest(JSON.stringify({ intent: "asset-list" })),
        "req-1",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(chat.query).not.toHaveBeenCalled();
  });
});
