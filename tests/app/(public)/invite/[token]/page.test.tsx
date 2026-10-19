import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import InvitePage from "@/app/(public)/invite/[token]/page";
import { CURRENT_TERMS_VERSION } from "@/lib/privacy-policy";

vi.mock("@/components/auth/credential-setup-form", () => ({
  CredentialSetupForm: ({
    mode,
    token,
    termsVersion,
  }: {
    mode: string;
    token: string;
    termsVersion?: string;
  }) => <output>{`${mode}:${token}:${termsVersion ?? "none"}`}</output>,
}));

describe("InvitePage", () => {
  it("passes the invite token and exact current Terms version to activation", async () => {
    const page = await InvitePage({
      params: Promise.resolve({ token: "invite-token" }),
    });

    expect(renderToStaticMarkup(page)).toContain(
      `invite:invite-token:${CURRENT_TERMS_VERSION}`,
    );
  });
});
