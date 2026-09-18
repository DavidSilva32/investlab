// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CdiRateIndicator } from "@/app/portfolio/_components/cdi-rate-indicator";

describe("CdiRateIndicator", () => {
  it("shows the configured CDI percentage", () => {
    expect(
      renderToStaticMarkup(<CdiRateIndicator percentage="110" />),
    ).toContain("110% do CDI");
  });

  it("does not render without a configured percentage", () => {
    expect(renderToStaticMarkup(<CdiRateIndicator percentage={null} />)).toBe(
      "",
    );
    expect(
      renderToStaticMarkup(<CdiRateIndicator percentage={undefined} />),
    ).toBe("");
  });
});
