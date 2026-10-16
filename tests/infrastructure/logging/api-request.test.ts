import { afterEach, describe, expect, it, vi } from "vitest";
const authorization = vi.hoisted(() => ({
  user: { id: "owner-1", role: "ADMIN" } as { id: string; role: string } | null,
}));
vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: vi.fn(async () => authorization.user),
}));
import { getDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";

describe("withApiRequestLogging", () => {
  afterEach(() => {
    authorization.user = { id: "owner-1", role: "ADMIN" };
    vi.restoreAllMocks();
  });

  it("logs a successful request, propagates its ID, and sets the response header", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const handler = withApiRequestLogging(
      "GET",
      "/api/analyses/stocks/[ticker]",
      async (request: Request) => {
        expect(request.headers.get("x-request-id")).toBe("trace-123");
        return Response.json({ ok: true });
      },
    );

    const response = await handler(
      new Request("https://investlab.test/api/analyses/stocks/BBDC4", {
        headers: { "x-request-id": "trace-123" },
      }),
    );
    const logs = info.mock.calls.map(([line]) => JSON.parse(line));

    expect(response.headers.get("x-request-id")).toBe("trace-123");
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "api_request_started",
          requestId: "trace-123",
          method: "GET",
          route: "/api/analyses/stocks/[ticker]",
        }),
        expect.objectContaining({
          event: "api_request_completed",
          requestId: "trace-123",
          module: "analyses",
          status: 200,
        }),
      ]),
    );
  });

  it("replaces malformed request IDs and passes the generated ID downstream", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const handler = withApiRequestLogging(
      "POST",
      "/api/imports/preview",
      async (request: Request) => {
        expect(getApiRequestId(request)).toMatch(/^[0-9a-f-]{36}$/i);
        return Response.json({ ok: true });
      },
    );
    const response = await handler(
      new Request("https://investlab.test/api/imports/preview", {
        method: "POST",
        headers: { "x-request-id": "invalid trace" },
        body: "{}",
      }),
    );

    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("logs thrown failures and rethrows them without logging request data", async () => {
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const handler = withApiRequestLogging("GET", "", async () => {
      throw new TypeError("private detail");
    });

    await expect(handler()).rejects.toThrow("private detail");
    const logged = JSON.parse(errorLog.mock.calls[0][0]);
    expect(logged).toMatchObject({
      event: "api_request_failed",
      module: "unknown",
      errorType: "TypeError",
    });
    expect(logged).not.toHaveProperty("error");
  });

  it("logs non-Error rejections and supports handlers without a request argument", async () => {
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const handler = withApiRequestLogging(
      "POST",
      "/api/auth/logout",
      async () => {
        throw "failed";
      },
    );

    await expect(handler()).rejects.toBe("failed");
    expect(JSON.parse(errorLog.mock.calls[0][0])).toMatchObject({
      event: "api_request_failed",
      errorType: "UnknownError",
    });
  });

  it("uses an unknown module label for a successful route without a prefix", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const handler = withApiRequestLogging("GET", "", async () =>
      Response.json({ ok: true }),
    );

    await handler();

    expect(JSON.parse(info.mock.calls[1][0])).toMatchObject({
      event: "api_request_completed",
      module: "unknown",
    });
  });

  it("allows each authenticated account and scopes its private request context", async () => {
    authorization.user = { id: "new-user", role: "ADMIN" };
    const handler = withApiRequestLogging(
      "GET",
      "/api/portfolio",
      async (_request: Request) => Response.json({ ownerId: getDataOwnerId() }),
    );
    const response = await handler(
      new Request("https://investlab.test/api/portfolio"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ownerId: "new-user" });
  });

  it("rejects private requests without a session before invoking the handler", async () => {
    authorization.user = null;
    const routeHandler = vi.fn(async (_request: Request) =>
      Response.json({ private: true }),
    );
    const handler = withApiRequestLogging(
      "GET",
      "/api/portfolio",
      routeHandler,
    );

    const response = await handler(
      new Request("https://investlab.test/api/portfolio"),
    );

    expect(response.status).toBe(401);
    expect(routeHandler).not.toHaveBeenCalled();
  });

  it("requires ADMIN for global administrative writes", async () => {
    authorization.user = { id: "user-1", role: "USER" };
    const handler = withApiRequestLogging(
      "POST",
      "/api/settings/screener/sync",
      async (_request: Request) => Response.json({ ok: true }),
    );
    const response = await handler(
      new Request("https://investlab.test/api/settings/screener/sync", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(403);
  });
});
