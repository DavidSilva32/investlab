import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PasswordResetPage from "@/app/(public)/reset-password/[token]/page";

vi.mock("@/components/auth/credential-setup-form", () => ({
  CredentialSetupForm: ({ mode, token }: { mode: string; token: string }) => (
    <output>{`${mode}:${token}`}</output>
  ),
}));

describe("PasswordResetPage", () => {
  it("passes the password-reset token without introducing terms acceptance", async () => {
    const page = await PasswordResetPage({
      params: Promise.resolve({ token: "reset-token" }),
    });

    expect(renderToStaticMarkup(page)).toContain("reset:reset-token");
  });
});
