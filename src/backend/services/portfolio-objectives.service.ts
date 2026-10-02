import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { emergencyReserveRepository } from "@/backend/repositories/emergency-reserve.repository";
import {
  objectiveBalanceService,
  type ObjectiveBalanceProjectionResult,
  type ObjectiveBalanceReference,
} from "@/backend/services/objective-balance.service";
import {
  createAllocationSourceFingerprint,
  portfolioObjectivesRepository,
} from "@/backend/repositories/portfolio-objectives.repository";
import { portfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import { portfolioPositionService } from "@/backend/services/portfolio-position.service";
import {
  portfolioObjectiveAllocationStateLimit,
  solvePortfolioObjectiveAllocation,
} from "@/backend/services/portfolio-objective-allocation";
import {
  mergePartialPositionCandidates,
  suggestEmergencyReservePositions,
} from "@/backend/services/emergency-reserve-position-suggestions";
import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";
import {
  calculateObjectiveValue,
  reserveObjectiveId,
  type ObjectivePosition,
} from "@/lib/portfolio-objectives";
import {
  centsToNumber,
  decimalToCents,
  resolvePositionMoney,
  sumMoneyCents,
  type PortfolioMoneySource,
} from "@/lib/portfolio-money";
import {
  isFutureValuationDate,
  isValidValuationDate,
  todayInSaoPaulo,
} from "@/lib/valuation-date";

const maximumAmount = 1_000_000_000_000;
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  targetAmount: z
    .number()
    .finite()
    .positive()
    .max(maximumAmount)
    .nullable()
    .optional(),
  monthlyPlannedAmount: z
    .number()
    .finite()
    .min(0)
    .max(maximumAmount)
    .nullable()
    .optional(),
});
const assignmentsSchema = z.object({
  assetKeys: z.array(z.string().trim().min(1).max(80)).max(500),
  transfers: z
    .array(
      z.object({
        assetKey: z.string().trim().min(1).max(80),
        fromObjectiveId: z.string().uuid(),
        toObjectiveId: z.string().uuid(),
      }),
    )
    .max(500)
    .default([]),
});
const updateSchema = createSchema.extend({ objectiveId: z.string().uuid() });
const deleteSchema = z.object({ objectiveId: z.string().uuid() });
const suggestionsSchema = z.object({
  targetAmount: z.number().finite().positive().max(maximumAmount),
  instrumentType: z.enum(["ALL", "CDB"]).default("ALL"),
  objectiveId: z.string().trim().min(1).optional(),
  valuationDate: z
    .string()
    .refine(isValidValuationDate, "Informe uma data válida.")
    .refine(
      (value) => !isFutureValuationDate(value),
      "A data não pode ser futura.",
    )
    .optional(),
});
const allocationSchema = z.object({
  valuationDate: z
    .string()
    .refine(isValidValuationDate, "Informe uma data válida.")
    .refine(
      (value) => !isFutureValuationDate(value),
      "A data não pode ser futura.",
    ),
  balances: z
    .array(
      z.object({
        objectiveId: z.string().uuid(),
        amount: z.number().finite().min(0).max(maximumAmount),
      }),
    )
    .min(1)
    .max(50),
});

type RawPosition = Record<string, unknown> & {
  assetKey?: string;
  source?: string | null;
  product: string;
  assetCode: string | null;
  institution: string | null;
  totalValue: string | number | null;
  estimatedValue?: string | number | null;
  estimatedValueCents?: string | null;
  canonicalValueCents?: string | null;
  canonicalValueSource?: PortfolioMoneySource;
  convertedValueBrl?: string | number | null;
  currency?: string | null;
  referenceDate?: string | null;
  classification?: { assetClass: string | null };
  issuer?: string | null;
  indexer?: string | null;
  regimeType?: string | null;
  issuedAt?: string | null;
  maturityAt?: string | null;
  estimationBaseDate?: string | null;
  estimatedThrough?: string | null;
  cdbEstimateComparisonApproximate?: boolean;
  cdbEstimateStatus?: "complete" | "provisional" | "unavailable" | null;
  cdbEstimateLimitation?: string | null;
  sourceSnapshotId?: string;
  allocationCdiInputs?: {
    assetCode: string | null;
    cdiPercentage: string | null;
    rates: Array<{ rateDate: string; annualRate: string; fetchedAt?: Date }>;
  };
};

function valueFor(position: RawPosition) {
  if (position.canonicalValueCents !== undefined) {
    return {
      cents:
        position.canonicalValueCents === null
          ? null
          : BigInt(position.canonicalValueCents),
      source: position.canonicalValueSource ?? "UNVALUED",
    };
  }
  return resolvePositionMoney(position);
}

export class PortfolioObjectivesService {
  constructor(
    private readonly allocationStateLimit = portfolioObjectiveAllocationStateLimit,
  ) {}

  async getOverview(
    requestId?: string,
    valuationDate?: string,
    evaluatedPositions?: RawPosition[],
    includeAllocationFingerprint = false,
  ) {
    const [stored, reserveSettings, balanceReferences] = await Promise.all([
      portfolioObjectivesRepository.list(),
      emergencyReserveRepository.getSettings(),
      portfolioObjectivesRepository.listLatestBalanceReferences(),
    ]);
    const balanceProjectionResults = await objectiveBalanceService
      .projectLatest(
        balanceReferences as ObjectiveBalanceReference[],
        valuationDate,
      )
      .catch(() => new Map<string, ObjectiveBalanceProjectionResult>());
    const classified = evaluatedPositions
      ? evaluatedPositions
      : await portfolioAllocationService.classifyPositions(
          await portfolioPositionService.listCurrentEnriched(
            requestId,
            valuationDate,
          ),
          requestId,
        );
    const positions = this.groupPositions(classified as RawPosition[]);
    const assignedByObjective = new Map<string, string[]>();
    const objectiveByAssetKey = new Map<string, string>();
    for (const assignment of stored.assignments) {
      const keys = assignedByObjective.get(assignment.objectiveId) ?? [];
      keys.push(assignment.assetKey);
      assignedByObjective.set(assignment.objectiveId, keys);
      objectiveByAssetKey.set(assignment.assetKey, assignment.objectiveId);
    }
    const reserveExpenseCents = decimalToCents(
      reserveSettings?.monthlyExpenses,
    );
    const reserveTargetCents =
      reserveExpenseCents !== null && reserveSettings?.targetMonths
        ? reserveExpenseCents * BigInt(reserveSettings.targetMonths)
        : null;
    const objectives = stored.objectives.map((objective) => {
      const assignedAssetKeys = assignedByObjective.get(objective.id) ?? [];
      const current = calculateObjectiveValue(assignedAssetKeys, positions);
      const targetAmountCents =
        objective.kind === "RESERVE"
          ? reserveTargetCents
          : objective.targetAmount === null
            ? null
            : decimalToCents(objective.targetAmount);
      const targetAmount =
        targetAmountCents === null ? null : centsToNumber(targetAmountCents);
      const currentValueCents = current.currentValueCents;
      const remainingAmountCents =
        targetAmountCents === null || currentValueCents === null
          ? null
          : (() => {
              const difference = targetAmountCents - BigInt(currentValueCents);
              return (difference > 0n ? difference : 0n).toString();
            })();
      return {
        id: objective.id,
        kind: objective.kind,
        name: objective.name,
        targetAmount,
        targetAmountCents: targetAmountCents?.toString() ?? null,
        monthlyPlannedAmount:
          objective.monthlyPlannedAmount === null
            ? null
            : centsToNumber(
                decimalToCents(objective.monthlyPlannedAmount) ?? 0n,
              ),
        monthlyPlannedAmountCents:
          objective.monthlyPlannedAmount === null
            ? null
            : (decimalToCents(objective.monthlyPlannedAmount)?.toString() ??
              null),
        currentValue: current.currentValue,
        currentValueCents,
        knownValue: current.knownValue,
        knownValueCents: current.knownValueCents,
        remainingAmount:
          targetAmount === null || current.currentValue === null
            ? null
            : Math.max(targetAmount - current.currentValue, 0),
        remainingAmountCents,
        progressPercent:
          targetAmount === null ||
          targetAmount <= 0 ||
          current.currentValue === null
            ? null
            : Math.min((current.currentValue / targetAmount) * 100, 100),
        assignedPositionCount: assignedAssetKeys.reduce(
          (total, assetKey) =>
            total +
            (positions.find((position) => position.assetKey === assetKey)
              ?.positionCount ?? 1),
          0,
        ),
        missingPositionCount: current.missingPositionCount,
        unvaluedPositionCount: current.unvaluedPositionCount,
        assignedAssetKeys,
        canEditAssignments: objective.id !== reserveObjectiveId,
        balanceTracking: (() => {
          const observed = balanceReferences.find(
            (reference) => reference.objectiveId === objective.id,
          );
          if (!observed) return null;
          const projectionResult = balanceProjectionResults.get(objective.id);
          return {
            observedAmountCents: observed.amountCents,
            observedOn: observed.observedDate,
            cdiPercentage: observed.cdiPercentage,
            projection: projectionResult?.projection ?? null,
            projectionUnavailableReason:
              projectionResult?.unavailableReason ??
              (observed.cdiPercentage === null
                ? "missing_conditions"
                : "rates_unavailable"),
          };
        })(),
      };
    });
    const unassignedPositions = positions.filter(
      (position) => !objectiveByAssetKey.has(position.assetKey),
    );
    const unassignedKnownValueCents = sumMoneyCents(
      unassignedPositions.map((position) => BigInt(position.knownValueCents!)),
    );
    const unassignedKnownValue = centsToNumber(unassignedKnownValueCents)!;
    const reserveKnownValueCents = BigInt(
      objectives.find((objective) => objective.kind === "RESERVE")
        ?.knownValueCents ?? "0",
    );
    const personalKnownValueCents = sumMoneyCents(
      objectives
        .filter((objective) => objective.kind !== "RESERVE")
        .map((objective) => BigInt(objective.knownValueCents)),
    );
    const destinationsKnownTotalCents = sumMoneyCents([
      reserveKnownValueCents,
      personalKnownValueCents,
      unassignedKnownValueCents,
    ]);
    const destinationValues = [
      { key: "reserve", valueCents: reserveKnownValueCents },
      { key: "personal", valueCents: personalKnownValueCents },
      { key: "unassigned", valueCents: unassignedKnownValueCents },
    ];
    const overview = {
      objectives,
      balanceReferences,
      destinationSummary: {
        categories: destinationValues.map(({ key, valueCents }) => ({
          key,
          value: centsToNumber(valueCents)!,
          valueCents: valueCents.toString(),
          percentage:
            destinationsKnownTotalCents > 0n
              ? (Number(valueCents) / Number(destinationsKnownTotalCents)) * 100
              : 0,
        })),
        knownTotal: centsToNumber(destinationsKnownTotalCents)!,
        knownTotalCents: destinationsKnownTotalCents.toString(),
        missingPositionCount: objectives.reduce(
          (total, objective) => total + objective.missingPositionCount,
          0,
        ),
        unvaluedPositionCount:
          unassignedPositions.reduce(
            (total, position) => total + position.unvaluedPositions,
            0,
          ) +
          objectives.reduce(
            (total, objective) => total + objective.unvaluedPositionCount,
            0,
          ),
      },
      positions: positions.map((position) => ({
        ...position,
        objectiveId: objectiveByAssetKey.get(position.assetKey) ?? null,
        objectiveName:
          stored.objectives.find(
            (objective) =>
              objective.id === objectiveByAssetKey.get(position.assetKey),
          )?.name ?? null,
      })),
      unassignedKnownValue,
      unassignedKnownValueCents: unassignedKnownValueCents.toString(),
      unassignedPositionCount: unassignedPositions.reduce(
        (total, position) => total + position.positionCount,
        0,
      ),
      unassignedUnvaluedPositionCount: unassignedPositions.reduce(
        (total, position) => total + position.unvaluedPositions,
        0,
      ),
    };
    if (!includeAllocationFingerprint) return overview;
    return {
      ...overview,
      allocationSourceFingerprint: createAllocationSourceFingerprint({
        valuationDate: valuationDate ?? todayInSaoPaulo(),
        positions: classified as RawPosition[],
        assignments: stored.assignments.map(({ assetKey, objectiveId }) => ({
          assetKey,
          objectiveId,
        })),
        objectives: stored.objectives.map(({ id, name, kind }) => ({
          id,
          name,
          kind,
        })),
      }),
    };
  }

  async create(body: unknown) {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError(
        "Informe um nome válido e revise a meta em reais, se preenchida.",
        400,
      );
    }
    const { name, targetAmount, monthlyPlannedAmount } = parsed.data;
    const objective = await portfolioObjectivesRepository.create({
      name,
      targetAmount: targetAmount == null ? null : targetAmount.toFixed(2),
      monthlyPlannedAmount:
        monthlyPlannedAmount == null ? null : monthlyPlannedAmount.toFixed(2),
    });
    return objective;
  }

  async previewGlobalAllocation(body: unknown, requestId?: string) {
    const parsed = allocationSchema.safeParse(body);
    if (!parsed.success)
      throw new ApplicationError(
        "Informe pelo menos um saldo válido e uma data de consulta.",
        400,
      );
    if (
      new Set(parsed.data.balances.map((balance) => balance.objectiveId))
        .size !== parsed.data.balances.length
    ) {
      throw new ApplicationError(
        "Cada objetivo pode ter apenas um saldo informado.",
        400,
      );
    }
    const overview = await this.getOverview(
      requestId,
      parsed.data.valuationDate,
      undefined,
      true,
    );
    const balances = parsed.data.balances.map((balance) => {
      if (
        !overview.objectives.some(
          (objective) => objective.id === balance.objectiveId,
        )
      ) {
        throw new ApplicationError(
          "Um objetivo informado não está mais disponível.",
          409,
        );
      }
      const amountCents = decimalToCents(balance.amount)!;
      return { objectiveId: balance.objectiveId, amountCents };
    });
    const measuredObjectiveIds = new Set(
      balances.map((balance) => balance.objectiveId),
    );
    const eligiblePositions = overview.positions.filter(
      (position) =>
        position.valueCents !== null &&
        (position.objectiveId === null ||
          measuredObjectiveIds.has(position.objectiveId)),
    );
    const positions = eligiblePositions.map((position) => ({
      assetKey: position.assetKey,
      valueCents: BigInt(position.valueCents!),
      objectiveId: position.objectiveId,
    }));
    const result = solvePortfolioObjectiveAllocation(
      positions,
      balances,
      this.allocationStateLimit,
    );
    const objectiveById = new Map(
      overview.objectives.map((objective) => [objective.id, objective]),
    );
    const eligiblePositionByKey = new Map(
      eligiblePositions.map((position) => [position.assetKey, position]),
    );
    const allocation = result.allocation;
    const expectedOwners = Object.fromEntries(
      positions.map((position) => [position.assetKey, position.objectiveId]),
    );
    const expectedValueCents = Object.fromEntries(
      positions.map((position) => [
        position.assetKey,
        position.valueCents.toString(),
      ]),
    );
    const expectedValuationDates = Object.fromEntries(
      eligiblePositions.map((position) => [
        position.assetKey,
        position.estimatedThrough ?? position.referenceDate,
      ]),
    );
    const transfers = positions.flatMap((position) => {
      const toObjectiveId = allocation[position.assetKey] ?? null;
      if (
        !position.objectiveId ||
        !toObjectiveId ||
        position.objectiveId === toObjectiveId
      )
        return [];
      const positionDetails = eligiblePositionByKey.get(position.assetKey)!;
      return [
        {
          assetKey: position.assetKey,
          product: positionDetails.product,
          assetCode: positionDetails.assetCode,
          maturityAt: positionDetails.maturityAt ?? null,
          fromObjectiveId: position.objectiveId,
          fromObjectiveName: objectiveById.get(position.objectiveId)!.name,
          toObjectiveId,
          toObjectiveName: objectiveById.get(toObjectiveId)!.name,
          valueCents: position.valueCents.toString(),
        },
      ];
    });
    const totals = balances.map((balance) => {
      const objective = objectiveById.get(balance.objectiveId)!;
      const proposedValueCents = result.totals[balance.objectiveId];
      return {
        objectiveId: objective.id,
        name: objective.name,
        observedBalanceCents: balance.amountCents.toString(),
        proposedValueCents: proposedValueCents.toString(),
        differenceCents: (proposedValueCents - balance.amountCents).toString(),
        assetKeys: Object.entries(allocation)
          .filter(([, id]) => id === objective.id)
          .map(([assetKey]) => assetKey)
          .sort(),
      };
    });
    const unassignedPositions = eligiblePositions
      .filter((position) => allocation[position.assetKey] === null)
      .map((position) => ({
        assetKey: position.assetKey,
        product: position.product,
        valueCents: position.valueCents!,
      }));
    const unassignmentTransfers = eligiblePositions
      .filter(
        (position) =>
          position.objectiveId !== null &&
          allocation[position.assetKey] === null,
      )
      .map((position) => ({
        assetKey: position.assetKey,
        product: position.product,
        assetCode: position.assetCode,
        maturityAt: position.maturityAt ?? null,
        fromObjectiveId: position.objectiveId!,
        fromObjectiveName: objectiveById.get(position.objectiveId!)!.name,
        valueCents: position.valueCents!,
      }));
    const preservedPositions = overview.positions.flatMap((position) => {
      const reasons: Array<
        | { code: "value_unavailable"; limitation: string | null }
        | { code: "objective_balance_not_provided" }
      > = [];
      if (position.valueCents === null) {
        reasons.push({
          code: "value_unavailable",
          limitation: position.cdbEstimateLimitation ?? null,
        });
      }
      if (
        position.objectiveId !== null &&
        !measuredObjectiveIds.has(position.objectiveId)
      ) {
        reasons.push({ code: "objective_balance_not_provided" });
      }
      if (!reasons.length) return [];
      return [
        {
          assetKey: position.assetKey,
          product: position.product,
          ownerObjectiveId: position.objectiveId,
          ownerObjectiveName: position.objectiveId
            ? objectiveById.get(position.objectiveId)!.name
            : null,
          valueCents: position.valueCents,
          reasons,
        },
      ];
    });
    const effectiveValuationDates = [
      ...new Set(
        eligiblePositions
          .map(
            (position) => position.estimatedThrough ?? position.referenceDate,
          )
          .filter((date): date is string => Boolean(date)),
      ),
    ].sort();
    const limitations = [
      ...new Set(
        eligiblePositions
          .map((position) => position.cdbEstimateLimitation)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    return {
      valuationDate: parsed.data.valuationDate,
      effectiveValuationDates,
      optimal: result.optimal,
      exploredStates: result.exploredStates,
      stateLimit: this.allocationStateLimit,
      canConfirm: true,
      allocation,
      expectedOwners,
      expectedValueCents,
      expectedValuationDates,
      expectedSourceFingerprint: (
        overview as typeof overview & { allocationSourceFingerprint: string }
      ).allocationSourceFingerprint,
      objectives: totals,
      transfers,
      unassignedPositions,
      unassignmentTransfers,
      preservedPositions,
      preservedPositionCount: preservedPositions.length,
      limitations,
      mathematicalDistributionNotice:
        "A distribuição organiza posições por valor. Ela não confirma quais notas compõem cada saldo informado no banco.",
    };
  }

  async confirmGlobalAllocation(body: unknown, requestId?: string) {
    const parsed = allocationSchema
      .extend({
        allocation: z.record(z.string(), z.string().uuid().nullable()),
        expectedOwners: z.record(z.string(), z.string().uuid().nullable()),
        expectedValueCents: z.record(z.string(), z.string().regex(/^\d+$/)),
        expectedValuationDates: z.record(
          z.string(),
          z.string().refine(isValidValuationDate).nullable(),
        ),
        expectedSourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        acceptPartial: z.boolean().optional().default(false),
      })
      .safeParse(body);
    if (!parsed.success)
      throw new ApplicationError(
        "A prévia da distribuição está inválida. Faça uma nova busca.",
        400,
      );
    const preview = await this.previewGlobalAllocation(
      {
        valuationDate: parsed.data.valuationDate,
        balances: parsed.data.balances,
      },
      requestId,
    );
    if (!preview.optimal && !parsed.data.acceptPartial)
      throw new ApplicationError(
        "A busca foi parcial. Revise as diferenças e transferências e confirme explicitamente esta candidata.",
        409,
      );
    if (
      !sameRecord(parsed.data.allocation, preview.allocation) ||
      !sameRecord(parsed.data.expectedOwners, preview.expectedOwners) ||
      !sameRecord(parsed.data.expectedValueCents, preview.expectedValueCents) ||
      !sameRecord(
        parsed.data.expectedValuationDates,
        preview.expectedValuationDates,
      ) ||
      parsed.data.expectedSourceFingerprint !==
        preview.expectedSourceFingerprint
    ) {
      throw new ApplicationError(
        "A prévia mudou desde a busca. Faça uma nova busca antes de confirmar.",
        409,
      );
    }
    const references = parsed.data.balances.map((balance) => ({
      objectiveId: balance.objectiveId,
      amountCents: decimalToCents(balance.amount)!.toString(),
    }));
    return portfolioObjectivesRepository.saveGlobalAllocation({
      observedOn: parsed.data.valuationDate,
      expectedOwners: preview.expectedOwners,
      allocation: preview.allocation,
      references,
      expectedSourceFingerprint: parsed.data.expectedSourceFingerprint,
    });
  }

  async updateAssignments(objectiveId: string, body: unknown) {
    const parsed = assignmentsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError("Revise as posições selecionadas.", 400);
    }
    const objective =
      await portfolioObjectivesRepository.getObjective(objectiveId);
    if (!objective) throw new ApplicationError("Objetivo não encontrado.", 404);
    if (objective.id === reserveObjectiveId) {
      throw new ApplicationError(
        "A seleção da reserva deve ser alterada em Configurar reserva.",
        400,
      );
    }
    const assetKeys = [...new Set(parsed.data.assetKeys)];
    const transfers = parsed.data.transfers;
    if (
      new Set(transfers.map((transfer) => transfer.assetKey)).size !==
        transfers.length ||
      transfers.some(
        (transfer) =>
          !assetKeys.includes(transfer.assetKey) ||
          transfer.toObjectiveId !== objectiveId,
      )
    ) {
      throw new ApplicationError("Revise as transferências selecionadas.", 400);
    }
    const current = await this.getOverview();
    const currentKeys = new Set(
      current.positions.map((position) => position.assetKey),
    );
    if (assetKeys.some((assetKey) => !currentKeys.has(assetKey))) {
      throw new ApplicationError(
        "Uma posição mudou desde a última atualização. Atualize a carteira e tente novamente.",
        409,
      );
    }
    const conflicts = current.positions.filter(
      (position) =>
        assetKeys.includes(position.assetKey) &&
        position.objectiveId !== null &&
        position.objectiveId !== objectiveId &&
        transfers.find((transfer) => transfer.assetKey === position.assetKey)
          ?.fromObjectiveId !== position.objectiveId,
    );
    if (conflicts.length) {
      throw new ApplicationError(
        `Esta seleção inclui posição(ões) já vinculada(s) a ${conflicts[0].objectiveName}. Remova-as do outro objetivo antes de continuar.`,
        409,
      );
    }
    const invalidTransfer = transfers.find(
      (transfer) =>
        current.positions.find(
          (position) => position.assetKey === transfer.assetKey,
        )?.objectiveId !== transfer.fromObjectiveId,
    );
    if (invalidTransfer) {
      throw new ApplicationError(
        "Uma posição mudou de destino desde a busca. Atualize os objetivos e tente novamente.",
        409,
      );
    }
    await portfolioObjectivesRepository.replaceAssignmentsWithTransfers(
      objectiveId,
      assetKeys,
      transfers,
    );
  }

  async findPositionCombinations(body: unknown, requestId?: string) {
    const parsed = suggestionsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError("Informe um valor válido para comparar.", 400);
    }
    const { targetAmount, instrumentType } = parsed.data;
    const valuationDate = parsed.data.valuationDate ?? todayInSaoPaulo();
    const overview = await this.getOverview(requestId, valuationDate);
    const targetObjective = overview.objectives.find(
      (objective) => objective.id === parsed.data.objectiveId,
    );
    const objectiveId = targetObjective?.id;
    const eligible = overview.positions.filter(
      (position) =>
        position.objectiveId === null ||
        (objectiveId !== undefined && position.objectiveId === objectiveId),
    );
    const candidates =
      instrumentType === "CDB"
        ? eligible.filter(
            (position) =>
              position.assetClass === "Renda fixa" &&
              /^CDB(?:\b|\s|-)/i.test(position.product.trim()),
          )
        : eligible;
    const toHolding = (position: (typeof overview.positions)[number]) => ({
      assetKey: position.assetKey,
      product: position.product,
      institution: position.institution,
      value: position.value,
      valueCents: position.valueCents ?? null,
      canonicalValueSource: position.canonicalValueSource,
      estimationBaseDate: position.estimationBaseDate ?? null,
      estimatedThrough: position.estimatedThrough ?? null,
      cdbEstimateComparisonApproximate:
        position.cdbEstimateComparisonApproximate ?? false,
      referenceDate: position.referenceDate ?? null,
      cdbEstimateStatus: position.cdbEstimateStatus ?? null,
      cdbEstimateLimitation: position.cdbEstimateLimitation ?? null,
    });
    let result = suggestEmergencyReservePositions(
      targetAmount,
      candidates.map((position) => ({
        ...toHolding(position),
      })),
    );
    const eligibleKeys = new Set(
      candidates.map((position) => position.assetKey),
    );
    const expandedPositions = overview.positions.filter((position) =>
      instrumentType === "CDB"
        ? position.assetClass === "Renda fixa" &&
          /^CDB(?:\b|\s|-)/i.test(position.product.trim())
        : true,
    );
    const hasTransferCandidates = expandedPositions.some(
      (position) => !eligibleKeys.has(position.assetKey),
    );
    if (
      objectiveId &&
      hasTransferCandidates &&
      !(result.status === "suggestions" && result.kind === "exact")
    ) {
      const expanded = suggestEmergencyReservePositions(
        targetAmount,
        expandedPositions.map(toHolding),
      );
      if (expanded.status === "suggestions") {
        const baselineDifference = closestDifferenceCents(result);
        // A suggestions result from the shared search always has candidates.
        const expandedDifference = closestDifferenceCents(expanded)!;
        const baselineWasPartial =
          result.status === "suggestions" && result.searchLimited;
        if (result.status === "suggestions") {
          result = {
            ...result,
            searchLimited: result.searchLimited || expanded.searchLimited,
          };
        }
        if (
          baselineDifference === null ||
          expandedDifference < baselineDifference ||
          (baselineWasPartial && expandedDifference === baselineDifference)
        ) {
          const positionByKey = new Map(
            overview.positions.map((position) => [position.assetKey, position]),
          );
          const objectivesById = new Map(
            overview.objectives.map((objective) => [objective.id, objective]),
          );
          const expandedCandidates = expanded.candidates.map((candidate) => {
            const candidateCentsByKey = new Map(
              candidate.positions.map((position) => [
                position.assetKey,
                BigInt(position.valueCents),
              ]),
            );
            const transfers = candidate.assetKeys.flatMap((assetKey) => {
              const position = positionByKey.get(assetKey)!;
              if (!position.objectiveId || position.objectiveId === objectiveId)
                return [];
              return [
                {
                  assetKey,
                  product: position.product,
                  value: centsToNumber(candidateCentsByKey.get(assetKey)!)!,
                  fromObjectiveId: position.objectiveId,
                  fromObjectiveName: position.objectiveName ?? "Outro objetivo",
                  toObjectiveId: objectiveId,
                },
              ];
            });
            const removedByObjective = new Map<string, bigint>();
            for (const transfer of transfers) {
              const transferredCents = candidateCentsByKey.get(
                transfer.assetKey,
              )!;
              removedByObjective.set(
                transfer.fromObjectiveId,
                (removedByObjective.get(transfer.fromObjectiveId) ?? 0n) +
                  transferredCents,
              );
            }
            const impacts = [
              {
                objectiveId,
                objectiveName: targetObjective!.name,
                currentValue: centsToNumber(BigInt(candidate.totalCents)),
                knownValue: centsToNumber(BigInt(candidate.totalCents))!,
                targetAmount: targetObjective!.targetAmount,
                progressPercent: targetObjective!.targetAmount
                  ? Math.min(
                      (candidate.total / targetObjective!.targetAmount!) * 100,
                      100,
                    )
                  : null,
                transferredValue: centsToNumber(
                  transfers.reduce(
                    (sum, transfer) =>
                      sum + candidateCentsByKey.get(transfer.assetKey)!,
                    0n,
                  ),
                )!,
                transferredPositionCount: transfers.length,
              },
              ...[...removedByObjective].map(([sourceId, removedCents]) => {
                const source = objectivesById.get(sourceId);
                const sourceCurrentCents = source?.currentValueCents ?? null;
                const sourceKnownCents = BigInt(source?.knownValueCents ?? "0");
                const currentValue =
                  sourceCurrentCents === null ||
                  sourceCurrentCents === undefined
                    ? null
                    : centsToNumber(
                        BigInt(sourceCurrentCents) > removedCents
                          ? BigInt(sourceCurrentCents) - removedCents
                          : 0n,
                      );
                return {
                  objectiveId: sourceId,
                  objectiveName: source?.name ?? "Outro objetivo",
                  currentValue,
                  knownValue: centsToNumber(
                    sourceKnownCents > removedCents
                      ? sourceKnownCents - removedCents
                      : 0n,
                  )!,
                  targetAmount: source?.targetAmount ?? null,
                  progressPercent:
                    currentValue === null || !source?.targetAmount
                      ? null
                      : Math.min(
                          (currentValue / source.targetAmount) * 100,
                          100,
                        ),
                  transferredValue: centsToNumber(removedCents)!,
                  transferredPositionCount: transfers.filter(
                    (transfer) => transfer.fromObjectiveId === sourceId,
                  ).length,
                };
              }),
            ];
            return { ...candidate, transfers, impacts };
          });
          const merged =
            baselineWasPartial && result.status === "suggestions"
              ? mergePartialPositionCandidates(
                  result.candidates,
                  expandedCandidates,
                  result.alternativesLimited || expanded.alternativesLimited,
                )
              : {
                  candidates: expandedCandidates,
                  alternativesLimited: expanded.alternativesLimited,
                };
          result = {
            ...expanded,
            searchLimited:
              expanded.searchLimited ||
              (result.status === "suggestions" && result.searchLimited),
            kind: merged.candidates.some(
              (candidate) => BigInt(candidate.differenceCents) === 0n,
            )
              ? "exact"
              : "nearest",
            candidates: merged.candidates,
            alternativesLimited: merged.alternativesLimited,
          };
        }
      } else if (expanded.status === "too_many_positions") {
        result =
          result.status === "suggestions"
            ? { ...result, searchLimited: true }
            : expanded;
      }
    }
    return { ...result, valuationDate };
  }

  async update(objectiveId: string, body: unknown) {
    const parsed = updateSchema.safeParse({
      ...(body as object),
      objectiveId,
    });
    if (!parsed.success) {
      throw new ApplicationError(
        "Revise o nome e os valores preenchidos.",
        400,
      );
    }
    const objective =
      await portfolioObjectivesRepository.getObjective(objectiveId);
    if (!objective) throw new ApplicationError("Objetivo não encontrado.", 404);
    if (objective.id === reserveObjectiveId) {
      throw new ApplicationError(
        "A configuração da reserva deve ser alterada em Configurar reserva.",
        400,
      );
    }
    const updated = await portfolioObjectivesRepository.update(objectiveId, {
      name: parsed.data.name,
      targetAmount:
        parsed.data.targetAmount == null
          ? null
          : parsed.data.targetAmount.toFixed(2),
      monthlyPlannedAmount:
        parsed.data.monthlyPlannedAmount == null
          ? null
          : parsed.data.monthlyPlannedAmount.toFixed(2),
    });
    if (!updated) throw new ApplicationError("Objetivo não encontrado.", 404);
    return updated;
  }

  async delete(objectiveId: string, body: unknown) {
    const parsed = deleteSchema.safeParse({ ...(body as object), objectiveId });
    if (!parsed.success) throw new ApplicationError("Objetivo inválido.", 400);
    const objective =
      await portfolioObjectivesRepository.getObjective(objectiveId);
    if (!objective) throw new ApplicationError("Objetivo não encontrado.", 404);
    if (objective.id === reserveObjectiveId) {
      throw new ApplicationError("A Reserva não pode ser excluída.", 400);
    }
    const deleted = await portfolioObjectivesRepository.delete(objectiveId);
    if (!deleted) throw new ApplicationError("Objetivo não encontrado.", 404);
    return deleted;
  }

  private groupPositions(rawPositions: RawPosition[]): ObjectivePosition[] {
    const grouped = new Map<
      string,
      {
        assetKey: string;
        product: string;
        assetCode: string | null;
        maturityAt: string | null;
        institution: string | null;
        assetClass: string | null;
        positionCount: number;
        valueCents: bigint | null;
        knownValueCents: bigint;
        unvaluedPositions: number;
        referenceDate: string | null;
        estimationBaseDate: string | null;
        estimatedThrough: string | null;
        cdbEstimateComparisonApproximate: boolean | null;
        cdbEstimateStatus: "complete" | "provisional" | "unavailable" | null;
        cdbEstimateLimitation: string | null;
        source: string | null;
        canonicalValueSource: PortfolioMoneySource;
        allValuesKnown: boolean;
      }
    >();
    for (const position of rawPositions) {
      const assetKey =
        position.source === "MANUAL" && position.assetKey
          ? position.assetKey
          : getEmergencyReserveAssetKey({
              product: position.product,
              assetCode: position.assetCode,
              institution: position.institution,
              issuer: position.issuer ?? null,
              indexer: position.indexer ?? null,
              regimeType: position.regimeType ?? null,
              issuedAt: position.issuedAt ?? null,
              maturityAt: position.maturityAt ?? null,
            });
      const { cents, source } = valueFor(position);
      const existing = grouped.get(assetKey);
      if (existing) {
        if (existing.maturityAt !== (position.maturityAt ?? null))
          existing.maturityAt = null;
        if (
          existing.estimationBaseDate !== (position.estimationBaseDate ?? null)
        )
          existing.estimationBaseDate = null;
        if (existing.estimatedThrough !== (position.estimatedThrough ?? null))
          existing.estimatedThrough = null;
        if (
          existing.cdbEstimateComparisonApproximate !==
          (position.cdbEstimateComparisonApproximate ?? null)
        )
          existing.cdbEstimateComparisonApproximate = null;
        if (existing.cdbEstimateStatus !== (position.cdbEstimateStatus ?? null))
          existing.cdbEstimateStatus = null;
        if (
          position.cdbEstimateLimitation &&
          !existing.cdbEstimateLimitation?.includes(
            position.cdbEstimateLimitation,
          )
        )
          existing.cdbEstimateLimitation = [
            existing.cdbEstimateLimitation,
            position.cdbEstimateLimitation,
          ]
            .filter(Boolean)
            .join(" · ");
        if (existing.canonicalValueSource !== source)
          existing.canonicalValueSource = "MIXED";
        existing.positionCount += 1;
        if (cents === null) {
          existing.unvaluedPositions += 1;
          existing.allValuesKnown = false;
        } else {
          existing.valueCents = (existing.valueCents ?? 0n) + cents;
          existing.knownValueCents += cents;
        }
        continue;
      }
      grouped.set(assetKey, {
        assetKey,
        product: position.product,
        assetCode: position.assetCode,
        maturityAt: position.maturityAt ?? null,
        institution: position.institution,
        assetClass: position.classification?.assetClass ?? null,
        positionCount: 1,
        valueCents: cents,
        knownValueCents: cents ?? 0n,
        unvaluedPositions: cents === null ? 1 : 0,
        referenceDate: position.referenceDate ?? null,
        estimationBaseDate: position.estimationBaseDate ?? null,
        estimatedThrough: position.estimatedThrough ?? null,
        cdbEstimateComparisonApproximate:
          position.cdbEstimateComparisonApproximate ?? null,
        cdbEstimateStatus: position.cdbEstimateStatus ?? null,
        cdbEstimateLimitation: position.cdbEstimateLimitation ?? null,
        source: position.source ?? null,
        canonicalValueSource: source,
        allValuesKnown: cents !== null,
      });
    }
    return [...grouped.values()].map(
      ({ allValuesKnown, valueCents, knownValueCents, ...position }) => ({
        ...position,
        valueCents: allValuesKnown ? valueCents!.toString() : null,
        value: allValuesKnown ? centsToNumber(valueCents) : null,
        knownValueCents: knownValueCents.toString(),
        knownValue: centsToNumber(knownValueCents)!,
      }),
    );
  }
}

export const portfolioObjectivesService = new PortfolioObjectivesService();

function sameRecord(
  left: Record<string, string | null>,
  right: Record<string, string | null>,
) {
  const sortEntries = (entries: Array<[string, string | null]>) =>
    entries.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  return (
    JSON.stringify(sortEntries(Object.entries(left))) ===
    JSON.stringify(sortEntries(Object.entries(right)))
  );
}

function closestDifferenceCents(
  result: ReturnType<typeof suggestEmergencyReservePositions>,
) {
  if (result.status !== "suggestions") return null;
  return result.candidates.reduce<bigint | null>((closest, candidate) => {
    const difference = BigInt(candidate.differenceCents);
    const absoluteDifference = difference < 0n ? -difference : difference;
    return closest === null || absoluteDifference < closest
      ? absoluteDifference
      : closest;
  }, null);
}
