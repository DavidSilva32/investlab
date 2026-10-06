// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import NotFound from "@/app/not-found";

describe("not found page", () => {
  it("renders a semantic 404 page with a route back to the dashboard", () => {
    const markup = renderToStaticMarkup(<NotFound />);

    expect(markup).toContain("<main");
    expect(markup).toMatch(/<h1[^>]*>[^<]+<\/h1>/);
    expect(markup).toContain("Página não encontrada");
    expect(markup).toContain(
      "O endereço que você acessou não existe ou foi alterado.",
    );
    expect(markup).toContain("404");
    expect(markup).toContain('href="/"');
    expect(markup).toContain("Voltar ao Dashboard");
    expect(markup).toContain('aria-label="Alternar tema"');
  });
});
