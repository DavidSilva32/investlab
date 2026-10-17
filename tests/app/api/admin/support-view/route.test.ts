import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  start: vi.fn(),
  end: vi.fn(),
}));

vi.mock("@/backend/controllers/admin-support-view.controller", () => ({
  adminSupportViewController: {
    get: mocks.get,
    start: mocks.start,
    end: mocks.end,
  },
}));

vi.mock("@/infrastructure/logging/api-request", () => ({
  withApiRequestLogging: (
    _method: string,
    _route: string,
    handler: (request: Request) => Promise<Response>,
  ) => handler,
}));

import { DELETE, GET, POST } from "@/app/api/admin/support-view/route";

describe("admin support-view route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(Response.json({ supportView: null }));
    mocks.start.mockResolvedValue(Response.json({ supportView: null }));
    mocks.end.mockResolvedValue(Response.json({ supportView: null }));
  });

  it("delegates GET, POST, and DELETE to their controller operations", async () => {
    const getRequest = new Request(
      "https://investlab.test/api/admin/support-view",
    );
    const postRequest = new Request(
      "https://investlab.test/api/admin/support-view",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUserId: "customer-1" }),
      },
    );
    const deleteRequest = new Request(
      "https://investlab.test/api/admin/support-view",
      {
        method: "DELETE",
      },
    );

    expect(await GET(getRequest)).toBeInstanceOf(Response);
    expect(await POST(postRequest)).toBeInstanceOf(Response);
    expect(await DELETE(deleteRequest)).toBeInstanceOf(Response);
    expect(mocks.get).toHaveBeenCalledWith(getRequest);
    expect(mocks.start).toHaveBeenCalledWith(postRequest);
    expect(mocks.end).toHaveBeenCalledWith(deleteRequest);
  });
});
