import { expect, test } from "@playwright/test";
import { addSignedInSession } from "./helpers/session";

const unavailableMetric = {
  value: null,
  referenceDate: null,
  periodStart: null,
  periodBasis: null,
  sourceDocument: null,
  sourceSummary: null,
  marketDataDate: null,
  accountProvenance: null,
  unavailableReason: "Base comparável indisponível.",
};

function comparisonCompany(
  ticker: string,
  roe: number,
  identityVerified: boolean,
) {
  return {
    ticker,
    selectedTickers: [ticker],
    name: `Empresa ${ticker}`,
    cnpj: `3300016700010${ticker === "PETR4" ? "1" : "2"}`,
    cvmCode: ticker === "PETR4" ? "009512" : "004172",
    sector: "Petróleo e Gás",
    metadataUpdatedAt: "2026-10-01T00:00:00.000Z",
    identityVerified,
    fundamentals: {
      roe: {
        value: roe,
        referenceDate: "2026-06-30",
        periodStart: "2025-07-01",
        periodBasis: "trailing_twelve_months",
        sourceDocument: "ITR",
        sourceSummary: "DFP + ITR em períodos compatíveis",
        marketDataDate: null,
        accountProvenance: "CVM consolidado",
        unavailableReason: null,
      },
      netMargin: unavailableMetric,
    },
    valuation: { pe: unavailableMetric, pb: unavailableMetric },
  };
}

test("compares only verified ROE signals using the shared criteria preference", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "investlab:analyses:stock-criteria:v1",
      JSON.stringify({ maximumPe: 15, minimumRoePercent: 10 }),
    );
  });
  await page.route("**/api/analyses/portfolio-opportunities", (route) =>
    route.fulfill({
      json: {
        opportunities: [],
        asOf: "2026-10-10",
        classificationStatus: "resolved",
        classificationLookupFailures: 0,
        settings: { bazinTargetYield: 6, initializedAt: null },
      },
    }),
  );
  await page.route("**/api/analyses/stocks/search?**", (route) => {
    const ticker = new URL(route.request().url()).searchParams
      .get("q")
      ?.toUpperCase();
    const results = ticker?.startsWith("PETR")
      ? [{ ticker: "PETR4", name: "Petróleo Brasileiro S.A." }]
      : ticker?.startsWith("VALE")
        ? [{ ticker: "VALE3", name: "Vale S.A." }]
        : [];
    return route.fulfill({ json: { results } });
  });
  await page.route("**/api/analyses/companies/compare", (route) =>
    route.fulfill({
      json: {
        sector: "Petróleo e Gás",
        sectorMetadataAsOf: "2026-10-01T00:00:00.000Z",
        companies: [
          comparisonCompany("PETR4", 12, true),
          comparisonCompany("VALE3", 18, false),
        ],
      },
    }),
  );

  await addSignedInSession(page);
  await page.goto("/analyses");
  await page.getByRole("tab", { name: "Comparar empresas" }).click();
  const search = page.getByRole("combobox", { name: "Pesquisar ação" });
  await search.fill("PETR");
  await page.getByRole("option", { name: /PETR4/ }).click();
  await search.fill("VALE");
  await page.getByRole("option", { name: /VALE3/ }).click();
  await page.getByRole("button", { name: "Comparar selecionadas" }).click();

  await expect(page.getByText("ROE atende · mín. 10%")).toBeVisible();
  await expect(page.getByText("ROE sem base confiável")).toBeVisible();
  await expect(
    page.getByText(/Sem ranking, pontuação ou recomendação/),
  ).toBeVisible();
});
