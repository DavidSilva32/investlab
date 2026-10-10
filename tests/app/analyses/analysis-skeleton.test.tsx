// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnalysisSkeleton } from "@/app/analyses/_components/analysis-skeleton";

afterEach(cleanup);

describe("AnalysisSkeleton", () => {
  it("announces the loading state", () => {
    render(<AnalysisSkeleton />);
    expect(screen.getByText("Carregando análise...")).toBeTruthy();
    expect(screen.getByRole("generic", { busy: true })).toBeTruthy();
  });
  it("shows the selected instrument logo before financial data arrives", () => {
    render(<AnalysisSkeleton ticker="BBAS3" />);
    expect(
      screen
        .getByRole("img", { name: "Identidade de BBAS3" })
        .querySelector("img")
        ?.getAttribute("src"),
    ).toBe("https://icons.brapi.dev/icons/BBAS3.svg");
    expect(screen.getByText("Carregando análise...")).toBeTruthy();
  });
});
