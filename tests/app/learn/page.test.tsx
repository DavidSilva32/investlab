// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LearnPage from "@/app/learn/page";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => <div data-title={title}>{children}</div>,
}));

vi.mock("@/app/learn/_components/learning-library", () => ({
  LearningLibrary: ({ selectedClass }: { selectedClass: string | null }) => (
    <output>{selectedClass ?? "nenhuma classe"}</output>
  ),
}));

afterEach(cleanup);

describe("LearnPage", () => {
  it("opens FIIs by default when no class parameter is provided", async () => {
    render(await LearnPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("fiis")).toBeTruthy();
    expect(document.querySelector("[data-title='Aprender']")).toBeTruthy();
  });

  it("keeps invalid or repeated class parameters unselected", async () => {
    for (const requestedClass of ["unknown", ["fiis", "fixed_income"]]) {
      cleanup();
      render(
        await LearnPage({
          searchParams: Promise.resolve({ class: requestedClass }),
        }),
      );
      expect(screen.getByText("nenhuma classe")).toBeTruthy();
    }
  });
});
