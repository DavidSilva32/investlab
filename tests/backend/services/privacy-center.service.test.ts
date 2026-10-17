import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listTermsAcceptances: vi.fn(),
  getApprovedTermsVersion: vi.fn(() => null as string | null),
}));
vi.mock("@/backend/repositories/privacy-center.repository", () => ({
  privacyCenterRepository: mocks,
}));
vi.mock("@/lib/privacy-policy", () => ({
  getApprovedTermsVersion: mocks.getApprovedTermsVersion,
}));

import { privacyCenterService } from "@/backend/services/privacy-center.service";
import { getApprovedTermsVersion } from "@/lib/privacy-policy";

describe("PrivacyCenterService", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("returns the current terms version and only the user's recorded history", async () => {
    mocks.getApprovedTermsVersion.mockReturnValue("terms-2026-10-20.1");
    const termsAcceptances = [
      { termsVersion: "2026-10-17", acceptedAt: new Date("2026-10-17") },
    ];
    mocks.listTermsAcceptances.mockResolvedValue(termsAcceptances);

    await expect(
      privacyCenterService.getTermsAcceptances("user-1"),
    ).resolves.toEqual({
      currentTermsVersion: getApprovedTermsVersion(),
      termsAcceptances,
    });
    expect(mocks.listTermsAcceptances).toHaveBeenCalledWith("user-1");
  });

  it("reports no current approved version without changing existing acceptance history", async () => {
    mocks.getApprovedTermsVersion.mockReturnValue(null);
    const termsAcceptances = [
      { termsVersion: "legacy-approved-version", acceptedAt: new Date() },
    ];
    mocks.listTermsAcceptances.mockResolvedValue(termsAcceptances);

    await expect(
      privacyCenterService.getTermsAcceptances("existing-user"),
    ).resolves.toEqual({
      currentTermsVersion: null,
      termsAcceptances,
    });
  });
});
