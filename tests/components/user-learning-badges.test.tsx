// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserLearningBadges } from "@/components/user-learning-badges";

afterEach(cleanup);

describe("UserLearningBadges", () => {
  it("shows loading and retryable errors", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <UserLearningBadges
        courses={[]}
        loading
        error={null}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("Carregando");

    rerender(
      <UserLearningBadges
        courses={[]}
        loading={false}
        error="Falha ao carregar."
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Falha ao carregar.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows the empty state when the user has no approved course", () => {
    render(
      <UserLearningBadges
        courses={[
          { courseId: "fiis", passed: false, bestScore: 5, passedAt: null },
        ]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Seu primeiro emblema está à espera")).toBeTruthy();
  });

  it("shows only recognized approved courses with their score and medal", () => {
    render(
      <UserLearningBadges
        courses={[
          {
            courseId: "fiis",
            passed: true,
            bestScore: 8,
            passedAt: "2026-10-22",
          },
          { courseId: "unknown", passed: true, bestScore: 10, passedAt: null },
          {
            courseId: "fixed_income",
            passed: false,
            bestScore: 6,
            passedAt: null,
          },
        ]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Fundos imobiliários (FIIs)")).toBeTruthy();
    expect(screen.getByText("8,0")).toBeTruthy();
    expect(screen.queryByText("unknown")).toBeNull();
    expect(screen.queryByText("Renda fixa")).toBeNull();
  });

  it("keeps legacy approval badges without inventing a score", () => {
    render(
      <UserLearningBadges
        courses={[
          {
            courseId: "fiis",
            passed: true,
            bestScore: null,
            passedAt: "2026-10-22",
          },
        ]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Fundos imobiliários (FIIs)")).toBeTruthy();
    expect(screen.getByText("Aprovado")).toBeTruthy();
    expect(screen.queryByText("0,0")).toBeNull();
    expect(screen.queryByText("/10")).toBeNull();
  });
});
