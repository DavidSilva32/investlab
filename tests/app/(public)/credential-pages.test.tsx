import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InvitePage from "@/app/(public)/invite/[token]/page";
import PasswordResetPage from "@/app/(public)/reset-password/[token]/page";

const mocks = vi.hoisted(() => ({ getApprovedTermsVersion: vi.fn() }));
vi.mock("@/lib/privacy-policy", () => ({
  getApprovedTermsVersion: mocks.getApprovedTermsVersion,
}));

vi.mock("@/components/auth/credential-setup-form", () => ({
  CredentialSetupForm: ({
    mode,
    token,
    termsApproved,
  }: {
    mode: string;
    token: string;
    termsApproved?: boolean;
  }) => (
    <output>{`${mode}:${token}:${String(termsApproved ?? "reset")}`}</output>
  ),
}));

beforeEach(() => mocks.getApprovedTermsVersion.mockReturnValue(null));
afterEach(() => vi.unstubAllEnvs());

describe("public credential pages", () => {
  it("passes the invitation token to the account activation form", async () => {
    const page = await InvitePage({
      params: Promise.resolve({ token: "invite-token" }),
    });
    expect(renderToStaticMarkup(page)).toContain("invite:invite-token:false");
  });

  it("enables the invite form only when the server has an approved terms version", async () => {
    mocks.getApprovedTermsVersion.mockReturnValue("termos-2026-10-20.1");
    const page = await InvitePage({
      params: Promise.resolve({ token: "invite-token" }),
    });
    expect(renderToStaticMarkup(page)).toContain("invite:invite-token:true");
  });

  it("passes the reset token to the password reset form", async () => {
    const page = await PasswordResetPage({
      params: Promise.resolve({ token: "reset-token" }),
    });
    expect(renderToStaticMarkup(page)).toContain("reset:reset-token:reset");
  });
});
