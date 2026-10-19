// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({
  getUser: vi.fn(),
  headers: vi.fn(async () => new Headers()),
  redirect: vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

vi.mock("next/headers", () => ({ headers: route.headers }));
vi.mock("next/navigation", () => ({ redirect: route.redirect }));
vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: route.getUser,
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import PublicHomePage from "@/app/(public)/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("public home route", () => {
  it("serves the landing anonymously", async () => {
    route.getUser.mockResolvedValueOnce(null);
    render(await PublicHomePage());

    expect(
      screen.getByRole("heading", {
        name: "Organize seus investimentos em um só lugar.",
      }),
    ).toBeTruthy();
  });

  it("routes an authenticated visitor to the dashboard", async () => {
    route.getUser.mockResolvedValueOnce({ id: "user-1" });

    await expect(PublicHomePage()).rejects.toThrow("REDIRECT:/dashboard");
    expect(route.redirect).toHaveBeenCalledWith("/dashboard");
  });
});
