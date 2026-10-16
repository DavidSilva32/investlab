import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from "@/app/(public)/login/page";

describe("login page", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("passes the validated support link from the server environment", () => {
    vi.stubEnv("SUPPORT_WHATSAPP_NUMBER", "21986721163");

    const page = LoginPage();

    expect(page.props.supportWhatsAppUrl).toMatch(
      /^https:\/\/wa\.me\/5521986721163\?text=/,
    );
  });

  it("passes no support link when the environment is missing", () => {
    vi.stubEnv("SUPPORT_WHATSAPP_NUMBER", "");

    const page = LoginPage();

    expect(page.props.supportWhatsAppUrl).toBeNull();
  });
});
