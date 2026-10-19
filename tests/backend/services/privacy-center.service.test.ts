import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listTermsAcceptances: vi.fn(),
  hasTermsAcceptance: vi.fn(),
  recordTermsAcceptance: vi.fn(),
  getCurrentTermsVersion: vi.fn(() => "termos-2026-10-19.1"),
}));
vi.mock("@/backend/repositories/privacy-center.repository", () => ({
  privacyCenterRepository: mocks,
}));
vi.mock("@/lib/privacy-policy", () => ({
  getCurrentTermsVersion: mocks.getCurrentTermsVersion,
}));

import { privacyCenterService } from "@/backend/services/privacy-center.service";

describe("PrivacyCenterService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the current version and the user's recorded acceptance history", async () => {
    const termsAcceptances = [
      {
        termsVersion: "termos-2026-10-17.1",
        acceptedAt: new Date("2026-10-17"),
      },
    ];
    mocks.listTermsAcceptances.mockResolvedValue(termsAcceptances);

    await expect(
      privacyCenterService.getTermsAcceptances("user-1"),
    ).resolves.toEqual({
      currentTermsVersion: "termos-2026-10-19.1",
      termsAcceptances,
    });
    expect(mocks.listTermsAcceptances).toHaveBeenCalledWith("user-1");
  });

  it("checks acceptance against the exact current version for one user", async () => {
    mocks.hasTermsAcceptance.mockResolvedValueOnce(true);
    await expect(
      privacyCenterService.hasAcceptedCurrentTerms("user-1"),
    ).resolves.toBe(true);
    expect(mocks.hasTermsAcceptance).toHaveBeenCalledWith(
      "user-1",
      "termos-2026-10-19.1",
    );
  });

  it("records the current version and rejects a stale version", async () => {
    mocks.recordTermsAcceptance.mockResolvedValue({ recorded: true });
    await expect(
      privacyCenterService.acceptCurrentTerms("user-1", "termos-2026-10-19.1"),
    ).resolves.toEqual({ recorded: true });
    expect(mocks.recordTermsAcceptance).toHaveBeenCalledWith(
      "user-1",
      "termos-2026-10-19.1",
    );

    await expect(
      privacyCenterService.acceptCurrentTerms("user-1", "old-version"),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.recordTermsAcceptance).toHaveBeenCalledOnce();
  });
});
