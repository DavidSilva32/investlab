import { describe, expect, it } from "vitest";
import {
  COOKIE_POLICY_VERSION,
  CURRENT_TERMS_VERSION,
  getCurrentTermsVersion,
  PRIVACY_DOCUMENT_DATE,
} from "@/lib/privacy-policy";

describe("current legal-document versions", () => {
  it("exposes a stable, identifiable product Terms version", () => {
    expect(CURRENT_TERMS_VERSION).toMatch(/^termos-\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(getCurrentTermsVersion()).toBe(CURRENT_TERMS_VERSION);
    expect(PRIVACY_DOCUMENT_DATE).toBe("19 de outubro de 2026");
  });

  it("keeps the cookie document version separate from Terms acceptance", () => {
    expect(COOKIE_POLICY_VERSION).not.toBe(CURRENT_TERMS_VERSION);
  });
});
