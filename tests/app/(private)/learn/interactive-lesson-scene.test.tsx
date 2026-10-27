// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InteractiveLessonScene } from "@/app/(private)/learn/_components/interactive-lesson-scene";
import type { StrategyAssetClassId } from "@/lib/strategy-allocation";
import { Building2, Coins, Landmark as Bank } from "lucide-react";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const steps = [
  { label: "Emissor", detail: "Quem recebe o dinheiro", icon: Bank },
  { label: "Condições", detail: "Prazo e liquidez", icon: Building2 },
  { label: "Taxa", detail: "Como remunera", icon: Coins },
];

function setReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe("InteractiveLessonScene", () => {
  it.each<StrategyAssetClassId>([
    "fiis",
    "fixed_income",
    "brazilian_equities",
    "international_etfs",
  ])(
    "uses the class theme for %s and lets the learner explore steps",
    async (assetClass) => {
      setReducedMotion(false);
      render(
        <InteractiveLessonScene
          assetClass={assetClass}
          title="Explore um conceito"
          steps={steps}
        />,
      );

      expect(
        screen.getByRole("region", { name: "Explore um conceito" }),
      ).toBeTruthy();
      expect(
        screen.getByRole("group", {
          name: "Etapas para explorar este conceito",
        }),
      ).toBeTruthy();
      expect(screen.getByText("Quem recebe o dinheiro")).toBeTruthy();

      const rateButton = screen.getByRole("button", { name: "Taxa" });
      fireEvent.click(rateButton);

      expect(rateButton.getAttribute("aria-pressed")).toBe("true");
      expect(await screen.findByText("Como remunera")).toBeTruthy();
      expect(
        screen.getByTestId("interactive-lesson-step").textContent,
      ).toContain("Taxa");
    },
  );

  it("keeps selected lesson content clear with reduced motion", () => {
    setReducedMotion(true);
    render(
      <InteractiveLessonScene
        assetClass="fixed_income"
        title="Explore um conceito"
        steps={steps}
      />,
    );

    const conditionsButton = screen.getByRole("button", { name: "Condições" });
    fireEvent.click(conditionsButton);

    expect(conditionsButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Prazo e liquidez")).toBeTruthy();
    expect(
      screen.getByTestId("interactive-lesson-step").getAttribute("style"),
    ).not.toContain("transform");
  });

  it("renders nothing when no scene steps are provided", () => {
    render(
      <InteractiveLessonScene
        assetClass="fiis"
        title="Sem etapas"
        steps={[]}
      />,
    );

    expect(screen.queryByRole("region", { name: "Sem etapas" })).toBeNull();
  });
});
