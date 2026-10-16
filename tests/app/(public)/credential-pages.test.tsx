import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import InvitePage from "@/app/(public)/invite/[token]/page";
import PasswordResetPage from "@/app/(public)/reset-password/[token]/page";

vi.mock("@/components/auth/credential-setup-form", () => ({
  CredentialSetupForm: ({ mode, token }: { mode: string; token: string }) => (
    <output>{`${mode}:${token}`}</output>
  ),
}));

describe("public credential pages", () => {
  it("passes the invitation token to the account activation form", async () => {
    const page = await InvitePage({
      params: Promise.resolve({ token: "invite-token" }),
    });
    expect(renderToStaticMarkup(page)).toContain("invite:invite-token");
  });

  it("passes the reset token to the password reset form", async () => {
    const page = await PasswordResetPage({
      params: Promise.resolve({ token: "reset-token" }),
    });
    expect(renderToStaticMarkup(page)).toContain("reset:reset-token");
  });
});
