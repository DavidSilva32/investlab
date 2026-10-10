import { decimalToCents } from "@/lib/portfolio-money";

export type MonthlyPortfolioSnapshot = {
  id: string;
  referenceDate: string | null;
  createdAt: Date | string;
  source: string;
  positions: Array<{
    totalValue: string | null;
    valuationSource: string | null;
  }>;
};

export type ManualPortfolioObservation = {
  assetKey: string;
  product: string;
  assetCode: string | null;
  currency: string;
  totalValue: string | null;
  convertedValueBrl: string | null;
  positionDate: string;
  conversionDate: string | null;
  status: "ACTIVE" | "DELETED";
  recordedAt: Date | string;
};

export type CurrentManualPortfolioPosition = {
  assetKey: string;
  product?: string;
  assetCode?: string | null;
  currency?: string;
  totalValue?: string | null;
  convertedValueBrl?: string | null;
  positionDate?: string;
  conversionDate?: string | null;
  updatedAt?: Date | string;
};

export type MonthlyPortfolioSnapshotSummary = {
  referenceDate: string;
  importedAt: string;
  sources: string[];
  sourceReferences: Array<{
    source: string;
    referenceDate: string;
    recordedAt?: string;
  }>;
  positionCount: number;
  valuedPositionCount: number;
  unvaluedPositionCount: number;
  knownValueCents: string | null;
  valuationMethods: string[];
  manualPositionDates: string[];
  manualConversionDates: string[];
  valuationReferenceDates: string[];
};

export type MonthlyPortfolioReview = {
  availablePeriods: string[];
  selectedPeriod: string | null;
  untrackedManualPositionCount: number;
  status:
    | "no_history"
    | "missing_snapshot"
    | "no_previous_close"
    | "insufficient_values"
    | "ready"
    | "partial";
  dateAlignment: "aligned" | "different_dates" | "outdated" | "unavailable";
  current: MonthlyPortfolioSnapshotSummary | null;
  previous: MonthlyPortfolioSnapshotSummary | null;
  observedChangeCents: string | null;
  gapMonths: number;
  flowSeparation: {
    status: "unavailable";
    explanation: string;
  };
};

const flowExplanation =
  "Não é possível separar aportes de rendimento com os dados disponíveis. As movimentações importadas não comprovam cobertura completa nem distinguem com segurança aportes externos, transferências e compras ou vendas.";

function validReferenceDate(value: string | null) {
  if (value === null) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function monthOf(referenceDate: string) {
  return referenceDate.slice(0, 7);
}

const portfolioTimeZone = "America/Sao_Paulo";
const portfolioDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: portfolioTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function saoPauloParts(value: Date) {
  return Object.fromEntries(
    portfolioDateFormatter
      .formatToParts(value)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: part }) => [type, Number(part)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

function monthOfTimestamp(value: number) {
  const { year, month } = saoPauloParts(new Date(value));
  return `${year}-${String(month).padStart(2, "0")}`;
}

function dateInSaoPaulo(value: number) {
  const { year, month, day } = saoPauloParts(new Date(value));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function localDateTimeInSaoPaulo(year: number, month: number, day: number) {
  const targetAsUtc = Date.UTC(year, month - 1, day);
  let guess = targetAsUtc;
  // Resolve the timezone offset from the target local date rather than
  // assuming UTC-3, so historic daylight-saving changes remain correct.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = saoPauloParts(new Date(guess));
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    guess = targetAsUtc - (representedAsUtc - guess);
  }
  return guess;
}

function monthIndex(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return year * 12 + monthNumber - 1;
}

function timestamp(value: Date | string) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return parsed;
}

function monthEndTimestamp(period: string) {
  const [year, month] = period.split("-").map(Number);
  return localDateTimeInSaoPaulo(year, month + 1, 1) - 1;
}

function latestFirst(
  left: MonthlyPortfolioSnapshot,
  right: MonthlyPortfolioSnapshot,
) {
  const dateOrder = right.referenceDate!.localeCompare(left.referenceDate!);
  if (dateOrder !== 0) return dateOrder;
  return (
    (Number.isFinite(timestamp(right.createdAt))
      ? timestamp(right.createdAt)
      : 0) -
    (Number.isFinite(timestamp(left.createdAt)) ? timestamp(left.createdAt) : 0)
  );
}

function latestManualState(
  observations: ManualPortfolioObservation[],
  cutoff: number,
) {
  const latestByAsset = new Map<string, ManualPortfolioObservation>();
  for (const observation of observations) {
    const recordedAt = timestamp(observation.recordedAt);
    if (recordedAt > cutoff) continue;
    const previous = latestByAsset.get(observation.assetKey);
    if (!previous || recordedAt > timestamp(previous.recordedAt)) {
      latestByAsset.set(observation.assetKey, observation);
    }
  }
  return [...latestByAsset.values()];
}

function summarize(
  snapshot: MonthlyPortfolioSnapshot | null,
  period: string,
  manualPositions: ManualPortfolioObservation[],
) {
  const b3Positions = snapshot?.positions ?? [];
  const b3Values = b3Positions.map((position) =>
    decimalToCents(position.totalValue),
  );
  const activeManual = manualPositions.filter(
    (position) => position.status === "ACTIVE",
  );
  const manualValues = activeManual.map((position) =>
    decimalToCents(
      position.currency === "BRL"
        ? position.totalValue
        : position.convertedValueBrl,
    ),
  );
  const values = [...b3Values, ...manualValues];
  const knownValues = values.filter((value) => value !== null);
  const knownValueCents = knownValues.reduce(
    (total, value) => total + value,
    0n,
  );
  const latestManualObservation = [...manualPositions].sort(
    (left, right) => timestamp(right.recordedAt) - timestamp(left.recordedAt),
  )[0];
  const sourceReferences = [
    ...(snapshot
      ? [{ source: "B3", referenceDate: snapshot.referenceDate! }]
      : []),
    ...(latestManualObservation
      ? [
          {
            source: "Valor informado",
            referenceDate: latestManualObservation.positionDate,
            recordedAt: dateInSaoPaulo(
              timestamp(latestManualObservation.recordedAt),
            ),
          },
        ]
      : []),
  ];
  const latestReferenceDate = sourceReferences
    .map(({ referenceDate }) => referenceDate)
    .sort()
    .at(-1);
  const importedAt = [
    ...(snapshot ? [timestamp(snapshot.createdAt)] : []),
    ...manualPositions.map((position) => timestamp(position.recordedAt)),
  ]
    .filter(Number.isFinite)
    .reduce((latest, value) => Math.max(latest, value), 0);

  return {
    // A selected period always comes from at least one B3 or manual observation.
    referenceDate: latestReferenceDate!,
    importedAt: new Date(importedAt).toISOString(),
    sources: [...new Set(sourceReferences.map(({ source }) => source))],
    sourceReferences,
    positionCount: b3Positions.length + activeManual.length,
    valuedPositionCount: knownValues.length,
    unvaluedPositionCount: values.length - knownValues.length,
    knownValueCents:
      knownValues.length > 0
        ? knownValueCents.toString()
        : values.length === 0 && (snapshot || manualPositions.length > 0)
          ? "0"
          : null,
    valuationMethods: [
      ...new Set([
        ...b3Positions.flatMap((position) =>
          position.valuationSource ? [position.valuationSource] : [],
        ),
        ...activeManual.map((position) =>
          position.currency === "BRL"
            ? "MANUAL_REPORTED"
            : position.convertedValueBrl === null
              ? "MANUAL_UNCONVERTED"
              : "MANUAL_CONVERTED",
        ),
      ]),
    ].sort(),
    manualPositionDates: [
      ...new Set(activeManual.map((position) => position.positionDate)),
    ].sort(),
    manualConversionDates: [
      ...new Set(
        activeManual.flatMap((position) =>
          position.currency !== "BRL" && position.convertedValueBrl !== null
            ? position.conversionDate
              ? [position.conversionDate]
              : []
            : [],
        ),
      ),
    ].sort(),
    valuationReferenceDates: [
      ...new Set([
        ...(snapshot?.referenceDate ? [snapshot.referenceDate] : []),
        ...activeManual.map((position) => position.positionDate),
      ]),
    ].sort(),
  } satisfies MonthlyPortfolioSnapshotSummary;
}

function dateAlignment(
  current: MonthlyPortfolioSnapshotSummary,
  currentPeriod: string,
  previous: MonthlyPortfolioSnapshotSummary,
  previousPeriod: string,
): "aligned" | "different_dates" | "outdated" {
  const referenceGroups = [
    { dates: current.valuationReferenceDates, period: currentPeriod },
    { dates: previous.valuationReferenceDates, period: previousPeriod },
  ];
  if (
    referenceGroups.some(({ dates, period }) =>
      dates.some((date) => monthOf(date) < period),
    )
  ) {
    return "outdated";
  }
  if (
    referenceGroups.some(({ dates, period }) =>
      dates.some((date) => monthOf(date) > period),
    )
  ) {
    return "different_dates";
  }
  if (referenceGroups.some(({ dates }) => new Set(dates).size > 1)) {
    return "different_dates";
  }
  return "aligned";
}

function emptyResult(
  availablePeriods: string[],
  selectedPeriod: string | null,
  untrackedManualPositionCount: number,
  status: "no_history" | "missing_snapshot",
): MonthlyPortfolioReview {
  return {
    availablePeriods,
    selectedPeriod,
    untrackedManualPositionCount,
    status,
    dateAlignment: "unavailable",
    current: null,
    previous: null,
    observedChangeCents: null,
    gapMonths: 0,
    flowSeparation: { status: "unavailable", explanation: flowExplanation },
  };
}

export function calculateMonthlyPortfolioReview(
  snapshots: MonthlyPortfolioSnapshot[],
  selectedPeriod?: string | null,
  manualObservations: ManualPortfolioObservation[] = [],
  currentManualPositions: CurrentManualPortfolioPosition[] = [],
): MonthlyPortfolioReview {
  const datedSnapshots = snapshots.filter((snapshot) =>
    validReferenceDate(snapshot.referenceDate),
  );
  const validManualObservations = manualObservations.filter((observation) =>
    Number.isFinite(timestamp(observation.recordedAt)),
  );
  const trackedManualKeys = new Set(
    validManualObservations.map((observation) => observation.assetKey),
  );
  const untrackedManualPositions = currentManualPositions.filter(
    (position) => !trackedManualKeys.has(position.assetKey),
  );
  const untrackedManualPositionCount = untrackedManualPositions.length;
  const legacyCurrentObservations = untrackedManualPositions.flatMap(
    (position): ManualPortfolioObservation[] => {
      if (
        !position.product ||
        !position.currency ||
        !position.positionDate ||
        !position.updatedAt ||
        !Number.isFinite(timestamp(position.updatedAt))
      ) {
        return [];
      }
      return [
        {
          assetKey: position.assetKey,
          product: position.product,
          assetCode: position.assetCode ?? null,
          currency: position.currency,
          totalValue: position.totalValue ?? null,
          convertedValueBrl: position.convertedValueBrl ?? null,
          positionDate: position.positionDate,
          conversionDate: position.conversionDate ?? null,
          status: "ACTIVE",
          recordedAt: position.updatedAt,
        },
      ];
    },
  );
  const allManualObservations = [
    ...validManualObservations,
    ...legacyCurrentObservations,
  ];
  const availablePeriods = [
    ...new Set([
      ...datedSnapshots.map((snapshot) => monthOf(snapshot.referenceDate!)),
      ...allManualObservations.map((observation) =>
        monthOfTimestamp(timestamp(observation.recordedAt)),
      ),
    ]),
  ].sort((left, right) => right.localeCompare(left));
  const period = selectedPeriod ?? availablePeriods[0] ?? null;
  if (period === null)
    return emptyResult(
      availablePeriods,
      null,
      untrackedManualPositionCount,
      "no_history",
    );
  if (!availablePeriods.includes(period))
    return emptyResult(
      availablePeriods,
      period,
      untrackedManualPositionCount,
      "missing_snapshot",
    );

  const currentEnd = monthEndTimestamp(period);
  const currentSnapshot = datedSnapshots
    .filter((snapshot) => timestamp(snapshot.referenceDate!) <= currentEnd)
    .sort(latestFirst)[0];
  const currentManual = latestManualState(allManualObservations, currentEnd);
  const current = summarize(currentSnapshot ?? null, period, currentManual);
  const previousPeriod = availablePeriods.find(
    (available) => available < period,
  );

  if (!previousPeriod) {
    return {
      availablePeriods,
      selectedPeriod: period,
      untrackedManualPositionCount,
      status: "no_previous_close",
      dateAlignment: "unavailable",
      current,
      previous: null,
      observedChangeCents: null,
      gapMonths: 0,
      flowSeparation: { status: "unavailable", explanation: flowExplanation },
    };
  }

  const previousEnd = monthEndTimestamp(previousPeriod);
  const previousSnapshot = datedSnapshots
    .filter((snapshot) => timestamp(snapshot.referenceDate!) <= previousEnd)
    .sort(latestFirst)[0];
  const previousManual = latestManualState(allManualObservations, previousEnd);
  const previous = summarize(
    previousSnapshot ?? null,
    previousPeriod,
    previousManual,
  );
  const gapMonths = Math.max(
    0,
    monthIndex(period) - monthIndex(previousPeriod) - 1,
  );
  const valuesAvailable =
    current.knownValueCents !== null && previous.knownValueCents !== null;

  if (!valuesAvailable) {
    return {
      availablePeriods,
      selectedPeriod: period,
      untrackedManualPositionCount,
      status: "insufficient_values",
      dateAlignment: "unavailable",
      current,
      previous,
      observedChangeCents: null,
      gapMonths,
      flowSeparation: { status: "unavailable", explanation: flowExplanation },
    };
  }

  const complete =
    untrackedManualPositionCount === 0 &&
    current.positionCount > 0 &&
    current.unvaluedPositionCount === 0 &&
    previous.positionCount > 0 &&
    previous.unvaluedPositionCount === 0;
  const alignment = dateAlignment(current, period, previous, previousPeriod);
  const observedChangeCents = (
    BigInt(current.knownValueCents!) - BigInt(previous.knownValueCents!)
  ).toString();

  return {
    availablePeriods,
    selectedPeriod: period,
    untrackedManualPositionCount,
    status: complete && alignment === "aligned" ? "ready" : "partial",
    dateAlignment: alignment,
    current,
    previous,
    observedChangeCents,
    gapMonths,
    flowSeparation: { status: "unavailable", explanation: flowExplanation },
  };
}
