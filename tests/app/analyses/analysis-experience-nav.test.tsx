/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnalysisExperienceNav } from "@/app/analyses/_components/analysis-experience-nav";

afterEach(cleanup);

describe("AnalysisExperienceNav", () => {
  it("shows all three experiences and marks Descobrir as the entry point", () => {
    render(<AnalysisExperienceNav active="discover" />);
    expect(
      screen.getByRole("navigation", { name: "Experiências de análise" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Descobrir" }).getAttribute("href"),
    ).toBe("/analyses");
    expect(
      screen.getByRole("link", { name: "Explorar" }).getAttribute("href"),
    ).toBe("/analyses/screener");
    expect(
      screen
        .getByRole("link", { name: "Descobrir" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it.each([
    ["explore", "Explorar", "/analyses/screener"],
    ["analysis", "Analisar", "/analyses?ticker=PETR4"],
  ] as const)("marks %s active", (active, label, href) => {
    render(<AnalysisExperienceNav active={active} />);
    expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(
      href,
    );
    expect(
      screen.getByRole("link", { name: label }).getAttribute("aria-current"),
    ).toBe("page");
  });
});
