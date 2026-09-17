// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LoginLoading from "@/app/login/loading";
describe("LoginLoading", () => {
  it("renders an accessible login skeleton", () => {
    const html = renderToStaticMarkup(<LoginLoading />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Carregando acesso");
    expect(html).toContain("animate-pulse");
  });
});
