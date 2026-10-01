import { describe, expect, it } from "vitest";
import { getPortfolioConcentration } from "@/lib/portfolio-concentration";

const positions = [
  {
    id: "1",
    product: "Fundo X",
    assetCode: "FNDX",
    issuer: null,
    totalValue: "800",
    estimatedValue: 900,
    referenceDate: "2026-09-20",
    estimatedThrough: "2026-09-22",
    classification: {
      assetClass: "Fundos",
      subClass: null,
      geography: "Global",
    },
  },
  {
    id: "2",
    product: "Fundo Y",
    assetCode: "FNDY",
    conversionDate: "2026-09-15",
    issuer: null,
    totalValue: "300",
    classification: {
      assetClass: "Fundos",
      subClass: "Multimercado",
      geography: null,
    },
  },
  {
    id: "3",
    product: "Produto sem valor",
    assetCode: null,
    issuer: null,
    totalValue: null,
    classification: { assetClass: null, subClass: null, geography: null },
  },
];

describe("getPortfolioConcentration", () => {
  it("groups matching assets and exposes the value and position coverage", () => {
    const result = getPortfolioConcentration(
      [
        ...positions,
        {
          ...positions[0],
          id: "4",
          totalValue: "50",
          estimatedValue: null,
          referenceDate: "2026-09-25",
        },
      ],
      "asset",
    );

    expect(result.totalValue).toBe(1250);
    expect(result.valuedPositions).toBe(3);
    expect(result.unvaluedPositions).toBe(1);
    expect(result.classifiedValue).toBe(1250);
    expect(result.unclassifiedValue).toBe(0);
    expect(result.groups[0]).toEqual({
      label: "FNDX",
      value: 950,
      percentage: 76,
    });
    expect(result.referenceDates).toEqual([
      "2026-09-15",
      "2026-09-22",
      "2026-09-25",
    ]);
  });

  it("keeps unknown classifications visible in the denominator", () => {
    const result = getPortfolioConcentration(positions, "assetClass");

    expect(result.groups).toEqual([
      { label: "Fundos", value: 1200, percentage: 100 },
    ]);
    expect(result.classifiedValue).toBe(1200);
    expect(result.unclassifiedValue).toBe(0);
  });

  it("reports unknown groups and invalid values without treating them as zero data", () => {
    const result = getPortfolioConcentration(
      [
        {
          ...positions[0],
          estimatedValue: null,
          totalValue: "not-a-number",
          classification: {
            assetClass: null,
            subClass: null,
            geography: null,
          },
        },
        {
          ...positions[2],
          totalValue: "100",
        },
      ],
      "geography",
    );

    expect(result.totalValue).toBe(100);
    expect(result.unvaluedPositions).toBe(1);
    expect(result.classifiedValue).toBe(0);
    expect(result.unclassifiedValue).toBe(100);
    expect(result.unclassifiedPositions).toBe(1);
    expect(result.groups[0].label).toContain("informada");
  });

  it("uses product and issuer labels when a position has no asset code", () => {
    const result = getPortfolioConcentration(
      [
        {
          ...positions[0],
          assetCode: null,
          issuer: "Emissor",
        },
      ],
      "asset",
    );

    expect(result.groups[0].label).toContain("Emissor");
  });

  it("shows positions without an asset code or product as an unknown group", () => {
    const result = getPortfolioConcentration(
      [
        {
          ...positions[0],
          assetCode: null,
          product: "  ",
          issuer: null,
        },
      ],
      "asset",
    );

    expect(result.groups[0].label).toBe("Ativo não identificado");
    expect(result.classifiedValue).toBe(0);
    expect(result.unclassifiedValue).toBe(900);
  });

  it("uses the product alone when an asset code and issuer are unavailable", () => {
    const result = getPortfolioConcentration(
      [
        {
          ...positions[0],
          assetCode: null,
          issuer: null,
        },
      ],
      "asset",
    );

    expect(result.groups[0].label).toBe("Fundo X");
  });
  it("keeps empty portfolios and zero denominators explicit", () => {
    expect(getPortfolioConcentration([], "assetClass")).toMatchObject({
      totalValue: 0,
      valuedPositions: 0,
      unvaluedPositions: 0,
      largestShare: 0,
      groups: [],
    });
    expect(
      getPortfolioConcentration(
        [
          {
            ...positions[0],
            estimatedValue: 0,
            totalValue: "0",
          },
        ],
        "asset",
      ),
    ).toMatchObject({
      totalValue: 0,
      largestShare: 0,
      groups: [{ percentage: 0 }],
    });
  });

  it("prepares the class chart remainder from exact canonical cents", () => {
    const manyPositions = Array.from({ length: 7 }, (_, index) => ({
      ...positions[0],
      id: `chart-${index}`,
      canonicalValueCents: String((7 - index) * 100),
      totalValue: null,
      estimatedValue: null,
      classification: {
        assetClass: `Classe ${index + 1}`,
        subClass: null,
        geography: null,
      },
    }));

    const result = getPortfolioConcentration(manyPositions, "assetClass");

    expect(result.chartGroups).toHaveLength(6);
    expect(result.chartGroups.at(-1)).toEqual({
      label: "Demais classes",
      value: 3,
      percentage: expect.closeTo((300 / 2800) * 100),
    });
  });

  it("handles explicit unvalued cents and all-zero chart remainders", () => {
    const unvalued = getPortfolioConcentration(
      [
        {
          ...positions[0],
          canonicalValueCents: null,
          totalValue: "100",
        },
      ],
      "assetClass",
    );
    expect(unvalued).toMatchObject({
      totalValueCents: "0",
      unvaluedPositions: 1,
    });

    const zeroGroups = Array.from({ length: 7 }, (_, index) => ({
      ...positions[0],
      id: `zero-${index}`,
      canonicalValueCents: "0",
      totalValue: null,
      estimatedValue: null,
      classification: {
        assetClass: `Classe ${index}`,
        subClass: null,
        geography: null,
      },
    }));
    expect(
      getPortfolioConcentration(zeroGroups, "assetClass").chartGroups.at(-1),
    ).toMatchObject({ value: 0, percentage: 0 });
  });

  it("uses labels as a stable tie-breaker and accepts legacy values", () => {
    const tied = getPortfolioConcentration(
      [
        {
          ...positions[0],
          id: "tie-z",
          canonicalValueCents: undefined,
          totalValue: "10",
          classification: {
            assetClass: "Classe Z",
            subClass: null,
            geography: null,
          },
        },
        {
          ...positions[0],
          id: "tie-a",
          canonicalValueCents: undefined,
          totalValue: "10",
          classification: {
            assetClass: "Classe A",
            subClass: null,
            geography: null,
          },
        },
      ],
      "assetClass",
    );

    expect(tied.groups.map(({ label }) => label)).toEqual([
      "Classe A",
      "Classe Z",
    ]);
    expect(tied.totalValueCents).toBe("180000");
  });

  it("sorts lower valued groups after larger groups", () => {
    const result = getPortfolioConcentration(
      [
        {
          ...positions[0],
          id: "small",
          canonicalValueCents: "100",
          totalValue: null,
          estimatedValue: null,
          classification: {
            assetClass: "Classe pequena",
            subClass: null,
            geography: null,
          },
        },
        {
          ...positions[0],
          id: "large",
          canonicalValueCents: "300",
          totalValue: null,
          estimatedValue: null,
          classification: {
            assetClass: "Classe grande",
            subClass: null,
            geography: null,
          },
        },
        {
          ...positions[0],
          id: "middle",
          canonicalValueCents: "200",
          totalValue: null,
          estimatedValue: null,
          classification: {
            assetClass: "Classe média",
            subClass: null,
            geography: null,
          },
        },
      ],
      "assetClass",
    );

    expect(result.groups.map(({ label }) => label)).toEqual([
      "Classe grande",
      "Classe média",
      "Classe pequena",
    ]);
  });
});
