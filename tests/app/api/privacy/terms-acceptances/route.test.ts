import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTermsAcceptances: vi.fn(),
  acceptCurrentTerms: vi.fn(),
}));
vi.mock("@/backend/controllers/privacy-center.controller", () => ({
  privacyCenterController: mocks,
}));
vi.mock("@/infrastructure/logging/api-request", () => ({
  withApiRequestLogging: (_method: string, _path: string, handler: unknown) =>
    handler,
}));

import { GET, POST } from "@/app/api/privacy/terms-acceptances/route";

describe("/api/privacy/terms-acceptances", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates history reads through the request logger", async () => {
    const response = Response.json({
      currentTermsVersion: "terms-2026-10-19.1",
    });
    mocks.getTermsAcceptances.mockResolvedValue(response);
    const request = new Request("https://test/api/privacy/terms-acceptances");

    await expect(GET(request)).resolves.toBe(response);
    expect(mocks.getTermsAcceptances).toHaveBeenCalledWith(request);
  });

  it("delegates the acceptance write to the authenticated controller", async () => {
    const response = Response.json({ recorded: true });
    mocks.acceptCurrentTerms.mockResolvedValue(response);
    const request = new Request("https://test/api/privacy/terms-acceptances", {
      method: "POST",
      body: JSON.stringify({ termsVersion: "terms-2026-10-19.1" }),
    });

    await expect(POST(request)).resolves.toBe(response);
    expect(mocks.acceptCurrentTerms).toHaveBeenCalledWith(request);
  });
});
