import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { getAuthenticatedUser } from "@/infrastructure/auth/authorization";
import PrivateLayout from "@/app/(private)/layout";
import { ShellUserProvider } from "@/components/app-shell";
import { privacyCenterService } from "@/backend/services/privacy-center.service";
import { TermsAcceptanceGate } from "@/app/(private)/_components/terms-acceptance-gate";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: vi.fn(),
}));
vi.mock("@/backend/services/privacy-center.service", () => ({
  privacyCenterService: { hasAcceptedCurrentTerms: vi.fn() },
}));

describe("PrivateLayout", () => {
  it("redirects when the Better Auth session has no user", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);

    await expect(
      PrivateLayout({ children: "private" as unknown as ReactNode }),
    ).rejects.toThrow("redirect:/entrar");
  });

  it("renders private pages after validating the session", async () => {
    vi.mocked(
      privacyCenterService.hasAcceptedCurrentTerms,
    ).mockResolvedValueOnce(true);
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      id: "user-1",
      name: "Test User",
      email: "user@example.com",
      role: "USER",
    } as never);
    const children = "private" as unknown as ReactNode;

    const result = await PrivateLayout({ children });
    expect(result.type).toBe(ShellUserProvider);
    expect(result.props.user).toEqual({
      name: "Test User",
      email: "user@example.com",
      role: "USER",
    });
    expect(result.props.children).toBe(children);
  });

  it("normalizes a missing profile name and preserves the ADMIN role for the shell", async () => {
    vi.mocked(
      privacyCenterService.hasAcceptedCurrentTerms,
    ).mockResolvedValueOnce(true);
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      id: "admin-1",
      name: null,
      email: "admin@example.com",
      role: "ADMIN",
    } as never);
    const children = "private admin" as unknown as ReactNode;

    const result = await PrivateLayout({ children });

    expect(result.type).toBe(ShellUserProvider);
    expect(result.props.user).toEqual({
      name: "",
      email: "admin@example.com",
      role: "ADMIN",
    });
  });

  it("renders only the required Terms gate until the current version is accepted", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      id: "user-1",
      name: "Test User",
      email: "user@example.com",
      role: "USER",
    } as never);
    vi.mocked(
      privacyCenterService.hasAcceptedCurrentTerms,
    ).mockResolvedValueOnce(false);

    const result = await PrivateLayout({
      children: "private financial data" as unknown as ReactNode,
    });

    expect(result.type).toBe(ShellUserProvider);
    expect(result.props.children.type).toBe(TermsAcceptanceGate);
    expect(result.props.children.props.version).toBe("termos-2026-10-19.1");
  });
});
