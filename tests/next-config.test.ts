import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("localized App Router paths", () => {
  it("rewrites the Portuguese public URLs to English route segments", async () => {
    const rewrites = await nextConfig.rewrites?.();
    expect(rewrites).toEqual(
      expect.arrayContaining([
        { source: "/entrar", destination: "/login" },
        { source: "/carteira", destination: "/portfolio" },
        { source: "/analises/filtros", destination: "/analyses/screener" },
        { source: "/admin/usuarios", destination: "/admin/users" },
        { source: "/convite/:token", destination: "/invite/:token" },
        {
          source: "/redefinir-senha/:token",
          destination: "/reset-password/:token",
        },
      ]),
    );
  });

  it("redirects prior English URLs to their Portuguese canonical path", async () => {
    const redirects = await nextConfig.redirects?.();
    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: "/portfolio", destination: "/carteira", permanent: false },
        { source: "/login", destination: "/entrar", permanent: false },
        {
          source: "/reset-password/:token",
          destination: "/redefinir-senha/:token",
          permanent: false,
        },
      ]),
    );
  });
});
