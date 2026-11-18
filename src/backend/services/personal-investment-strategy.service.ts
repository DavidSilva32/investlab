import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { personalInvestmentStrategyRepository } from "@/backend/repositories/personal-investment-strategy.repository";
import { portfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import { portfolioPositionService } from "@/backend/services/portfolio-position.service";
import { emergencyReserveService } from "@/backend/services/emergency-reserve.service";
import { portfolioObjectivesService } from "@/backend/services/portfolio-objectives.service";
import { todayInSaoPaulo } from "@/lib/valuation-date";
import { calculateReservePriorityAmounts } from "@/lib/contribution-allocation";
import {
  calculateLongTermStrategyWealth,
  summarizeStrategyAllocation,
  simulateStrategyContribution,
  strategyAssetClasses,
  type StrategyAllocationPercentages,
  type StrategyObjectiveBalance,
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
  assetClass: string | null;
  subClass: string | null;
  geography: string | null;
  knownValueCents: string;
  maturityAt: string | null;
  estimatedThrough: string | null;
  referenceDate: string | null;
  unvaluedPositions: number;
};

export class PersonalInvestmentStrategyService {
  constructor(
    private readonly positions = portfolioPositionService,
    private readonly allocation = portfolioAllocationService,
    private readonly repository = personalInvestmentStrategyRepository,
    private readonly reserve = emergencyReserveService,
    private readonly today = todayInSaoPaulo,
    private readonly objectives = portfolioObjectivesService,
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
    const positions = classified.map((position) => ({
      positionCount: 1,
      product: position.product,
      valueCents: position.canonicalValueCents,
      knownValueCents: position.canonicalValueCents ?? "0",
      assetClass: position.classification.assetClass,
      subClass: position.classification.subClass,
      geography: position.classification.geography,
      maturityAt: position.maturityAt ?? null,
      referenceDate: position.referenceDate ?? null,
      unvaluedPositions: position.canonicalValueCents === null ? 1 : 0,
    }));
    const totalCents = positions.reduce(
      (total, position) => total + BigInt(position.knownValueCents),
      0n,
    );
    const allocation = summarizeStrategyAllocation(positions);
    const objectiveOverview = await this.objectives.getOverview(requestId);
    const strategyWealth = calculateLongTermStrategyWealth(
      allocation,
      objectiveOverview.objectives as StrategyObjectiveBalance[],
    );
    const portfolioKnownCents = BigInt(allocation.knownValueCents);
    const effectiveDateGroups = positions.map((position) => ({
      positionCount: position.positionCount,
      date: position.referenceDate,
    }));
    const datedPositionCount = effectiveDateGroups
      .filter((group) => group.date !== null)
      .reduce((sum, group) => sum + group.positionCount, 0);
    const portfolioPositionCount = effectiveDateGroups.reduce(
      (sum, group) => sum + group.positionCount,
      0,
    );
    const dates = [
      ...new Set(
        effectiveDateGroups
          .map((group) => group.date)
          .filter((date): date is string => date !== null),
      ),
    ].sort();
    const saved = await this.repository.get(requestId);
    const maturityCounts = new Map<string, number>();
    for (const position of positions) {
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
      portfolioWealth: {
        knownValueCents: portfolioKnownCents.toString(),
        unvaluedPositionCount: positions
          .filter((position) => position.valueCents === null)
          .reduce((sum, position) => sum + position.unvaluedPositions, 0),
        positionCount: positions.reduce(
          (sum, position) => sum + position.positionCount,
          0,
        ),
        positionsWithoutMaturityDate: positions
          .filter((position) => !position.maturityAt)
          .reduce((sum, position) => sum + position.positionCount, 0),
        unclassifiedKnownValueCents: allocation.unclassifiedKnownValueCents,
        unclassifiedPositionCount: allocation.unclassifiedPositionCount,
        classes: allocation.classes,
      },
      strategyWealth,
      maturityDates: [...maturityCounts]
        .map(([date, count]) => ({ date, count }))
        .sort((left, right) => left.date.localeCompare(right.date)),
      positionsWithoutMaturityDate: positions
        .filter((position) => !position.maturityAt)
        .reduce((sum, position) => sum + position.positionCount, 0),
      valuationDates: dates,
      valuationDatesComplete: datedPositionCount === portfolioPositionCount,
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
    const reserve = await this.reserve.getContributionContext();
    const priority = reserve
      ? calculateReservePriorityAmounts(parsed.contributionAmount, reserve)
      : {
          contributionCents: Math.round(
            (parsed.contributionAmount + Number.EPSILON) * 100,
          ),
          reserveCents: null,
          remainingCents: null,
          reserveStatus: "incomplete" as const,
        };
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
        reserve?.balance ?? null,
        reserve?.balanceCents,
      ),
      reserveTargetValueCents: reserveCents(
        reserve?.targetValue ?? null,
        reserve?.targetValueCents,
      ),
      reserveDifferenceCents: reserveCents(
        reserve?.difference ?? null,
        reserve?.differenceCents,
      ),
    };
    if (priority.remainingCents === null || priority.remainingCents === 0) {
      return {
        ...reservePriority,
        strategyBalanceContext: null,
        simulation: null,
      };
    }
    const positions = classified.map((position) => ({
      positionCount: 1,
      product: position.product,
      valueCents: position.canonicalValueCents,
      knownValueCents: position.canonicalValueCents ?? "0",
      assetClass: position.classification.assetClass,
      subClass: position.classification.subClass,
      geography: position.classification.geography,
      maturityAt: position.maturityAt ?? null,
      referenceDate: position.referenceDate ?? null,
      unvaluedPositions: position.canonicalValueCents === null ? 1 : 0,
    }));
    const allocation = summarizeStrategyAllocation(positions);
    const objectiveOverview = await this.objectives.getOverview(requestId);
    const strategyWealth = calculateLongTermStrategyWealth(
      allocation,
      objectiveOverview.objectives as StrategyObjectiveBalance[],
    );
    const strategyBalanceContext = {
      complete: strategyWealth.complete,
      limitation: strategyWealth.limitation,
      excludedBalanceCents: strategyWealth.excludedBalanceCents,
      excludedObjectives: strategyWealth.excludedObjectives,
      missingObjectiveNames: strategyWealth.missingObjectiveNames,
    };
    if (!strategyWealth.complete) {
      return {
        ...reservePriority,
        strategyBalanceContext,
        simulation: null,
      };
    }
    const currentValuesCents = Object.fromEntries(
      groups.map(({ id }) => [
        id,
        strategyWealth.classes.find((assetClass) => assetClass.id === id)
          ?.knownValueCents ?? "0",
      ]),
    ) as Record<(typeof groups)[number]["id"], string>;
    const unclassifiedKnownValueCents = BigInt(
      allocation.unclassifiedKnownValueCents,
    );
    const result = simulateStrategyContribution({
      currentValuesCents,
      targetPercentages: parsed.allocationPercentages,
      contributionCents: String(priority.remainingCents),
    });
    return {
      ...reservePriority,
      strategyBalanceContext,
      simulation: {
        ...result,
        completeness: {
          complete:
            positions.every((position) => position.valueCents !== null) &&
            unclassifiedKnownValueCents === 0n,
          unvaluedPositionCount: positions
            .filter((position) => position.valueCents === null)
            .reduce((sum, position) => sum + position.unvaluedPositions, 0),
          unclassifiedKnownValueCents: unclassifiedKnownValueCents.toString(),
          valuationDate,
          valuationDates: [
            ...new Set(
              positions
                .map((position) => position.referenceDate)
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
