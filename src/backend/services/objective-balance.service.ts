import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { portfolioObjectivesRepository } from "@/backend/repositories/portfolio-objectives.repository";
import { cdbRateRepository } from "@/backend/repositories/cdb-rate.repository";
import { bcbCdiService } from "@/backend/services/bcb-cdi.service";
import { buildEffectiveCdiRateSeries } from "@/backend/services/cdb-estimate.service";
import { estimatePostFixedCdb } from "@/backend/services/cdb-cdi-estimator";
import {
  isFutureValuationDate,
  isValidValuationDate,
  todayInSaoPaulo,
} from "@/lib/valuation-date";
import { decimalToCents } from "@/lib/portfolio-money";

const maximumAmount = 1_000_000_000_000;
const saveSchema = z.object({
  objectiveId: z.string().uuid(),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d+)?$/)
    .refine((amount) => {
      const cents = decimalToCents(amount);
      return (
        cents !== null && cents >= 0n && cents <= BigInt(maximumAmount) * 100n
      );
    }),
  observedOn: z
    .string()
    .refine(isValidValuationDate, "Informe uma data válida.")
    .refine(
      (date) => !isFutureValuationDate(date),
      "A data não pode ser futura.",
    ),
  cdiPercentage: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== ""
        ? Number(value.trim())
        : value,
    z.number().finite().positive().max(1000).nullable().optional(),
  ),
});

export type ObjectiveBalanceReference = {
  objectiveId: string;
  amountCents: string;
  observedDate: string;
  cdiPercentage: string | null;
};

export type ObjectiveBalanceUnavailableReason =
  "missing_conditions" | "no_eligible_days" | "rates_unavailable";

export type ObjectiveBalanceProjectionResult = {
  projection: ObjectiveBalanceProjection | null;
  unavailableReason: ObjectiveBalanceUnavailableReason | null;
};

type CachedRate = { rateDate: string; annualRate: string; fetchedAt: Date };
type RateSeries = {
  officialRates: CachedRate[];
  latestPriorOfficial: CachedRate | null;
};

function centsToDecimal(cents: string) {
  const value = BigInt(cents);
  const whole = value / 100n;
  const remainder = (value % 100n).toString().padStart(2, "0");
  return `${whole}.${remainder}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export class ObjectiveBalanceService {
  constructor(
    private readonly repository = portfolioObjectivesRepository,
    private readonly rates = cdbRateRepository,
    private readonly fetchOfficialRates = (from: string, to: string) =>
      bcbCdiService.fetchRates(from, to),
    private readonly getEvaluationDate = todayInSaoPaulo,
  ) {}

  async save(input: unknown) {
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success)
      throw new ApplicationError("Revise os dados do saldo informado.", 400);
    const amountCents = decimalToCents(parsed.data.amount)!.toString();
    const saved = await this.repository.saveObservedBalance({
      objectiveId: parsed.data.objectiveId,
      amountCents,
      observedOn: parsed.data.observedOn,
      cdiPercentage:
        parsed.data.cdiPercentage === undefined ||
        parsed.data.cdiPercentage === null
          ? null
          : parsed.data.cdiPercentage.toFixed(4),
    });
    if (!saved) throw new ApplicationError("Objetivo não encontrado.", 404);
    return saved;
  }

  async projectLatest(
    references: ObjectiveBalanceReference[],
    evaluationDate = this.getEvaluationDate(),
  ) {
    const endExclusive = addDays(evaluationDate, 1);
    const results = new Map<string, ObjectiveBalanceProjectionResult>();
    for (const reference of references) {
      const hasEligibleDates =
        reference.cdiPercentage !== null &&
        reference.observedDate <= evaluationDate &&
        this.hasEligibleAccrualDates(reference, endExclusive);
      results.set(reference.objectiveId, {
        projection: null,
        unavailableReason:
          reference.cdiPercentage === null
            ? "missing_conditions"
            : hasEligibleDates
              ? "rates_unavailable"
              : "no_eligible_days",
      });
    }
    const projectable = references.filter(
      (reference) =>
        reference.cdiPercentage !== null &&
        reference.observedDate <= evaluationDate &&
        this.hasEligibleAccrualDates(reference, endExclusive),
    );
    if (!projectable.length) return results;

    try {
      let seriesByDate = await this.readSeries(projectable, endExclusive);
      const firstMissingDate = this.findFirstMissingDate(
        projectable,
        seriesByDate,
        endExclusive,
      );
      const bootstrapBaseDates = projectable
        .filter((reference) => {
          const series = seriesByDate.get(reference.observedDate)!;
          const effective = buildEffectiveCdiRateSeries({
            fromDateExclusive: reference.observedDate,
            toDateExclusive: endExclusive,
            officialRates: series.officialRates,
            latestPriorOfficial: series.latestPriorOfficial,
          });
          return Boolean(
            !series.latestPriorOfficial &&
            effective.rates.length === 0 &&
            effective.missingDate,
          );
        })
        .map((reference) => reference.observedDate);
      if (firstMissingDate) {
        const fetchStarts = [
          firstMissingDate,
          ...bootstrapBaseDates.map((date) => addDays(date, -10)),
        ];
        const from = fetchStarts.sort()[0]!;
        try {
          const official = await this.fetchOfficialRates(from, evaluationDate);
          const ratesToCache = Array.from(
            new Map(
              official
                .filter((rate) => {
                  if (rate.date >= endExclusive) return false;
                  const missingAccrualRate = rate.date >= firstMissingDate;
                  const priorBootstrapRate = bootstrapBaseDates.some(
                    (baseDate) =>
                      rate.date >= addDays(baseDate, -10) &&
                      rate.date <= baseDate,
                  );
                  return missingAccrualRate || priorBootstrapRate;
                })
                .map((rate) => [rate.date, rate]),
            ).values(),
          );
          if (ratesToCache.length) await this.rates.cacheRates(ratesToCache);
        } catch {
          // A cached official series still supports a clearly provisional estimate.
        }
        seriesByDate = await this.readSeries(projectable, endExclusive);
      }

      for (const reference of projectable) {
        const series = seriesByDate.get(reference.observedDate)!;
        const effective = buildEffectiveCdiRateSeries({
          fromDateExclusive: reference.observedDate,
          toDateExclusive: endExclusive,
          officialRates: series.officialRates,
          latestPriorOfficial: series.latestPriorOfficial,
        });
        if (effective.rates.length === 0) {
          results.set(reference.objectiveId, {
            projection: null,
            unavailableReason: "rates_unavailable",
          });
          continue;
        }
        const estimate = estimatePostFixedCdb({
          officialValue: centsToDecimal(reference.amountCents),
          cdiPercentage: reference.cdiPercentage!,
          rates: effective.rates,
        });
        results.set(reference.objectiveId, {
          projection: {
            projectedAmountCents: estimate.estimatedValueCents,
            projectedOn: evaluationDate,
            estimatedThrough:
              effective.rates[effective.rates.length - 1]!.rateDate,
            cdiPercentage: reference.cdiPercentage!,
            status:
              effective.projectedDates.length || effective.missingDate
                ? "provisional"
                : "projected",
          },
          unavailableReason: null,
        });
      }
      return results;
    } catch {
      return results;
    }
  }

  private hasEligibleAccrualDates(
    reference: ObjectiveBalanceReference,
    endExclusive: string,
  ) {
    const effective = buildEffectiveCdiRateSeries({
      fromDateExclusive: reference.observedDate,
      toDateExclusive: endExclusive,
      officialRates: [],
      latestPriorOfficial: null,
    });
    return effective.missingDate !== null;
  }

  private async readSeries(
    references: ObjectiveBalanceReference[],
    endExclusive: string,
  ) {
    const baseDates = [...new Set(references.map((item) => item.observedDate))];
    const byDate = new Map<string, RateSeries>();
    await Promise.all(
      baseDates.map(async (baseDate) => {
        const [officialRates, latestPriorOfficial] = await Promise.all([
          this.rates.listRatesFrom(baseDate, endExclusive),
          this.rates.listLatestRateOnOrBefore(baseDate),
        ]);
        byDate.set(baseDate, {
          officialRates: officialRates.sort((left, right) =>
            left.rateDate.localeCompare(right.rateDate),
          ),
          latestPriorOfficial,
        });
      }),
    );
    return byDate;
  }

  private findFirstMissingDate(
    references: ObjectiveBalanceReference[],
    seriesByDate: Map<string, RateSeries>,
    endExclusive: string,
  ) {
    let earliest: string | null = null;
    for (const reference of references) {
      const series = seriesByDate.get(reference.observedDate)!;
      const effective = buildEffectiveCdiRateSeries({
        fromDateExclusive: reference.observedDate,
        toDateExclusive: endExclusive,
        officialRates: series.officialRates,
        latestPriorOfficial: series.latestPriorOfficial,
      });
      const missing = [
        ...effective.projectedDates,
        ...(effective.missingDate ? [effective.missingDate] : []),
      ].sort()[0];
      if (missing && (earliest === null || missing < earliest))
        earliest = missing;
    }
    return earliest;
  }
}

export type ObjectiveBalanceProjection = {
  projectedAmountCents: string;
  projectedOn: string;
  estimatedThrough: string;
  cdiPercentage: string;
  status: "projected" | "provisional";
};

export const objectiveBalanceService = new ObjectiveBalanceService();
