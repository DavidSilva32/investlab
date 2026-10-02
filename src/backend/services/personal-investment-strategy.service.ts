import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { personalInvestmentStrategyRepository } from "@/backend/repositories/personal-investment-strategy.repository";
import { portfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import { portfolioObjectivesService } from "@/backend/services/portfolio-objectives.service";
import { portfolioPositionService } from "@/backend/services/portfolio-position.service";
import { todayInSaoPaulo } from "@/lib/valuation-date";

const answerSchema = z.object({
  horizonYears: z.number().int().min(1).max(100),
  internationalInterest: z.enum(["interested", "not_interested", "unsure"]),
});
const saveSchema = z.object({
  answers: answerSchema,
  selectedDirection: z.enum(["review_horizon", "consider_international"]),
});

const groups = [
  { id: "fixed_income", label: "Renda fixa" },
  { id: "brazilian_equities", label: "Ações brasileiras" },
  { id: "international_etfs", label: "ETFs internacionais" },
  { id: "fiis", label: "FIIs" },
] as const;

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

const normalize = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

function groupFor(position: Position) {
  const product = normalize(position.product);
  const assetClass = normalize(position.assetClass);
  const geography = normalize(position.geography);
  if (/\b(fii|fiis|fundo imobiliario)\b/.test(product)) return "fiis";
  if (/\betf\b/.test(product) && ["exterior", "global"].includes(geography))
    return "international_etfs";
  if (assetClass === "renda fixa") return "fixed_income";
  if (assetClass === "renda variavel" && geography === "brasil")
    return "brazilian_equities";
  return null;
}

export class PersonalInvestmentStrategyService {
  constructor(
    private readonly positions = portfolioPositionService,
    private readonly allocation = portfolioAllocationService,
    private readonly objectives = portfolioObjectivesService,
    private readonly repository = personalInvestmentStrategyRepository,
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
        positions
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
      const group = groupFor(position);
      if (group) {
        classValues.set(
          group,
          classValues.get(group)! + BigInt(position.valueCents!),
        );
      } else {
        unclassifiedKnownCents += BigInt(position.valueCents!);
      }
    }
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
        classes: groups.map(({ id, label }) => ({
          id,
          label,
          knownValueCents: classValues.get(id)!.toString(),
        })),
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
      savedStrategy: saved
        ? {
            answers: saved.answers,
            selectedDirection: saved.selectedDirection,
            updatedAt: saved.updatedAt.toISOString(),
          }
        : null,
    };
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
