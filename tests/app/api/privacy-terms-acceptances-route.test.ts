import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTermsAcceptances: vi.fn(),
}));
vi.mock("@/backend/controllers/privacy-center.controller", () => ({
  privacyCenterController: mocks,
}));
vi.mock("@/infrastructure/logging/api-request", () => ({
  withApiRequestLogging: (_method: string, _path: string, handler: unknown) =>
    handler,
}));

import { GET } from "@/app/api/privacy/terms-acceptances/route";

describe("GET /api/privacy/terms-acceptances", () => {
  beforeEach(() => mocks.getTermsAcceptances.mockReset());

  it("delegates to the privacy center controller with request logging", async () => {
    const response = Response.json({ currentTermsVersion: "2026-10-17" });
    mocks.getTermsAcceptances.mockResolvedValue(response);
    const request = new Request("https://test/api/privacy/terms-acceptances");

    await expect(GET(request)).resolves.toBe(response);
    expect(mocks.getTermsAcceptances).toHaveBeenCalledWith(request);
  });
});
