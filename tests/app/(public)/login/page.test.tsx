import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from "@/app/(public)/login/page";

describe("login page", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("passes the validated support link from the server environment", async () => {
    vi.stubEnv("SUPPORT_WHATSAPP_NUMBER", "21986721163");

    const page = await LoginPage({ searchParams: Promise.resolve({}) });

    expect(page.props.supportWhatsAppUrl).toMatch(
      /^https:\/\/wa\.me\/5521986721163\?text=/,
    );
  });

  it("passes no support link when the environment is missing", async () => {
    vi.stubEnv("SUPPORT_WHATSAPP_NUMBER", "");

    const page = await LoginPage({ searchParams: Promise.resolve({}) });

    expect(page.props.supportWhatsAppUrl).toBeNull();
  });

  it("passes only a validated MCP consent callback to the login form", async () => {
    const callbackURL = "/mcp/consent?scope=mcp%3Aread&state=signed";
    const page = await LoginPage({
      searchParams: Promise.resolve({ callbackURL }),
    });

    expect(page.props.mcpCallbackURL).toBe(callbackURL);

    const unsafePage = await LoginPage({
      searchParams: Promise.resolve({
        callbackURL: "https://malicious.example/collect",
      }),
    });
    expect(unsafePage.props.mcpCallbackURL).toBeUndefined();
  });
});
