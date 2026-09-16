import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RootLayout, { metadata } from "@/app/layout";

describe("RootLayout", () => {
  it("declares application metadata and Portuguese document language", () => {
    expect(metadata).toMatchObject({ title: "InvestLab" });
    expect(
      renderToStaticMarkup(
        <RootLayout>
          <main>content</main>
        </RootLayout>,
      ),
    ).toContain('<html lang="pt-BR">');
  });
});
