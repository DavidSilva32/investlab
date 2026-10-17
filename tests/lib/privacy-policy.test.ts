import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_TERMS_VERSION,
  getApprovedTermsVersion,
  validateApprovedTermsVersion,
} from "@/lib/privacy-policy";

afterEach(() => vi.unstubAllEnvs());

describe("getApprovedTermsVersion", () => {
  it.each([
    null,
    "",
    "   ",
    DRAFT_TERMS_VERSION,
    "invalid/version",
    "v".repeat(41),
  ])("does not enable an unapproved value %s from the environment", (value) => {
    vi.stubEnv("INVESTLAB_APPROVED_TERMS_VERSION", String(value));
    expect(getApprovedTermsVersion()).toBeNull();
    expect(validateApprovedTermsVersion(value)).toBeNull();
  });

  it("accepts only a valid, separately approved version", () => {
    expect(validateApprovedTermsVersion(" terms-2026-10-20.1 ")).toBe(
      "terms-2026-10-20.1",
    );
  });

  it("keeps activation blocked until an approved version is committed with the documents", () => {
    vi.stubEnv("INVESTLAB_APPROVED_TERMS_VERSION", "terms-2026-10-20.1");
    expect(getApprovedTermsVersion()).toBeNull();
  });
});
