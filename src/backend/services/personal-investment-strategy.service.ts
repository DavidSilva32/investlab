import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { personalInvestmentStrategyRepository } from "@/backend/repositories/personal-investment-strategy.repository";
import { portfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import { portfolioObjectivesService } from "@/backend/services/portfolio-objectives.service";
import { portfolioPositionService } from "@/backend/services/portfolio-position.service";
import { emergencyReserveService } from "@/backend/services/emergency-reserve.service";
import { todayInSaoPaulo } from "@/lib/valuation-date";
import { allocateCentsByProportionalGap } from "@/lib/proportional-cent-allocation";
import { calculateReservePriorityAmounts } from "@/lib/contribution-allocation";
import {
  getStrategyAssetClassId,
  simulateStrategyContribution,
  strategyAssetClasses,
  type StrategyAllocationPercentages,
} from "@/lib/strategy-allocation";

const answerSchema = z.object({
  horizonYears: z.number().int().min(1).max(100),
  internationalInterest: z.enum(["interested", "not_interested", "unsure"]),
});
const saveSchema = z.object({
  answers: answerSchema,
  selectedDirection: z.enum(["review_horizon", "consider_international"]),
});
const allocationPercentagesSchema = z
  .object({
    fixed_income: z.number().finite().min(0).max(100),
    brazilian_equities: z.number().finite().min(0).max(100),
    international_etfs: z.number().finite().min(0).max(100),
    fiis: z.number().finite().min(0).max(100),
  })
  .strict()
  .refine(
    (percentages) =>
      Object.values(percentages).every(
        (percentage) =>
          Math.abs(percentage * 100 - Math.round(percentage * 100)) < 1e-7,
      ) &&
      Object.values(percentages).reduce(
        (total, percentage) => total + Math.round(percentage * 100),
        0,
      ) === 10000,
  );
const contributionSchema = z.object({
  contributionAmount: z
    .number()
    .finite()
    .positive()
    .max(1_000_000_000_000)
    .refine(
      (amount) => Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-7,
    ),
  allocationPercentages: allocationPercentagesSchema,
});

const groups = strategyAssetClasses;

type Position = {
  positionCount: number;
  product: string;
  valueCents: string | null;
  objectiveId: string | null;
  objectivePurpose: string | null;
  assetClass: string | null;
  geography: string | null;
  maturityAt: string | null;
  estimatedThrough: string | null;
  referenceDate: string | null;
  unvaluedPositions: number;
};

export class PersonalInvestmentStrategyService {
  constructor(
    private readonly positions = portfolioPositionService,
    private readonly allocation = portfolioAllocationService,
    private readonly objectives = portfolioObjectivesService,
    private readonly repository = personalInvestmentStrategyRepository,
    private readonly reserve = emergencyReserveService,
    private readonly today = todayInSaoPaulo,
  ) {}

  async getOverview(requestId?: string) {
    const valuationDate = this.today();
    const evaluated = await this.positions.listCurrentEnriched(
      requestId,
      valuationDate,
    );
    const classified = await this.allocation.classifyPositions(
      evaluated,
      requestId,
    );
    const objectiveOverview = await this.objectives.getOverview(
      requestId,
      valuationDate,
      classified,
    );
    const positions = objectiveOverview.positions as Position[];
    const known = positions.filter((position) => position.valueCents !== null);
    const totalCents = known.reduce(
      (total, position) => total + BigInt(position.valueCents!),
      0n,
    );
    const longTerm = positions.filter(
      (position) => position.objectivePurpose === "LONG_TERM_INVESTMENT",
    );
    const longTermKnown = longTerm.filter(
      (position) => position.valueCents !== null,
    );
    const longTermCents = longTermKnown.reduce(
      (total, position) => total + BigInt(position.valueCents!),
      0n,
    );
    const dates = [
      ...new Set(
        longTerm
          .map(
            (position) => position.estimatedThrough ?? position.referenceDate,
          )
          .filter((date): date is string => date !== null),
      ),
    ].sort();
    const classValues = new Map<string, bigint>(
      groups.map(({ id }) => [id, 0n]),
    );
    let unclassifiedKnownCents = 0n;
    for (const position of longTermKnown) {
      const group = getStrategyAssetClassId(position);
      if (group) {
        classValues.set(
          group,
          classValues.get(group)! + BigInt(position.valueCents!),
        );
      } else {
        unclassifiedKnownCents += BigInt(position.valueCents!);
      }
    }
    const classifiedCents = groups.reduce(
      (sum, group) => sum + classValues.get(group.id)!,
      0n,
    );
    const representedBasisPoints =
      longTermCents === 0n
        ? 0n
        : (classifiedCents * 10000n + longTermCents / 2n) / longTermCents;
    const classBasisPoints = allocateCentsByProportionalGap(
      groups.map((group) => classValues.get(group.id)!),
      representedBasisPoints,
      false,
    );
    const saved = await this.repository.get(requestId);
    const maturityCounts = new Map<string, number>();
    for (const position of longTerm) {
      if (position.maturityAt) {
        maturityCounts.set(
          position.maturityAt,
          (maturityCounts.get(position.maturityAt) ?? 0) +
            position.positionCount,
        );
      }
    }
    return {
      valuationDate,
      totalWealth: {
        knownValueCents: totalCents.toString(),
        unvaluedPositionCount: positions
          .filter((position) => position.valueCents === null)
          .reduce((sum, position) => sum + position.unvaluedPositions, 0),
        positionCount: positions.reduce(
          (sum, position) => sum + position.positionCount,
          0,
        ),
      },
      longTermWealth: {
        knownValueCents: longTermCents.toString(),
        unvaluedPositionCount: longTerm
          .filter((position) => position.valueCents === null)
          .reduce((sum, position) => sum + position.unvaluedPositions, 0),
        positionCount: longTerm.reduce(
          (sum, position) => sum + position.positionCount,
          0,
        ),
        positionsWithoutMaturityDate: longTerm
          .filter((position) => !position.maturityAt)
          .reduce((sum, position) => sum + position.positionCount, 0),
        assignedPositionCount: longTerm
          .filter((position) => position.objectiveId !== null)
          .reduce((sum, position) => sum + position.positionCount, 0),
        unclassifiedKnownValueCents: unclassifiedKnownCents.toString(),
        classes: groups.map(({ id, label }, index) => {
          const knownValueCents = classValues.get(id)!;
          const percentageBasisPoints = classBasisPoints[index];
          return {
            id,
            label,
            knownValueCents: knownValueCents.toString(),
            percentageBasisPoints: Number(percentageBasisPoints),
            currentPercentage: Number(percentageBasisPoints) / 100,
          };
        }),
      },
      longTermMaturityDates: [...maturityCounts]
        .map(([date, count]) => ({ date, count }))
        .sort((left, right) => left.date.localeCompare(right.date)),
      longTermPositionsWithoutMaturityDate: longTerm
        .filter((position) => !position.maturityAt)
        .reduce((sum, position) => sum + position.positionCount, 0),
      destinationsNeedingPurposeConfirmation:
        objectiveOverview.objectives.filter(
          (objective: { kind: string; purpose: string | null }) =>
            objective.kind !== "RESERVE" && objective.purpose === null,
        ).length,
      valuationDates: dates,
      savedStrategy:
        saved?.answers && saved.selectedDirection
          ? {
              answers: saved.answers,
              selectedDirection: saved.selectedDirection,
              updatedAt: saved.updatedAt.toISOString(),
            }
          : null,
      savedAllocationPercentages: saved?.allocationPercentages ?? null,
      allocationActive: saved?.allocationActive ?? false,
    };
  }

  async saveComposition(body: unknown, requestId?: string) {
    const parsed = allocationPercentagesSchema.safeParse(
      (body as { allocationPercentages?: unknown } | null)
        ?.allocationPercentages,
    );
    if (!parsed.success) {
      throw new ApplicationError(
        "Informe percentuais entre 0% e 100%, com até duas casas decimais e total de 100%.",
        400,
      );
    }
    const allocationPercentages = parsed.data as StrategyAllocationPercentages;
    await this.repository.saveAllocationPercentages(
      allocationPercentages,
      requestId,
    );
    return allocationPercentages;
  }

  async activateAllocation(requestId?: string) {
    const saved = await this.repository.get(requestId);
    if (!saved?.allocationPercentages) {
      throw new ApplicationError(
        "Salve uma composição válida antes de ativá-la para o planejamento de aportes.",
        400,
      );
    }
    await this.repository.activateAllocation(requestId);
    return { allocationActive: true };
  }

  async simulateContribution(body: unknown, requestId?: string) {
    const parsed = this.validateContribution(body);
    const valuationDate = this.today();
    const evaluated = await this.positions.listCurrentEnriched(
      requestId,
      valuationDate,
    );
    const classified = await this.allocation.classifyPositions(
      evaluated,
      requestId,
    );
    const reserve = await this.reserve.getContributionContext(classified);
    const priority = calculateReservePriorityAmounts(
      parsed.contributionAmount,
      reserve.calculation,
    );
    const reserveCents = (value: number | null, cents?: string | null) =>
      cents ??
      (value === null
        ? null
        : String(Math.round((value + Number.EPSILON) * 100)));
    const reservePriority = {
      enteredContributionCents: String(priority.contributionCents),
      reserveContributionCents:
        priority.reserveCents === null ? null : String(priority.reserveCents),
      strategyContributionCents:
        priority.remainingCents === null
          ? null
          : String(priority.remainingCents),
      reserveStatus: priority.reserveStatus,
      reserveSelectedValueCents: reserveCents(
        reserve.calculation.selectedValue,
        reserve.calculation.selectedValueCents,
      ),
      reserveTargetValueCents: reserveCents(
        reserve.calculation.targetValue,
        reserve.calculation.targetValueCents,
      ),
      reserveDifferenceCents: reserveCents(
        reserve.calculation.difference,
        reserve.calculation.differenceCents,
      ),
    };
    if (priority.remainingCents === null || priority.remainingCents === 0) {
      return {
        ...reservePriority,
        simulation: null,
      };
    }
    const objectiveOverview = await this.objectives.getOverview(
      requestId,
      valuationDate,
      classified,
    );
    const positions = objectiveOverview.positions as Position[];
    const longTerm = positions.filter(
      (position) => position.objectivePurpose === "LONG_TERM_INVESTMENT",
    );
    const currentValuesCents = Object.fromEntries(
      groups.map(({ id }) => [id, "0"]),
    ) as Record<(typeof groups)[number]["id"], string>;
    let unclassifiedKnownValueCents = 0n;
    for (const position of longTerm) {
      if (position.valueCents === null) continue;
      const group = getStrategyAssetClassId(position);
      if (group) {
        currentValuesCents[group] = (
          BigInt(currentValuesCents[group]) + BigInt(position.valueCents)
        ).toString();
      } else {
        unclassifiedKnownValueCents += BigInt(position.valueCents);
      }
    }
    const result = simulateStrategyContribution({
      currentValuesCents,
      targetPercentages: parsed.allocationPercentages,
      contributionCents: String(priority.remainingCents),
    });
    return {
      ...reservePriority,
      simulation: {
        ...result,
        completeness: {
          complete:
            longTerm.every((position) => position.valueCents !== null) &&
            unclassifiedKnownValueCents === 0n,
          unvaluedPositionCount: longTerm
            .filter((position) => position.valueCents === null)
            .reduce((sum, position) => sum + position.unvaluedPositions, 0),
          unclassifiedKnownValueCents: unclassifiedKnownValueCents.toString(),
          valuationDate,
          valuationDates: [
            ...new Set(
              longTerm
                .map(
                  (position) =>
                    position.estimatedThrough ?? position.referenceDate,
                )
                .filter((date): date is string => date !== null),
            ),
          ].sort(),
        },
      },
    };
  }

  validateContribution(body: unknown) {
    const parsed = contributionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError(
        "Informe um aporte positivo e uma composição válida totalizando 100%.",
        400,
      );
    }
    return parsed.data;
  }

  async save(body: unknown, requestId?: string) {
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError(
        "Revise as respostas e escolha uma das direções apresentadas.",
        400,
      );
    }
    if (
      parsed.data.selectedDirection === "consider_international" &&
      parsed.data.answers.internationalInterest === "not_interested"
    ) {
      throw new ApplicationError(
        "Essa direção exige interesse em avaliar exposição internacional.",
        400,
      );
    }
    const record = await this.repository.save(
      parsed.data.answers,
      parsed.data.selectedDirection,
      requestId,
    );
    return {
      answers: record.answers,
      selectedDirection: record.selectedDirection,
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}

export const personalInvestmentStrategyService =
  new PersonalInvestmentStrategyService();
