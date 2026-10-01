import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { emergencyReserveRepository } from "@/backend/repositories/emergency-reserve.repository";
import { portfolioObjectivesRepository } from "@/backend/repositories/portfolio-objectives.repository";
import { portfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import { portfolioPositionService } from "@/backend/services/portfolio-position.service";
import { suggestEmergencyReservePositions } from "@/backend/services/emergency-reserve-position-suggestions";
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
});
const updateSchema = createSchema.extend({ objectiveId: z.string().uuid() });
const deleteSchema = z.object({ objectiveId: z.string().uuid() });
const suggestionsSchema = z.object({
  targetAmount: z.number().finite().positive().max(maximumAmount),
  instrumentType: z.enum(["ALL", "CDB"]).default("ALL"),
});

type RawPosition = {
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
  async getOverview(requestId?: string) {
    const [rawPositions, stored, reserveSettings] = await Promise.all([
      portfolioPositionService.listCurrentEnriched(requestId),
      portfolioObjectivesRepository.list(),
      emergencyReserveRepository.getSettings(),
    ]);
    const classified = await portfolioAllocationService.classifyPositions(
      rawPositions,
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
      };
    });
    const unassignedPositions = positions.filter(
      (position) => !objectiveByAssetKey.has(position.assetKey),
    );
    const unassignedKnownValueCents = sumMoneyCents(
      unassignedPositions.map((position) =>
        BigInt(position.knownValueCents ?? "0"),
      ),
    );
    const unassignedKnownValue = centsToNumber(unassignedKnownValueCents) ?? 0;
    const reserveKnownValueCents = BigInt(
      objectives.find((objective) => objective.kind === "RESERVE")
        ?.knownValueCents ?? "0",
    );
    const personalKnownValueCents = sumMoneyCents(
      objectives
        .filter((objective) => objective.kind !== "RESERVE")
        .map((objective) => BigInt(objective.knownValueCents ?? "0")),
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
    return {
      objectives,
      destinationSummary: {
        categories: destinationValues.map(({ key, valueCents }) => ({
          key,
          value: centsToNumber(valueCents) ?? 0,
          valueCents: valueCents.toString(),
          percentage:
            destinationsKnownTotalCents > 0n
              ? (Number(valueCents) / Number(destinationsKnownTotalCents)) * 100
              : 0,
        })),
        knownTotal: centsToNumber(destinationsKnownTotalCents) ?? 0,
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
        position.objectiveId !== objectiveId,
    );
    if (conflicts.length) {
      throw new ApplicationError(
        `Esta seleção inclui posição(ões) já vinculada(s) a ${conflicts[0].objectiveName}. Remova-as do outro objetivo antes de continuar.`,
        409,
      );
    }
    await portfolioObjectivesRepository.replaceAssignments(
      objectiveId,
      assetKeys,
    );
  }

  async findPositionCombinations(body: unknown, requestId?: string) {
    const parsed = suggestionsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError("Informe um valor válido para comparar.", 400);
    }
    const { targetAmount, instrumentType } = parsed.data;
    const available = (await this.getOverview(requestId)).positions.filter(
      (position) => position.objectiveId === null,
    );
    const candidates =
      instrumentType === "CDB"
        ? available.filter(
            (position) =>
              position.assetClass === "Renda fixa" &&
              /^CDB(?:\b|\s|-)/i.test(position.product.trim()),
          )
        : available;
    return suggestEmergencyReservePositions(
      targetAmount,
      candidates.map(({ assetKey, product, institution, value }) => ({
        assetKey,
        product,
        institution,
        value,
      })),
    );
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
        institution: string | null;
        assetClass: string | null;
        positionCount: number;
        valueCents: bigint | null;
        knownValueCents: bigint;
        unvaluedPositions: number;
        referenceDate: string | null;
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
        institution: position.institution,
        assetClass: position.classification?.assetClass ?? null,
        positionCount: 1,
        valueCents: cents,
        knownValueCents: cents ?? 0n,
        unvaluedPositions: cents === null ? 1 : 0,
        referenceDate: position.referenceDate ?? null,
        source: position.source ?? null,
        canonicalValueSource: source,
        allValuesKnown: cents !== null,
      });
    }
    return [...grouped.values()].map(
      ({ allValuesKnown, valueCents, knownValueCents, ...position }) => ({
        ...position,
        valueCents: allValuesKnown ? (valueCents?.toString() ?? null) : null,
        value: allValuesKnown ? centsToNumber(valueCents) : null,
        knownValueCents: knownValueCents.toString(),
        knownValue: centsToNumber(knownValueCents) ?? 0,
      }),
    );
  }
}

export const portfolioObjectivesService = new PortfolioObjectivesService();
