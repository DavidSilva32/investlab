// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardReviewPositions } from "@/app/_components/dashboard-review-positions";

afterEach(cleanup);

describe("DashboardReviewPositions", () => {
  it("offers a review link and singular copy for one unvalued position", () => {
    render(<DashboardReviewPositions count={1} />);

    expect(
      screen.getByRole("heading", { name: "Dados para revisar" }),
    ).toBeTruthy();
    expect(screen.getByText("1 posição sem valor atual")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Revisar posições" })
        .getAttribute("href"),
    ).toBe("/portfolio?view=positions");
  });

  it("uses plural copy for multiple positions and hides the card at zero", () => {
    const { rerender } = render(<DashboardReviewPositions count={2} />);
    expect(screen.getByText("2 posições sem valor atual")).toBeTruthy();

    rerender(<DashboardReviewPositions count={0} />);
    expect(screen.queryByRole("region")).toBeNull();
  });
});
