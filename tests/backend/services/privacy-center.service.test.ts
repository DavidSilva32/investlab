import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listTermsAcceptances: vi.fn() }));
vi.mock("@/backend/repositories/privacy-center.repository", () => ({
  privacyCenterRepository: mocks,
}));

import { privacyCenterService } from "@/backend/services/privacy-center.service";
import { CURRENT_TERMS_VERSION } from "@/lib/privacy-policy";

describe("PrivacyCenterService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the current terms version and only the user's recorded history", async () => {
    const termsAcceptances = [
      { termsVersion: "2026-10-17", acceptedAt: new Date("2026-10-17") },
    ];
    mocks.listTermsAcceptances.mockResolvedValue(termsAcceptances);

    await expect(
      privacyCenterService.getTermsAcceptances("user-1"),
    ).resolves.toEqual({
      currentTermsVersion: CURRENT_TERMS_VERSION,
      termsAcceptances,
    });
    expect(mocks.listTermsAcceptances).toHaveBeenCalledWith("user-1");
  });
});
