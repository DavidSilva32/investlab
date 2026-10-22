// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardLearningEntry } from "@/app/(private)/_components/dashboard-learning-entry";

afterEach(cleanup);

describe("DashboardLearningEntry", () => {
  it("offers an accessible direct route to the available courses", () => {
    render(<DashboardLearningEntry />);

    expect(
      screen.getByRole("heading", { name: "Aprenda no seu ritmo" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Explorar cursos/ })
        .getAttribute("href"),
    ).toBe("/aprender");
  });
});
