/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock("@/app/study-list/_components/study-list-dashboard", () => ({
  StudyListDashboard: () => <section aria-label="Lista" />,
}));

import StudyListPage from "@/app/study-list/page";

afterEach(cleanup);

describe("StudyListPage", () => {
  it("renders the app shell and list dashboard without main analysis navigation", () => {
    render(StudyListPage());
    expect(
      screen.getByRole("heading", { name: "Lista de estudo" }),
    ).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByRole("region", { name: "Lista" })).toBeTruthy();
  });
});
