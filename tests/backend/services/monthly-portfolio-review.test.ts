import { describe, expect, it } from "vitest";
import {
  calculateMonthlyPortfolioReview,
  type ManualPortfolioObservation,
  type MonthlyPortfolioSnapshot,
} from "@/backend/services/monthly-portfolio-review";

const snapshot = (
  id: string,
  referenceDate: string | null,
  totalValues: Array<string | null>,
  options: {
    createdAt?: Date | string;
    importedAt?: Date | string;
    source?: string;
    valuationSources?: Array<string | null>;
    identities?: Array<string | null>;
  } = {},
): MonthlyPortfolioSnapshot => ({
  id,
  referenceDate,
  createdAt: options.createdAt ?? `${referenceDate ?? "2026-01-01"}T12:00:00Z`,
  importedAt:
    options.importedAt ??
    options.createdAt ??
    `${referenceDate ?? "2026-01-01"}T12:00:00Z`,
  source: options.source ?? "B3",
  positions: totalValues.map((totalValue, index) => ({
    identity: options.identities
      ? (options.identities[index] ?? null)
      : `asset-${index + 1}`,
    totalValue,
    valuationSource: options.valuationSources
      ? (options.valuationSources[index] ?? null)
      : "FECHAMENTO",
  })),
});

const manualObservation = (
  overrides: Partial<ManualPortfolioObservation> = {},
): ManualPortfolioObservation => ({
  assetKey: "manual:voo",
  product: "VOO",
  assetCode: "VOO",
  currency: "USD",
  totalValue: "1000.00",
  convertedValueBrl: "5000.00",
  positionDate: "2026-01-10",
  conversionDate: "2026-01-10",
  status: "ACTIVE",
  recordedAt: "2026-01-10T12:00:00.000Z",
  ...overrides,
});

describe("monthly portfolio review calculation", () => {
  it("reports no history when there are no dated snapshots", () => {
    expect(calculateMonthlyPortfolioReview([])).toMatchObject({
      availablePeriods: [],
      selectedPeriod: null,
      status: "no_history",
      current: null,
      previous: null,
      observedChangeCents: null,
    });
    expect(
      calculateMonthlyPortfolioReview([snapshot("undated", null, ["10.00"])]),
    ).toMatchObject({ status: "no_history", selectedPeriod: null });
  });

  it("rejects malformed calendar dates and lets a requested month show its empty state", () => {
    const snapshots = [
      snapshot("bad-shape", "2026-1-01", ["10.00"]),
      snapshot("bad-day", "2026-02-30", ["10.00"]),
      snapshot("bad-month", "2026-13-01", ["10.00"]),
    ];
    expect(calculateMonthlyPortfolioReview(snapshots)).toMatchObject({
      status: "no_history",
      availablePeriods: [],
    });
    expect(calculateMonthlyPortfolioReview(snapshots, "2026-02")).toMatchObject(
      {
        status: "missing_snapshot",
        selectedPeriod: "2026-02",
        availablePeriods: [],
      },
    );
  });

  it("compares the latest close in the selected month with the latest earlier month", () => {
    const snapshots = [
      snapshot("jan", "2026-01-29", ["100.00"]),
      snapshot("feb-old", "2026-02-26", ["105.00"]),
      snapshot("feb-latest", "2026-02-27", ["110.00"]),
      snapshot("mar-old-import", "2026-03-29", ["118.00"], {
        createdAt: "2026-03-30T12:00:00Z",
      }),
      snapshot("mar-latest-import", "2026-03-29", ["120.00"], {
        createdAt: "2026-03-31T12:00:00Z",
        source: "B3",
        valuationSources: ["MTM"],
      }),
      snapshot("mar-older-date", "2026-03-28", ["119.00"], {
        createdAt: "2026-04-01T12:00:00Z",
      }),
    ];

    const review = calculateMonthlyPortfolioReview(snapshots, "2026-03");
    expect(review).toMatchObject({
      availablePeriods: ["2026-03", "2026-02", "2026-01"],
      selectedPeriod: "2026-03",
      status: "ready",
      observedChangeCents: "1000",
      gapMonths: 0,
      current: {
        referenceDate: "2026-03-29",
        importedAt: "2026-03-31T12:00:00.000Z",
        knownValueCents: "12000",
        sources: ["B3"],
        valuationMethods: ["MTM"],
      },
      previous: {
        referenceDate: "2026-02-27",
        knownValueCents: "11000",
      },
      flowSeparation: { status: "unavailable" },
    });
  });

  it("uses the latest imported file when two snapshots have the same reference date", () => {
    const review = calculateMonthlyPortfolioReview([
      snapshot("last", "2026-08-31", ["30.00"], {
        createdAt: "2026-09-02T10:00:00Z",
      }),
      snapshot("first", "2026-08-31", ["25.00"], {
        createdAt: "invalid-date",
      }),
    ]);
    const reverseInput = calculateMonthlyPortfolioReview([
      snapshot("first", "2026-08-31", ["25.00"], {
        createdAt: "invalid-date",
      }),
      snapshot("last", "2026-08-31", ["30.00"], {
        createdAt: "2026-09-02T10:00:00Z",
      }),
    ]);

    expect(review).toMatchObject({
      status: "no_previous_close",
      current: {
        referenceDate: "2026-08-31",
        knownValueCents: "3000",
      },
    });
    expect(reverseInput.current?.knownValueCents).toBe("3000");
  });

  it("sorts same-date snapshots using Date instances and treats empty closes as zero", () => {
    const review = calculateMonthlyPortfolioReview([
      snapshot("empty", "2026-08-31", [], {
        createdAt: new Date("2026-09-01T10:00:00.000Z"),
      }),
      snapshot("valued", "2026-08-31", ["30.00"], {
        createdAt: new Date("2026-09-02T10:00:00.000Z"),
      }),
    ]);
    const emptyReview = calculateMonthlyPortfolioReview([
      snapshot("empty", "2026-08-31", []),
    ]);

    expect(review.current?.knownValueCents).toBe("3000");
    expect(emptyReview.current).toMatchObject({
      knownValueCents: "0",
      positionCount: 0,
    });
  });

  it("omits absent valuation methods and conversion dates", () => {
    const review = calculateMonthlyPortfolioReview(
      [
        snapshot("snapshot", "2026-02-28", ["10.00"], {
          valuationSources: [null],
        }),
      ],
      "2026-02",
      [
        manualObservation({
          assetKey: "manual:no-conversion-date",
          conversionDate: null,
          recordedAt: "2026-02-10T12:00:00.000Z",
        }),
      ],
    );

    expect(review.current).toMatchObject({
      valuationMethods: ["MANUAL_CONVERTED"],
      manualConversionDates: [],
    });
  });

  it("uses exact cents, exposes a partial comparison and never calls it income", () => {
    const review = calculateMonthlyPortfolioReview([
      snapshot("june", "2026-06-30", ["1.005", null]),
      snapshot("july", "2026-07-31", ["2.01", null]),
    ]);

    expect(review).toMatchObject({
      status: "partial",
      observedChangeCents: "100",
      current: {
        knownValueCents: "201",
        positionCount: 2,
        valuedPositionCount: 1,
        unvaluedPositionCount: 1,
      },
      previous: {
        knownValueCents: "101",
        unvaluedPositionCount: 1,
      },
    });
    expect(review.flowSeparation.explanation).toContain(
      "Não é possível separar aportes de rendimento",
    );
  });

  it("marks gaps as partial when one or more months have no snapshot", () => {
    const review = calculateMonthlyPortfolioReview([
      snapshot("january", "2026-01-31", ["100.00"]),
      snapshot("april", "2026-04-30", ["125.00"]),
    ]);
    expect(review).toMatchObject({
      status: "partial",
      observedChangeCents: "2500",
      gapMonths: 2,
    });
  });

  it("reports a first snapshot without a comparison baseline", () => {
    expect(
      calculateMonthlyPortfolioReview([snapshot("first", "2026-01-31", ["0"])]),
    ).toMatchObject({
      status: "no_previous_close",
      observedChangeCents: null,
      current: { knownValueCents: "0" },
    });
  });

  it("does not calculate a difference when one close has no known values", () => {
    const review = calculateMonthlyPortfolioReview([
      snapshot("january", "2026-01-31", ["10.00"]),
      snapshot("february", "2026-02-28", [null]),
    ]);
    expect(review).toMatchObject({
      status: "insufficient_values",
      observedChangeCents: null,
      current: { knownValueCents: null },
      previous: { knownValueCents: "1000" },
    });
  });

  it("reports evaluation-method changes without treating them as returns", () => {
    const review = calculateMonthlyPortfolioReview([
      snapshot("january", "2026-01-31", ["10.00"], {
        valuationSources: ["CURVA"],
      }),
      snapshot("february", "2026-02-28", ["12.00", "0.00"], {
        valuationSources: ["MTM", "FECHAMENTO"],
      }),
    ]);
    expect(review.status).toBe("partial");
    expect(review.current?.valuationMethods).toEqual(["FECHAMENTO", "MTM"]);
    expect(review.previous?.valuationMethods).toEqual(["CURVA"]);
    expect(review.observedChangeCents).toBe("200");
  });

  it("compares manual foreign assets using the explicitly entered BRL value", () => {
    const review = calculateMonthlyPortfolioReview(
      [],
      "2026-02",
      [
        manualObservation(),
        manualObservation({
          totalValue: "1000.00",
          convertedValueBrl: "9000.00",
          positionDate: "2026-02-04",
          conversionDate: "2026-02-04",
          recordedAt: "2026-02-04T12:00:00.000Z",
        }),
      ],
      [{ assetKey: "manual:voo" }],
    );

    expect(review).toMatchObject({
      status: "ready",
      availablePeriods: ["2026-02", "2026-01"],
      observedChangeCents: "400000",
      current: {
        knownValueCents: "900000",
        sourceReferences: [
          { source: "Valor informado", referenceDate: "2026-02-04" },
        ],
        valuationMethods: ["MANUAL_CONVERTED"],
        manualPositionDates: ["2026-02-04"],
        manualConversionDates: ["2026-02-04"],
      },
      previous: { knownValueCents: "500000" },
    });
    expect(review.flowSeparation.explanation).toContain(
      "não comprovam cobertura completa",
    );
  });

  it("keeps removed manual assets in earlier closes and reports current untracked assets", () => {
    const review = calculateMonthlyPortfolioReview(
      [],
      "2026-02",
      [
        manualObservation(),
        manualObservation({
          status: "DELETED",
          recordedAt: "2026-02-04T12:00:00.000Z",
        }),
      ],
      [{ assetKey: "manual:untracked" }],
    );

    expect(review).toMatchObject({
      status: "partial",
      untrackedManualPositionCount: 1,
      current: { knownValueCents: "0", positionCount: 0 },
      previous: { knownValueCents: "500000", positionCount: 1 },
      observedChangeCents: "-500000",
    });
  });

  it("uses São Paulo month boundaries and drops observations with invalid dates", () => {
    const review = calculateMonthlyPortfolioReview([], "2026-08", [
      manualObservation({
        positionDate: "2026-07-31",
        conversionDate: "2026-07-31",
        recordedAt: "2026-08-01T02:30:00.000Z",
      }),
      manualObservation({
        totalValue: "1500.00",
        convertedValueBrl: "7500.00",
        positionDate: "2026-08-31",
        conversionDate: "2026-08-31",
        recordedAt: "2026-09-01T02:30:00.000Z",
      }),
      manualObservation({ recordedAt: "invalid-date" }),
    ]);

    expect(review).toMatchObject({
      availablePeriods: ["2026-08", "2026-07"],
      status: "ready",
      current: {
        knownValueCents: "750000",
        manualPositionDates: ["2026-08-31"],
        manualConversionDates: ["2026-08-31"],
      },
      previous: { knownValueCents: "500000" },
      observedChangeCents: "250000",
    });
  });

  it("retains all dates used by multiple active manual positions", () => {
    const review = calculateMonthlyPortfolioReview([], "2026-02", [
      manualObservation({
        assetKey: "manual:voo",
        positionDate: "2026-02-02",
        conversionDate: "2026-02-03",
        recordedAt: "2026-02-04T12:00:00.000Z",
      }),
      manualObservation({
        assetKey: "manual:vt",
        product: "VT",
        positionDate: "2026-02-01",
        conversionDate: "2026-02-02",
        recordedAt: "2026-02-03T12:00:00.000Z",
      }),
    ]);

    expect(review.current).toMatchObject({
      knownValueCents: "1000000",
      manualPositionDates: ["2026-02-01", "2026-02-02"],
      manualConversionDates: ["2026-02-02", "2026-02-03"],
    });
  });

  it("keeps unconverted foreign positions unknown instead of using their original currency", () => {
    const review = calculateMonthlyPortfolioReview([], "2026-01", [
      manualObservation({ convertedValueBrl: null }),
    ]);

    expect(review).toMatchObject({
      status: "no_previous_close",
      current: {
        knownValueCents: null,
        positionCount: 1,
        unvaluedPositionCount: 1,
        valuationMethods: ["MANUAL_UNCONVERTED"],
      },
    });
  });

  it("retains the newest observation when manual history arrives out of order", () => {
    const review = calculateMonthlyPortfolioReview([], "2026-02", [
      manualObservation({
        totalValue: "2000.00",
        convertedValueBrl: "10000.00",
        positionDate: "2026-02-10",
        recordedAt: "2026-02-10T12:00:00.000Z",
      }),
      manualObservation({
        currency: "BRL",
        totalValue: "1000.00",
        convertedValueBrl: null,
        positionDate: "2026-01-10",
        conversionDate: null,
        recordedAt: "2026-01-10T12:00:00.000Z",
      }),
    ]);

    expect(review.current).toMatchObject({
      knownValueCents: "1000000",
      valuationMethods: ["MANUAL_CONVERTED"],
    });
    expect(review.previous).toMatchObject({
      knownValueCents: "100000",
      valuationMethods: ["MANUAL_REPORTED"],
    });
  });

  it("uses a legacy manual position as its last known value without inventing earlier history", () => {
    const review = calculateMonthlyPortfolioReview(
      [],
      undefined,
      [],
      [
        {
          assetKey: "manual:voo",
          product: "VOO",
          assetCode: "VOO",
          currency: "USD",
          totalValue: "1000.00",
          convertedValueBrl: "5000.00",
          positionDate: "2026-08-31",
          conversionDate: "2026-08-31",
          updatedAt: "2026-09-01T02:30:00.000Z",
        },
      ],
    );

    expect(review).toMatchObject({
      availablePeriods: ["2026-08"],
      status: "no_previous_close",
      untrackedManualPositionCount: 1,
      current: {
        knownValueCents: "500000",
        positionCount: 1,
        valuationMethods: ["MANUAL_CONVERTED"],
      },
    });
  });

  it("keeps optional legacy manual fields nullable", () => {
    const review = calculateMonthlyPortfolioReview(
      [],
      undefined,
      [],
      [
        {
          assetKey: "manual:unknown-value",
          product: "Ativo manual",
          currency: "BRL",
          positionDate: "2026-08-31",
          updatedAt: "2026-08-31T12:00:00.000Z",
        },
      ],
    );

    expect(review.current).toMatchObject({
      knownValueCents: null,
      unvaluedPositionCount: 1,
      valuationMethods: ["MANUAL_REPORTED"],
      manualConversionDates: [],
    });
  });

  it("marks comparisons partial when valuation sources use different dates", () => {
    const review = calculateMonthlyPortfolioReview(
      [
        snapshot("jan", "2026-01-31", ["10.00"]),
        snapshot("feb", "2026-02-28", ["20.00"]),
      ],
      "2026-02",
      [
        manualObservation({
          positionDate: "2026-01-30",
          recordedAt: "2026-01-30T12:00:00.000Z",
        }),
        manualObservation({
          positionDate: "2026-02-27",
          conversionDate: "2026-02-27",
          recordedAt: "2026-02-27T12:00:00.000Z",
        }),
      ],
    );

    expect(review).toMatchObject({
      status: "partial",
      dateAlignment: "different_dates",
    });
  });

  it("marks a carried source value outdated for the selected month", () => {
    const review = calculateMonthlyPortfolioReview(
      [snapshot("jan", "2026-01-31", ["10.00"])],
      "2026-02",
      [
        manualObservation({
          positionDate: "2026-01-31",
          recordedAt: "2026-02-10T12:00:00.000Z",
        }),
      ],
    );

    expect(review).toMatchObject({
      status: "partial",
      dateAlignment: "outdated",
    });
  });

  it("does not carry a B3 close from the prior month into an empty later month", () => {
    const review = calculateMonthlyPortfolioReview(
      [snapshot("jan", "2026-01-31", ["10.00"])],
      "2026-02",
      [
        manualObservation({
          positionDate: "2026-02-10",
          recordedAt: "2026-02-10T12:00:00.000Z",
          totalValue: "20.00",
          convertedValueBrl: "100.00",
        }),
      ],
    );

    expect(review).toMatchObject({
      status: "partial",
      current: { sources: ["Valor informado"], knownValueCents: "10000" },
      previous: { sources: ["B3"], knownValueCents: "1000" },
      compositionCoverage: "changed",
    });
  });

  it("keeps a next-month B3 reference date out of both current and previous closes", () => {
    const review = calculateMonthlyPortfolioReview(
      [
        snapshot("jan", "2026-01-31", ["10.00"]),
        snapshot("feb", "2026-02-28", ["20.00"]),
        snapshot("mar-first", "2026-03-01", ["900.00"]),
      ],
      "2026-02",
    );

    expect(review.current?.knownValueCents).toBe("2000");
    expect(review.previous?.knownValueCents).toBe("1000");
    expect(review.current?.referenceDate).toBe("2026-02-28");
    expect(review.previous?.referenceDate).toBe("2026-01-31");
  });

  it("marks different B3 position sets partial even when their totals are valued", () => {
    const review = calculateMonthlyPortfolioReview([
      snapshot("jan", "2026-01-31", ["10.00"], { identities: ["asset-a"] }),
      snapshot("feb", "2026-02-28", ["12.00"], { identities: ["asset-b"] }),
    ]);

    expect(review).toMatchObject({
      status: "partial",
      compositionCoverage: "changed",
      observedChangeCents: "200",
    });
  });

  it("does not report ready when imported positions have insufficient identity", () => {
    const review = calculateMonthlyPortfolioReview([
      snapshot("jan", "2026-01-31", ["10.00"], { identities: [null] }),
      snapshot("feb", "2026-02-28", ["12.00"], { identities: [null] }),
    ]);

    expect(review).toMatchObject({
      status: "partial",
      compositionCoverage: "unknown",
    });
  });

  it("keeps a newly recorded manual position partial without a previous observation", () => {
    const review = calculateMonthlyPortfolioReview(
      [
        snapshot("jan", "2026-01-31", ["10.00"]),
        snapshot("feb", "2026-02-28", ["12.00"]),
      ],
      "2026-02",
      [
        manualObservation({
          positionDate: "2026-02-10",
          recordedAt: "2026-02-10T12:00:00Z",
        }),
      ],
    );

    expect(review).toMatchObject({
      status: "partial",
      compositionCoverage: "changed",
    });
  });

  it("uses manual record time rather than a retroactive position date for historical availability", () => {
    const review = calculateMonthlyPortfolioReview(
      [snapshot("jan", "2026-01-31", ["10.00"])],
      "2026-01",
      [
        manualObservation({
          positionDate: "2026-01-15",
          recordedAt: "2026-02-10T12:00:00Z",
        }),
      ],
    );

    expect(review).toMatchObject({
      status: "no_previous_close",
      current: { sources: ["B3"], knownValueCents: "1000" },
    });
  });

  it("marks conversion values partial when the exchange-rate date is outside the close", () => {
    const review = calculateMonthlyPortfolioReview([], "2026-02", [
      manualObservation({
        positionDate: "2026-01-31",
        conversionDate: "2026-01-31",
        recordedAt: "2026-01-31T12:00:00Z",
      }),
      manualObservation({
        positionDate: "2026-02-28",
        conversionDate: "2026-03-01",
        recordedAt: "2026-02-28T12:00:00Z",
      }),
    ]);

    expect(review).toMatchObject({
      status: "partial",
      dateAlignment: "different_dates",
    });
  });

  it("does not call manual history comparable when an intermediate month is missing", () => {
    const review = calculateMonthlyPortfolioReview([], "2026-04", [
      manualObservation({
        positionDate: "2026-01-31",
        recordedAt: "2026-01-31T12:00:00Z",
      }),
      manualObservation({
        positionDate: "2026-04-30",
        recordedAt: "2026-04-30T12:00:00Z",
      }),
    ]);

    expect(review).toMatchObject({
      status: "partial",
      gapMonths: 2,
      compositionCoverage: "equivalent",
    });
  });

  it("marks a manual valuation date later than its recorded month as mismatched", () => {
    const review = calculateMonthlyPortfolioReview([], "2026-02", [
      manualObservation({
        positionDate: "2026-01-31",
        recordedAt: "2026-01-31T12:00:00.000Z",
      }),
      manualObservation({
        positionDate: "2026-03-01",
        conversionDate: "2026-03-01",
        recordedAt: "2026-02-10T12:00:00.000Z",
      }),
    ]);

    expect(review).toMatchObject({
      status: "partial",
      dateAlignment: "different_dates",
      current: { valuationReferenceDates: ["2026-03-01"] },
    });
  });
});
