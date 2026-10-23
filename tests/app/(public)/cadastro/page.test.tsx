import { describe, expect, it } from "vitest";
import PublicSignupPage from "@/app/(public)/cadastro/page";
import { PublicSignupForm } from "@/app/(public)/cadastro/_components/public-signup-form";
import { CURRENT_TERMS_VERSION } from "@/lib/privacy-policy";

describe("PublicSignupPage", () => {
  it("provides the current Terms version to the signup form", () => {
    const page = PublicSignupPage();
    expect(page.type).toBe(PublicSignupForm);
    expect(page.props.termsVersion).toBe(CURRENT_TERMS_VERSION);
  });
});
