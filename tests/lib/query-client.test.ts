// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import { createQueryClient } from "@/lib/query-client";

describe("createQueryClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets in-memory cache and revalidation defaults", () => {
    const client = createQueryClient();

    expect(client.getDefaultOptions()).toMatchObject({
      queries: {
        staleTime: 30_000,
        gcTime: 300_000,
        refetchOnWindowFocus: true,
        retry: false,
      },
      mutations: { retry: false },
    });
    client.clear();
  });

  it("clears private cached data and signals the app after a 401 query", async () => {
    const client = createQueryClient();
    const unauthorized = vi.fn();
    window.addEventListener("auth:unauthorized", unauthorized);
    client.setQueryData(["private"], { balance: 100 });

    await expect(
      client.fetchQuery({
        queryKey: ["unauthorized"],
        queryFn: async () => {
          throw new ApiError("Sessão expirada.", 401);
        },
      }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(client.getQueryData(["private"])).toBeUndefined();
    expect(unauthorized).toHaveBeenCalledTimes(1);
    window.removeEventListener("auth:unauthorized", unauthorized);
  });

  it("retains cache for non-auth errors", async () => {
    const client = createQueryClient();
    const unauthorized = vi.fn();
    window.addEventListener("auth:unauthorized", unauthorized);
    client.setQueryData(["private"], { balance: 100 });

    await expect(
      client.fetchQuery({
        queryKey: ["forbidden"],
        queryFn: async () => {
          throw new ApiError("Acesso negado.", 403);
        },
      }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(client.getQueryData(["private"])).toEqual({ balance: 100 });
    expect(unauthorized).not.toHaveBeenCalled();
    window.removeEventListener("auth:unauthorized", unauthorized);
    client.clear();
  });

  it("clears private cached data after an unauthorized mutation", async () => {
    const client = createQueryClient();
    const unauthorized = vi.fn();
    window.addEventListener("auth:unauthorized", unauthorized);
    client.setQueryData(["private"], { balance: 100 });

    await expect(
      client
        .getMutationCache()
        .build(client, {
          mutationFn: async () => {
            throw new ApiError("Sessão expirada.", 401);
          },
        })
        .execute(undefined),
    ).rejects.toBeInstanceOf(ApiError);

    expect(client.getQueryData(["private"])).toBeUndefined();
    expect(unauthorized).toHaveBeenCalledTimes(1);
    window.removeEventListener("auth:unauthorized", unauthorized);
  });
});
