// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnalysisSkeleton } from "@/app/analyses/_components/analysis-skeleton";

describe("AnalysisSkeleton", () => {
  it("announces the loading state", () => {
    render(<AnalysisSkeleton />);
    expect(screen.getByText("Carregando análise...")).toBeTruthy();
    expect(screen.getByRole("generic", { busy: true })).toBeTruthy();
  });
});
