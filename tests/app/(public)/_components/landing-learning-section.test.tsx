// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({
    alt,
    fill: _fill,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

import { LandingLearningSection } from "@/app/(public)/_components/landing-learning-section";

afterEach(cleanup);

describe("LandingLearningSection", () => {
  it("presents only the available class videos and invite-based access", () => {
    render(<LandingLearningSection />);

    expect(
      screen.getByRole("heading", {
        name: "Você não precisa virar especialista para dar o primeiro passo.",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Renda fixa" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ações e BDRs" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "ETFs internacionais" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Fundos imobiliários (FIIs)" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Acesso pessoal disponibilizado por convite."),
    ).toBeTruthy();
    expect(screen.queryByText(/questionário|aulas estruturadas/i)).toBeNull();
  });
});
