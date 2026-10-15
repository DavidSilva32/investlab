import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const controller = vi.hoisted(() => ({ post: vi.fn() }));
const logger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  withContext: (_context: unknown, operation: () => unknown) => operation(),
}));
vi.mock("@/backend/controllers/portfolio-chat-query.controller", () => ({
  portfolioChatQueryController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { POST } from "@/app/api/portfolio/chat/query/route";

describe("portfolio chat query route", () => {
  it("delegates the request and preserves the request id", async () => {
    controller.post.mockResolvedValueOnce(Response.json({ message: "ok" }));
    const request = new Request("http://test/api/portfolio/chat/query", {
      method: "POST",
      headers: { "x-request-id": "req-chat" },
      body: JSON.stringify({ intent: "asset-list", assetClassId: "fiis" }),
    });
    expect((await POST(request)).status).toBe(200);
    expect(controller.post).toHaveBeenCalledWith(request, "req-chat");
  });

  it("returns safe messages for expected and unexpected failures", async () => {
    controller.post.mockRejectedValueOnce(
      new ApplicationError("Pergunta inválida.", 400),
    );
    const expected = await POST(new Request("http://test", { method: "POST" }));
    expect(expected.status).toBe(400);
    expect(await expected.json()).toEqual({ message: "Pergunta inválida." });
    expect(logger.warn).toHaveBeenCalled();

    controller.post.mockRejectedValueOnce(new Error("private database detail"));
    const unexpected = await POST(
      new Request("http://test", { method: "POST" }),
    );
    expect(unexpected.status).toBe(500);
    expect(await unexpected.json()).toEqual({
      message: "Não foi possível consultar os dados da carteira.",
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
