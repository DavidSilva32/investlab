import { createHash } from "node:crypto";
import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  portfolioObjectivesRepository,
  type McpBalanceIdempotency,
} from "@/backend/repositories/portfolio-objectives.repository";
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
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

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

export type ObjectiveBalanceAssignmentStatus = "updated" | "preserved";
export type ObjectiveBalanceAssignmentReason =
  "historical_balance" | "calculation_unavailable";

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
type ReserveAssignmentService = {
  findAutomaticAssignment(
    targetAmount: number,
    observedOn: string,
    requestId?: string,
  ): Promise<{
    selectedAssetKeys: string[];
    expectedOwners: Record<string, string | null>;
    expectedSourceFingerprint: string;
  }>;
};
type ObjectiveAssignment = {
  objectiveId: string;
  objectiveName: string;
  amountCents: string;
  observedOn: string;
  expectedOwners: Record<string, string | null>;
  allocation: Record<string, string | null>;
  expectedSourceFingerprint: string;
  changedPositionCount: number;
};
type ObjectiveAssignmentService = {
  findAutomaticObjectiveAssignment(input: {
    objectiveId: string;
    amountCents: string;
    observedOn: string;
    requestId?: string;
  }): Promise<ObjectiveAssignment>;
  saveAutomaticObjectiveAssignment(
    input: ObjectiveAssignment & {
      cdiPercentage: string | null;
      mcpIdempotency?: McpBalanceIdempotency;
    },
  ): Promise<{
    batchId: string;
    objectiveName: string;
    changedPositionCount: number;
    transferredPositionCount: number;
  }>;
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
    private readonly reserveAssignment?: ReserveAssignmentService,
    private readonly objectiveAssignment?: ObjectiveAssignmentService,
  ) {}

  async save(
    input: unknown,
    requestId?: string,
    options?: { idempotencyKey?: string },
  ) {
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success)
      throw new ApplicationError("Revise os dados do saldo informado.", 400);
    const amountCents = decimalToCents(parsed.data.amount)!.toString();
    const cdiPercentage =
      parsed.data.cdiPercentage === undefined ||
      parsed.data.cdiPercentage === null
        ? null
        : parsed.data.cdiPercentage.toFixed(4);
    const mcpIdempotency = options?.idempotencyKey
      ? this.buildMcpIdempotency(parsed.data, options.idempotencyKey)
      : undefined;
    if (mcpIdempotency) {
      const replay = await this.repository.findMcpBalanceReplay({
        operation: mcpIdempotency.operation,
        key: mcpIdempotency.key,
        payloadHash: mcpIdempotency.payloadHash,
      });
      if (replay) return replay;
    }
    // Historical observations are factual records; only today's balance may
    // drive changes to current position ownership.
    if (parsed.data.observedOn < this.getEvaluationDate()) {
      const replayResult = {
        objectiveId: parsed.data.objectiveId,
        amountCents,
        observedDate: parsed.data.observedOn,
        assignmentStatus: "preserved",
        assignmentReason: "historical_balance",
      };
      const mcpWrite = mcpIdempotency
        ? { ...mcpIdempotency, replayResult }
        : undefined;
      const saved = await this.withReplayRecovery(mcpWrite, () =>
        this.repository.saveObservedBalance({
          objectiveId: parsed.data.objectiveId,
          amountCents,
          observedOn: parsed.data.observedOn,
          cdiPercentage,
          mcpIdempotency: mcpWrite,
        }),
      );
      if (!saved) throw new ApplicationError("Objetivo não encontrado.", 404);
      return mcpIdempotency
        ? replayResult
        : {
            ...saved,
            observedDate: parsed.data.observedOn,
            assignmentStatus: "preserved" as const,
            assignmentReason: "historical_balance" as const,
          };
    }
    let saved;
    try {
      saved =
        parsed.data.objectiveId === reserveObjectiveId
          ? await this.saveReserveBalance({
              amountCents,
              amount: Number(parsed.data.amount),
              observedOn: parsed.data.observedOn,
              cdiPercentage,
              requestId,
              mcpIdempotency,
            })
          : await this.saveObjectiveBalanceWithAssignments({
              objectiveId: parsed.data.objectiveId,
              amountCents,
              observedOn: parsed.data.observedOn,
              cdiPercentage,
              requestId,
              mcpIdempotency,
            });
    } catch (error) {
      const postgresError = error as { code?: string };
      if (mcpIdempotency && postgresError.code === "23505") {
        const replay = await this.repository.findMcpBalanceReplay({
          operation: mcpIdempotency.operation,
          key: mcpIdempotency.key,
          payloadHash: mcpIdempotency.payloadHash,
        });
        if (replay) return replay;
      }
      throw error;
    }
    if (!saved) throw new ApplicationError("Objetivo não encontrado.", 404);
    return saved;
  }

  private async saveReserveBalance(input: {
    amountCents: string;
    amount: number;
    observedOn: string;
    cdiPercentage: string | null;
    requestId?: string;
    mcpIdempotency?: McpBalanceIdempotency;
  }) {
    const reserveAssignment =
      this.reserveAssignment ??
      (await import("@/backend/services/emergency-reserve.service"))
        .emergencyReserveService;
    let assignment: Awaited<
      ReturnType<typeof reserveAssignment.findAutomaticAssignment>
    >;
    try {
      assignment = await reserveAssignment.findAutomaticAssignment(
        input.amount,
        input.observedOn,
        input.requestId,
      );
    } catch {
      const replayResult = {
        objectiveId: reserveObjectiveId,
        amountCents: input.amountCents,
        observedDate: input.observedOn,
        assignmentStatus: "preserved",
        assignmentReason: "calculation_unavailable",
      };
      const mcpWrite = input.mcpIdempotency
        ? { ...input.mcpIdempotency, replayResult }
        : undefined;
      const saved = await this.withReplayRecovery(mcpWrite, () =>
        this.repository.saveObservedBalance({
          objectiveId: reserveObjectiveId,
          amountCents: input.amountCents,
          observedOn: input.observedOn,
          cdiPercentage: input.cdiPercentage,
          mcpIdempotency: mcpWrite,
        }),
      );
      return saved
        ? input.mcpIdempotency
          ? replayResult
          : {
              ...saved,
              assignmentStatus: "preserved" as const,
              assignmentReason: "calculation_unavailable" as const,
            }
        : null;
    }
    const saved = await this.repository.saveReserveBalanceWithAssignments({
      amountCents: input.amountCents,
      observedOn: input.observedOn,
      cdiPercentage: input.cdiPercentage,
      selectedAssetKeys: assignment.selectedAssetKeys,
      expectedOwners: assignment.expectedOwners,
      expectedSourceFingerprint: assignment.expectedSourceFingerprint,
      mcpIdempotency: input.mcpIdempotency
        ? {
            ...input.mcpIdempotency,
            replayResult: {
              objectiveId: reserveObjectiveId,
              amountCents: input.amountCents,
              observedDate: input.observedOn,
              assignmentStatus: "updated",
              changedPositionCount:
                assignment.selectedAssetKeys.filter(
                  (assetKey) =>
                    (assignment.expectedOwners[assetKey] ?? null) !==
                    reserveObjectiveId,
                ).length +
                Object.entries(assignment.expectedOwners).filter(
                  ([assetKey, owner]) =>
                    owner === reserveObjectiveId &&
                    !assignment.selectedAssetKeys.includes(assetKey),
                ).length,
              transferredPositionCount: assignment.selectedAssetKeys.filter(
                (assetKey) =>
                  (assignment.expectedOwners[assetKey] ?? null) !== null &&
                  assignment.expectedOwners[assetKey] !== reserveObjectiveId,
              ).length,
            },
          }
        : undefined,
    });
    return input.mcpIdempotency ? input.mcpIdempotency.replayResult : saved;
  }

  private async saveObjectiveBalanceWithAssignments(input: {
    objectiveId: string;
    amountCents: string;
    observedOn: string;
    cdiPercentage: string | null;
    requestId?: string;
    mcpIdempotency?: McpBalanceIdempotency;
  }) {
    const service =
      this.objectiveAssignment ??
      (await import("@/backend/services/portfolio-objectives.service"))
        .portfolioObjectivesService;
    let assignment: Awaited<
      ReturnType<typeof service.findAutomaticObjectiveAssignment>
    >;
    try {
      assignment = await service.findAutomaticObjectiveAssignment({
        objectiveId: input.objectiveId,
        amountCents: input.amountCents,
        observedOn: input.observedOn,
        requestId: input.requestId,
      });
    } catch {
      const replayResult = {
        objectiveId: input.objectiveId,
        amountCents: input.amountCents,
        observedDate: input.observedOn,
        assignmentStatus: "preserved",
        assignmentReason: "calculation_unavailable",
      };
      const mcpWrite = input.mcpIdempotency
        ? { ...input.mcpIdempotency, replayResult }
        : undefined;
      const saved = await this.withReplayRecovery(mcpWrite, () =>
        this.repository.saveObservedBalance({
          objectiveId: input.objectiveId,
          amountCents: input.amountCents,
          observedOn: input.observedOn,
          cdiPercentage: input.cdiPercentage,
          mcpIdempotency: mcpWrite,
        }),
      );
      return saved
        ? input.mcpIdempotency
          ? replayResult
          : {
              ...saved,
              observedDate: input.observedOn,
              assignmentStatus: "preserved" as const,
              assignmentReason: "calculation_unavailable" as const,
            }
        : null;
    }
    const mcpIdempotency = input.mcpIdempotency
      ? {
          ...input.mcpIdempotency,
          replayResult: {
            objectiveId: input.objectiveId,
            amountCents: input.amountCents,
            observedDate: input.observedOn,
            objectiveName: assignment.objectiveName,
            changedPositionCount: assignment.changedPositionCount,
            transferredPositionCount: 0,
            assignmentStatus: "updated",
          },
        }
      : undefined;
    const saved = await service.saveAutomaticObjectiveAssignment({
      ...assignment,
      cdiPercentage: input.cdiPercentage,
      mcpIdempotency,
    });
    return mcpIdempotency
      ? mcpIdempotency.replayResult
      : {
          objectiveId: input.objectiveId,
          amountCents: input.amountCents,
          observedDate: input.observedOn,
          cdiPercentage: input.cdiPercentage,
          ...saved,
          assignmentStatus: "updated" as const,
        };
  }

  private buildMcpIdempotency(
    input: {
      objectiveId: string;
      amount: string;
      observedOn: string;
      cdiPercentage?: number | null;
    },
    key: string,
  ): McpBalanceIdempotency {
    if (key.length < 8 || key.length > 128) {
      throw new ApplicationError("Informe uma chave de repetição válida.", 400);
    }
    const normalized = {
      objectiveId: input.objectiveId,
      amountCents: decimalToCents(input.amount)!.toString(),
      observedOn: input.observedOn,
      cdiPercentage: input.cdiPercentage ?? null,
    };
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(normalized))
      .digest("hex");
    return {
      operation: "save_observed_balance",
      key,
      payloadHash,
      replayResult: {},
    };
  }

  private async withReplayRecovery<T>(
    idempotency: McpBalanceIdempotency | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const postgresError = error as { code?: string };
      if (idempotency && postgresError.code === "23505") {
        const replay = await this.repository.findMcpBalanceReplay({
          operation: idempotency.operation,
          key: idempotency.key,
          payloadHash: idempotency.payloadHash,
        });
        if (replay) return replay as T;
      }
      throw error;
    }
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
