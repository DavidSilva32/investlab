/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
afterEach(cleanup);
import { AnalysisExperienceNav } from "@/app/analyses/_components/analysis-experience-nav";

describe("AnalysisExperienceNav", () => {
  it("links to screener and marks exploration active", () => {
    render(<AnalysisExperienceNav active="explore" />);
    expect(
      screen.getByRole("navigation", { name: "Experiências de análise" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Explorar ações" }).getAttribute("href"),
    ).toBe("/analyses/screener");
    expect(
      screen.getByRole("link", { name: "Analisar ação" }).getAttribute("href"),
    ).toBe("/analyses?ticker=PETR4");
  });

  it("marks individual analysis active", () => {
    render(<AnalysisExperienceNav active="analysis" />);
    expect(screen.getByRole("link", { name: "Analisar ação" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Explorar ações" })).toBeTruthy();
  });
});
