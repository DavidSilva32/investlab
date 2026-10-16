import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { getAuthenticatedUser } from "@/infrastructure/auth/authorization";
import AdminUsersLayout from "@/app/(private)/admin/users/layout";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: vi.fn(),
}));

describe("AdminUsersLayout", () => {
  it("requires an authenticated user", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);
    await expect(
      AdminUsersLayout({ children: "admin" as unknown as ReactNode }),
    ).rejects.toThrow("redirect:/entrar");
  });

  it("denies users without the ADMIN role", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      id: "user-1",
      email: "user@example.com",
      role: "USER",
    } as never);
    await expect(
      AdminUsersLayout({ children: "admin" as unknown as ReactNode }),
    ).rejects.toThrow("redirect:/");
  });

  it("renders administration for ADMIN users", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
    } as never);
    const children = "admin" as unknown as ReactNode;
    await expect(AdminUsersLayout({ children })).resolves.toBe(children);
  });
});
