// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FiiPropertyExplorer } from "@/app/(private)/learn/_components/fii-property-explorer";
import { assetClassLearningContent } from "@/lib/asset-class-learning";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const examples = assetClassLearningContent.fiis.courseLessons[1].visuals ?? [];

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

describe("FiiPropertyExplorer", () => {
  it("switches the illustrative scene and its explanation when an example is chosen", async () => {
    setReducedMotion(false);
    render(<FiiPropertyExplorer examples={examples} />);

    expect(
      screen.getByRole("img", { name: examples[0].imageAlt }),
    ).toBeTruthy();
    expect(screen.getByText(examples[0].description)).toBeTruthy();

    const warehouseButton = screen.getByRole("button", {
      name: examples[1].title,
    });
    fireEvent.click(warehouseButton);

    expect(warehouseButton.getAttribute("aria-pressed")).toBe("true");
    expect(
      await screen.findByRole("img", { name: examples[1].imageAlt }),
    ).toBeTruthy();
    expect(screen.getByText(examples[1].description)).toBeTruthy();
    expect(
      screen.queryByRole("img", { name: examples[0].imageAlt }),
    ).toBeNull();
    expect(screen.getByText("Como isso entra no fundo")).toBeTruthy();
    expect(
      screen.getByRole("group", {
        name: "Exemplo ilustrativo de composição de um fundo",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Um FII pode reunir ativos como este, conforme a estratégia do fundo.",
      ),
    ).toBeTruthy();
  });

  it("keeps the selected example understandable when reduced motion is preferred", async () => {
    setReducedMotion(true);
    render(<FiiPropertyExplorer examples={examples} />);

    const residentialButton = screen.getByRole("button", {
      name: examples[2].title,
    });
    fireEvent.click(residentialButton);

    expect(
      await screen.findByRole("img", { name: examples[2].imageAlt }),
    ).toBeTruthy();
    expect(residentialButton.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByTestId("fii-property-animation").getAttribute("style"),
    ).not.toContain("transform");
  });

  it("renders no explorer when there are no examples", () => {
    render(<FiiPropertyExplorer examples={[]} />);

    expect(
      screen.queryByRole("region", {
        name: "Exemplos de imóveis de fundos imobiliários",
      }),
    ).toBeNull();
  });
});
