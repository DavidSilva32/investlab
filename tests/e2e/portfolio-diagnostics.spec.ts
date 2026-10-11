import { expect, test, type Page } from "@playwright/test";
import { getPortfolioConcentration } from "../../src/lib/portfolio-concentration";
import { getPortfolioInsights } from "../../src/lib/portfolio-insights";
import { addSignedInSession } from "./helpers/session";

const positions = [
  { id: "valued", product: "Posição informada", totalValue: "1000.00" },
  { id: "unvalued", product: "Posição sem valor", totalValue: null },
].map((position) => ({
  ...position,
  assetCode: null,
  institution: "Instituição de teste",
  indexer: null,
  issuedAt: null,
  maturityAt: null,
  quantity: "1",
  referenceDate: "2026-10-01",
  classification: { assetClass: null, subClass: null, geography: null },
  classificationSource: "unclassified",
}));

async function mockPortfolio(page: Page) {
  const concentrations = Object.fromEntries(
    (["asset", "assetClass", "subClass", "geography"] as const).map(
      (dimension) => [
        dimension,
        getPortfolioConcentration(positions, dimension),
      ],
    ),
  );
  // Catch every API request: these browser tests never reach the shared database.
  await page.route("**/api/**", (route) => {
    const request = route.request();
    if (request.method() !== "GET") return route.abort("blockedbyclient");
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/portfolio") {
      return route.fulfill({
        json: {
          positions,
          movements: [],
          insights: getPortfolioInsights(positions),
          referenceRates: { selic: null, cdi: null },
        },
      });
    }
    if (pathname === "/api/portfolio/allocation") {
      return route.fulfill({
        json: {
          positions,
          concentrations,
          classDistribution: concentrations.assetClass,
        },
      });
    }
    if (pathname === "/api/portfolio/monthly-review") {
      return route.fulfill({
        json: {
          availablePeriods: [],
          history: [],
          selectedPeriod: null,
          untrackedManualPositionCount: 0,
          status: "no_history",
          dateAlignment: "unavailable",
          compositionCoverage: "unknown",
          current: null,
          previous: null,
          observedChangeCents: null,
          gapMonths: 0,
          flowSeparation: {
            status: "unavailable",
            explanation: "Não é possível separar aportes de rendimento.",
          },
        },
      });
    }
    return route.abort("blockedbyclient");
  });
  await addSignedInSession(page);
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`diagnostic actions preserve accessible navigation with ${reducedMotion} motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await mockPortfolio(page);
    await page.goto("/portfolio");
    await expect(
      page.getByText("Distribuição por classes incompleta"),
    ).toBeVisible();
    const row = page
      .getByRole("list", { name: "Pontos para revisar na carteira" })
      .locator("li")
      .filter({ hasText: "Distribuição por classes incompleta" });
    await expect(row).toHaveCSS(
      "animation-name",
      reducedMotion === "reduce" ? "none" : "motion-reveal",
    );

    await page
      .getByRole("button", {
        name: "Entender: Distribuição por classes incompleta",
      })
      .click();
    const explanation = page.locator(".motion-popover");
    await expect(explanation).toBeVisible();
    await expect(explanation).toContainText("valor conhecido sem classe");
    await expect(explanation).toHaveCSS(
      "animation-name",
      reducedMotion === "reduce" ? "none" : "motion-fade-in",
    );
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Revisar classes" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Metas pessoais e dados detalhados",
    });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/panel=classification/);
    await expect(dialog).toHaveAttribute("data-motion-side", "right");
    await expect(dialog).toHaveCSS(
      "animation-name",
      reducedMotion === "reduce" ? "none" : "motion-panel-in",
    );
    await expect
      .poll(() =>
        dialog.evaluate((element) => element.contains(document.activeElement)),
      )
      .toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Revisar classes" }),
    ).toBeFocused();
  });
}

test("mobile diagnostics remain operable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockPortfolio(page);
  await page.goto("/portfolio");
  await page.getByRole("button", { name: "Revisar classes" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Revisar classes" }),
  ).toBeFocused();
});
