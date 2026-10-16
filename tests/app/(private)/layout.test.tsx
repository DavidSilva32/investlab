import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { getAuthenticatedUser } from "@/infrastructure/auth/authorization";
import PrivateLayout from "@/app/(private)/layout";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: vi.fn(),
}));

describe("PrivateLayout", () => {
  it("redirects when the Better Auth session has no user", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);

    await expect(
      PrivateLayout({ children: "private" as unknown as ReactNode }),
    ).rejects.toThrow("redirect:/entrar");
  });

  it("renders private pages after validating the session", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      id: "user-1",
      email: "user@example.com",
      role: "USER",
    } as never);
    const children = "private" as unknown as ReactNode;

    await expect(PrivateLayout({ children })).resolves.toBe(children);
  });
});
