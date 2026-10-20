import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "../src/proxy";

describe("optimistic authentication proxy", () => {
  it("excludes static assets without excluding application pages or APIs", () => {
    const matcher = config.matcher[0];
    const matcherPathPattern = new RegExp(`^${matcher.slice(1)}`);
    expect(
      matcherPathPattern.test("images/investlab-assistant-mascot.png"),
    ).toBe(false);
    expect(matcherPathPattern.test("portfolio")).toBe(true);
    expect(matcherPathPattern.test("api/portfolio/objectives")).toBe(true);
  });

  it("serves the anonymous landing, redirects private navigation, and rejects APIs without a session", () => {
    expect(proxy(new NextRequest("http://test/")).status).toBe(200);
    expect(
      proxy(new NextRequest("http://test/carteira")).headers.get("location"),
    ).toContain("/entrar");
    const response = proxy(new NextRequest("http://test/api/screener"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("allows public auth links and requests carrying a Better Auth session cookie", () => {
    for (const path of [
      "/",
      "/apresentacao",
      "/demonstracao",
      "/entrar",
      "/login",
      "/convite/some-token",
      "/invite/some-token",
      "/redefinir-senha/some-token",
      "/reset-password/some-token",
    ]) {
      expect(proxy(new NextRequest(`http://test${path}`)).status).toBe(200);
    }
    for (const path of [
      "/termos-de-uso",
      "/privacidade",
      "/cookies",
      "/mcp/consent",
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-protected-resource/api/mcp",
      "/api/auth/oauth2/authorize",
      "/api/auth/.well-known/oauth-authorization-server",
      "/api/mcp",
    ]) {
      expect(proxy(new NextRequest(`http://test${path}`)).status).toBe(200);
    }
    expect(
      proxy(
        new NextRequest("http://test/", {
          headers: { cookie: "better-auth.session_token=opaque" },
        }),
      ).status,
    ).toBe(200);
  });

  it("keeps arbitrary signup endpoints private while gated invite activation stays publicly reachable", () => {
    expect(
      proxy(
        new NextRequest("http://test/api/auth/sign-up/email", {
          method: "POST",
        }),
      ).status,
    ).toBe(401);
    expect(
      proxy(
        new NextRequest("http://test/api/auth/invitations/activate", {
          method: "POST",
        }),
      ).status,
    ).toBe(200);
  });

  it("leaves login visibility to the server layout and allows public reset links", () => {
    expect(
      proxy(
        new NextRequest("http://test/entrar", {
          headers: { cookie: "better-auth.session_token=opaque" },
        }),
      ).status,
    ).toBe(200);
    expect(
      proxy(new NextRequest("http://test/redefinir-senha/token")).status,
    ).toBe(200);
    for (const task of ["fundamentals", "market"]) {
      expect(
        proxy(
          new NextRequest(`http://test/api/cron/weekly-screener-sync/${task}`, {
            method: "GET",
          }),
        ).status,
      ).toBe(200);
    }
    expect(
      proxy(
        new NextRequest("http://test/api/cron/weekly-screener-sync/unknown", {
          method: "GET",
        }),
      ).status,
    ).toBe(401);
  });
});
