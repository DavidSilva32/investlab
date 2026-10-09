import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest, apiRequestWithResponse } from "@/lib/api-client";

describe("apiRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the decoded body for a successful request", async () => {
    const payload = { value: 42 };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest<typeof payload>("/api/example")).resolves.toBe(
      payload,
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/example");
  });

  it("returns the response metadata when requested", async () => {
    const response = {
      ok: true,
      json: async () => ({ value: 42 }),
      headers: new Headers({ "retry-after": "15" }),
    } as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(apiRequestWithResponse("/api/example")).resolves.toEqual({
      data: { value: 42 },
      response,
    });
  });

  it("adds JSON headers when sending a body and preserves caller headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ saved: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/example", {
      method: "POST",
      body: JSON.stringify({ value: 42 }),
      headers: { authorization: "Bearer session" },
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/example", {
      method: "POST",
      body: JSON.stringify({ value: 42 }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer session",
      },
    });
  });

  it("keeps bodyless request options unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ loaded: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/example", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledWith("/api/example", {
      method: "GET",
      headers: {},
    });
  });

  it("uses a server message and status for HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ "retry-after": "30" }),
        json: async () => ({ message: "Acesso negado." }),
      }),
    );

    await expect(apiRequest("/api/private")).rejects.toMatchObject({
      name: "ApiError",
      message: "Acesso negado.",
      status: 403,
      retryAfter: "30",
    });
  });

  it("uses the fallback when the HTTP error has no safe message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      }),
    );

    await expect(
      apiRequest("/api/private", undefined, "Serviço indisponível."),
    ).rejects.toMatchObject({ message: "Serviço indisponível.", status: 500 });
  });

  it("normalizes transport and response parsing failures", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("private transport detail"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error("invalid payload details");
        },
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("/api/private", undefined, "Falha segura."),
    ).rejects.toMatchObject({ message: "Falha segura.", status: 0 });
    await expect(
      apiRequest("/api/private", undefined, "Resposta inválida."),
    ).rejects.toMatchObject({ message: "Resposta inválida.", status: 0 });
  });

  it("preserves an unauthorized status when its response body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => {
          throw new SyntaxError("not JSON");
        },
      }),
    );

    await expect(apiRequest("/api/private")).rejects.toMatchObject({
      message: "Não foi possível concluir a solicitação.",
      status: 401,
    });
  });

  it("exposes the error status and a stable error name", () => {
    const error = new ApiError("Sessão expirada.", 401);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ApiError");
    expect(error.status).toBe(401);
  });
});
