import { logger } from "@/infrastructure/logging/logger";
import { importRepository } from "@/backend/repositories/import.repository";
import { manualPortfolioPositionRepository } from "@/backend/repositories/manual-portfolio-position.repository";
import { bcbReferenceRatesService } from "@/backend/services/bcb-reference-rates.service";
import { emergencyReserveService } from "@/backend/services/emergency-reserve.service";
import { portfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import { portfolioPositionService } from "@/backend/services/portfolio-position.service";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";
import {
  getNextContributionGuidance,
  getStrategyContributionGuidance,
  type ContributionGuidance,
} from "@/lib/next-contribution-guidance";
import {
  calculateContributionAllocation,
  type ContributionPosition,
} from "@/lib/contribution-allocation";
import { getPortfolioInsights } from "@/lib/portfolio-insights";
import { personalInvestmentStrategyRepository } from "@/backend/repositories/personal-investment-strategy.repository";
import { personalInvestmentStrategyService } from "@/backend/services/personal-investment-strategy.service";
import { calculateMonthlyPortfolioReview } from "@/backend/services/monthly-portfolio-review";

const unavailableGuidance: ContributionGuidance = {
  status: "unavailable",
  title: "Orientação temporariamente indisponível",
  explanation:
    "Não foi possível carregar classificações ou metas agora. Os dados da carteira continuam disponíveis; tente atualizar novamente.",
};

export class PortfolioService {
  async getMonthlyReview(period?: string | null, requestId?: string) {
    const [snapshots, manualObservations, currentManualPositions] =
      await Promise.all([
        importRepository.listPositionSnapshots(requestId),
        manualPortfolioPositionRepository.listSnapshots(requestId),
        manualPortfolioPositionRepository.list(requestId),
      ]);
    return calculateMonthlyPortfolioReview(
      snapshots,
      period,
      manualObservations.map((observation) => ({
        ...observation,
        status:
          observation.status === "DELETED"
            ? ("DELETED" as const)
            : ("ACTIVE" as const),
      })),
      currentManualPositions.map((position) => ({
        assetKey: position.assetKey,
        product: position.product,
        assetCode: position.assetCode,
        currency: position.currency,
        totalValue: position.totalValue,
        convertedValueBrl: position.convertedValueBrl,
        positionDate: position.positionDate,
        conversionDate: position.conversionDate,
        updatedAt: position.updatedAt,
      })),
    );
  }

  async calculateContribution(contributionAmount: number, requestId?: string) {
    const strategySettings =
      await personalInvestmentStrategyRepository.get(requestId);
    if (strategySettings?.allocationActive) {
      if (!strategySettings.allocationPercentages) {
        return {
          allocationMode: "strategy" as const,
          status: "needs_targets" as const,
          strategySource: "user_defined" as const,
          contributionAmount,
          reserveAmount: null,
          remainingAmount: null,
          unallocatedAmount: null,
          reserveStatus: "not_configured" as const,
          reserveDifference: null,
          longTermPortfolioValue: null,
          unknownPositionCount: 0,
          allocations: [],
        };
      }
      const plan = await personalInvestmentStrategyService.simulateContribution(
        {
          contributionAmount,
          allocationPercentages: strategySettings.allocationPercentages,
        },
        requestId,
      );
      const simulation = plan.simulation;
      const reserveIncomplete = plan.reserveStatus === "incomplete";
      const remainingCents = plan.strategyContributionCents;
      const remainingAmount =
        remainingCents === null ? null : Number(BigInt(remainingCents)) / 100;
      const unallocated = simulation
        ? Number(BigInt(simulation.unallocatedContributionCents)) / 100
        : remainingAmount;
      const projectedTotalCents =
        simulation === null
          ? 0n
          : BigInt(simulation.totalCents) +
            BigInt(simulation.contributionCents);
      return {
        status: reserveIncomplete
          ? ("reserve_incomplete" as const)
          : remainingAmount === 0
            ? ("no_gap" as const)
            : simulation && !simulation.completeness.complete
              ? ("incomplete_data" as const)
              : simulation?.totalCents === "0"
                ? ("no_positions" as const)
                : simulation && unallocated === remainingAmount
                  ? ("no_gap" as const)
                  : ("ready" as const),
        allocationMode: "strategy" as const,
        strategySource: "user_defined" as const,
        contributionAmount: Number(BigInt(plan.enteredContributionCents)) / 100,
        reserveAmount:
          plan.reserveContributionCents === null
            ? null
            : Number(BigInt(plan.reserveContributionCents)) / 100,
        remainingAmount,
        unallocatedAmount: reserveIncomplete ? null : unallocated,
        reserveStatus: reserveIncomplete
          ? ("incomplete" as const)
          : plan.reserveStatus,
        reserveDifference:
          plan.reserveDifferenceCents === null
            ? null
            : Number(BigInt(plan.reserveDifferenceCents)) / 100,
        longTermPortfolioValue: simulation
          ? Number(BigInt(simulation.totalCents)) / 100
          : null,
        unknownPositionCount:
          simulation?.completeness.unvaluedPositionCount ?? 0,
        allocations: (simulation?.allocations ?? []).map((item) => {
          const currentCents = BigInt(item.currentValueCents);
          const targetCents =
            (projectedTotalCents *
              BigInt(Math.round(item.targetPercentage * 100)) +
              5000n) /
            10000n;
          return {
            assetClass: item.label,
            assetClassId: item.id,
            currentValue: Number(currentCents) / 100,
            currentPercentage: item.currentPercentage,
            targetPercentage: item.targetPercentage,
            targetGapValue:
              Number(
                targetCents > currentCents ? targetCents - currentCents : 0n,
              ) / 100,
            contributionAmount:
              Number(BigInt(item.contributionValueCents)) / 100,
          };
        }),
      };
    }
    const current = await portfolioPositionService.listCurrent(requestId);
    const estimated =
      await portfolioPositionService.enrichImportedPositions(current);
    const positions = await portfolioAllocationService.classifyPositions(
      estimated,
      requestId,
    );
    const [targets, reserve] = await Promise.all([
      portfolioAllocationService.getAllocationTargets(requestId),
      emergencyReserveService.getContributionContext(positions),
    ]);
    const legacyResult = calculateContributionAllocation({
      contributionAmount,
      positions: positions as ContributionPosition[],
      targets,
      reserve: reserve.calculation,
      selectedReserveAssetKeys: reserve.selectedAssetKeys,
      strategySource: "user_defined",
    });
    return { ...legacyResult, allocationMode: "legacy" as const };
  }

  async getOverview(requestId?: string) {
    logger.info("portfolio_overview_loading", { requestId });
    const valuationDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    const [positions, movements] = await Promise.all([
      portfolioPositionService.listCurrent(requestId),
      importRepository.listMovements(requestId),
    ]);
    const [estimatedPositions, referenceRates] = await Promise.all([
      portfolioPositionService.enrichImportedPositions(
        positions,
        valuationDate,
      ),
      bcbReferenceRatesService.getReferenceRates(),
    ]);
    const [classificationResult, targetsResult, strategySettingsResult] =
      await Promise.all([
        portfolioAllocationService
          .classifyPositions(estimatedPositions, requestId)
          .then((value) => ({ value }))
          .catch(() => {
            logger.warn("portfolio_contribution_guidance_unavailable", {
              requestId,
              phase: "classification",
            });
            return { value: null };
          }),
        portfolioAllocationService
          .getAllocationTargets(requestId)
          .then((value) => ({ value }))
          .catch(() => {
            logger.warn("portfolio_contribution_guidance_unavailable", {
              requestId,
              phase: "targets",
            });
            return { value: null };
          }),
        personalInvestmentStrategyRepository
          .get(requestId)
          .then((value) => ({ value, failed: false }))
          .catch(() => {
            logger.warn("portfolio_contribution_guidance_unavailable", {
              requestId,
              phase: "strategy_settings",
            });
            return { value: null, failed: true };
          }),
      ]);
    const strategyModeActive =
      strategySettingsResult.value?.allocationActive === true;
    const strategyOverviewResult = strategyModeActive
      ? await personalInvestmentStrategyService
          .getOverview(requestId)
          .then((value) => ({ value }))
          .catch(() => {
            logger.warn("portfolio_contribution_guidance_unavailable", {
              requestId,
              phase: "active_strategy",
            });
            return { value: null };
          })
      : { value: null };
    let emergencyReserve: EmergencyReserveCalculation | undefined;
    if (classificationResult.value !== null) {
      try {
        emergencyReserve = await emergencyReserveService.getSummary(
          classificationResult.value,
          requestId,
        );
      } catch {
        logger.warn("portfolio_contribution_guidance_unavailable", {
          requestId,
          phase: "emergency_reserve",
        });
      }
    }
    const positionsWithClassification =
      classificationResult.value ?? estimatedPositions;
    const insights = getPortfolioInsights(
      positionsWithClassification,
      new Date(`${valuationDate}T12:00:00-03:00`),
    );
    const nextContributionGuidance =
      classificationResult.value === null ||
      emergencyReserve === undefined ||
      strategySettingsResult.failed ||
      (strategyModeActive
        ? strategyOverviewResult.value === null
        : targetsResult.value === null)
        ? unavailableGuidance
        : strategyModeActive
          ? getStrategyContributionGuidance({
              classes: strategyOverviewResult.value!.longTermWealth.classes.map(
                (item) => ({
                  id: item.id,
                  label: item.label,
                  currentPercentage: item.currentPercentage,
                }),
              ),
              allocationPercentages:
                strategyOverviewResult.value!.savedAllocationPercentages,
              positionCount:
                strategyOverviewResult.value!.longTermWealth.positionCount,
              unvaluedPositionCount:
                strategyOverviewResult.value!.longTermWealth
                  .unvaluedPositionCount,
              unclassifiedKnownValueCents:
                strategyOverviewResult.value!.longTermWealth
                  .unclassifiedKnownValueCents,
              emergencyReserve,
            })
          : {
              ...getNextContributionGuidance({
                positions: classificationResult.value,
                targets: targetsResult.value,
                emergencyReserve,
              }),
              allocationMode: "legacy" as const,
            };
    logger.info("portfolio_overview_loaded", {
      requestId,
      positions: estimatedPositions.length,
      movements: movements.length,
    });
    return {
      positions: positionsWithClassification,
      insights,
      valuationDate,
      movements,
      referenceRates,
      emergencyReserve,
      nextContributionGuidance,
      contributionAllocationMode: strategySettingsResult.failed
        ? "unavailable"
        : strategyModeActive
          ? "strategy"
          : "legacy",
    };
  }
}

export const portfolioService = new PortfolioService();
