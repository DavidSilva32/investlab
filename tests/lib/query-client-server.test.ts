// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import { createQueryClient } from "@/lib/query-client";

describe("createQueryClient during server rendering", () => {
  it("does not try to clear browser state when a server query gets a 401", async () => {
    const client = createQueryClient();
    client.setQueryData(["private"], { balance: 100 });

    await expect(
      client.fetchQuery({
        queryKey: ["unauthorized"],
        queryFn: async () => {
          throw new ApiError("Sessão expirada.", 401);
        },
      }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(client.getQueryData(["private"])).toEqual({ balance: 100 });
    client.clear();
    vi.restoreAllMocks();
  });
});
