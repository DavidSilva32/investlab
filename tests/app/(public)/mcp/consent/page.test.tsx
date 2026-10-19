import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  verify: vi.fn(),
  getSession: vi.fn(),
  getAuthSecret: vi.fn(() => "test-secret"),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock("@better-auth/oauth-provider", () => ({
  verifyOAuthQueryParams: mocks.verify,
}));
vi.mock("@/infrastructure/auth/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("@/infrastructure/auth/auth-configuration", () => ({
  getAuthSecret: mocks.getAuthSecret,
}));

import McpConsentPage, { scopeLabel } from "@/app/(public)/mcp/consent/page";

describe("MCP consent page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue(true);
    mocks.headers.mockResolvedValue(new Headers({ cookie: "session=1" }));
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("rejects missing and invalid signed OAuth query parameters", async () => {
    await expect(
      McpConsentPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.verify).not.toHaveBeenCalled();

    mocks.verify.mockResolvedValueOnce(false);
    await expect(
      McpConsentPage({
        searchParams: Promise.resolve({ client_id: "client-1" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.verify).toHaveBeenCalledWith(
      "client_id=client-1",
      "test-secret",
    );
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("preserves repeated OAuth parameters in the sign-in callback", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    await expect(
      McpConsentPage({
        searchParams: Promise.resolve({ scope: ["mcp:read", "openid"] }),
      }),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/entrar?callbackURL=%2Fmcp%2Fconsent%3Fscope%3Dmcp%253Aread%26scope%3Dopenid",
    );
    expect(mocks.verify).toHaveBeenCalledWith(
      "scope=mcp%3Aread&scope=openid",
      "test-secret",
    );
    expect(mocks.getSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
    });
  });

  it("renders the verified client, each requested permission, and default client name", async () => {
    const page = await McpConsentPage({
      searchParams: Promise.resolve({
        scope:
          "mcp:read mcp:admin:read openid profile email offline_access unknown_scope",
      }),
    });
    const text = JSON.stringify(page);
    expect(text).toContain("Aplicativo externo");
    expect(text).toContain("está solicitando acesso");
    expect(text).toContain("Consultar sua carteira e posições.");
    expect(text).toContain("disponível somente para ADMIN.");
    expect(text).toContain("Confirmar sua identidade");
    expect(text).toContain("Compartilhar informações básicas");
    expect(text).toContain("Compartilhar seu endereço de e-mail.");
    expect(text).toContain("Manter a conexão ativa");
    expect(text).toContain("unknown_scope");
    expect(text).toContain("oauthQuery");
  });

  it("skips undefined query values and renders no permission list when scope is omitted", async () => {
    const page = await McpConsentPage({
      searchParams: Promise.resolve({
        client_name: "ChatGPT",
        unused: undefined,
      }),
    });
    const text = JSON.stringify(page);
    expect(text).toContain("ChatGPT");
    expect(text).not.toContain("mcp:read");
  });

  it("labels all known scopes and leaves unknown scope names intact", () => {
    expect(scopeLabel("mcp:read")).toBe("Consultar sua carteira e posições.");
    expect(scopeLabel("mcp:admin:read")).toContain("somente para ADMIN");
    expect(scopeLabel("openid")).toBe(
      "Confirmar sua identidade para esta conexão.",
    );
    expect(scopeLabel("profile")).toBe(
      "Compartilhar informações básicas do seu perfil.",
    );
    expect(scopeLabel("email")).toBe("Compartilhar seu endereço de e-mail.");
    expect(scopeLabel("offline_access")).toBe(
      "Manter a conexão ativa até você revogá-la.",
    );
    expect(scopeLabel("custom:scope")).toBe("custom:scope");
  });
});
