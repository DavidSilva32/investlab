import { randomUUID } from "node:crypto";
import { manualPortfolioPositionService } from "@/backend/services/manual-portfolio-position.service";
import { portfolioService } from "@/backend/services/portfolio.service";
import { emergencyReserveService } from "@/backend/services/emergency-reserve.service";
import { portfolioObjectivesService } from "@/backend/services/portfolio-objectives.service";
import { personalInvestmentStrategyService } from "@/backend/services/personal-investment-strategy.service";
import { portfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import { portfolioOperationService } from "@/backend/services/portfolio-operation.service";
import { objectiveProjectionService } from "@/backend/services/objective-projection.service";
import { stockAnalysisService } from "@/backend/services/stock-analysis.service";
import type { ObjectiveProjectionInput } from "@/lib/objective-projection";
import { runWithDataOwner } from "@/infrastructure/auth/data-owner-context";

export class McpPortfolioToolsService {
  async getMarketQuotes(tickers: string[], requestId?: string) {
    const uniqueTickers = [
      ...new Set(tickers.map((ticker) => ticker.trim().toUpperCase())),
    ];
    const outcomes = await Promise.all(
      uniqueTickers.map(async (ticker) => {
        try {
          const quote = await stockAnalysisService.getMarketByTicker(
            ticker,
            requestId,
          );
          return {
            ticker,
            quote: {
              companyName: quote.companyName,
              price: quote.price,
              observedAt: quote.priceUpdatedAt,
            },
          };
        } catch {
          return { ticker, unavailable: true as const };
        }
      }),
    );

    return {
      results: outcomes.flatMap((outcome) =>
        "quote" in outcome
          ? [{ ticker: outcome.ticker, ...outcome.quote }]
          : [],
      ),
      unavailableTickers: outcomes.flatMap((outcome) =>
        "unavailable" in outcome ? [outcome.ticker] : [],
      ),
      source:
        "BRAPI via InvestLab; timestamps indicate provider observation time.",
      limitations:
        "Cotação informativa sujeita à disponibilidade e atualização da fonte; sem histórico, fundamentos, recomendação ou validação de preço em tempo real.",
    };
  }

  async getMyOperations(userId: string, requestId?: string) {
    return runWithDataOwner(userId, async () => {
      const data = await portfolioOperationService.listRecentForMcp(
        requestId ?? randomUUID(),
      );
      return {
        returnedCounts: {
          operations: data.operations.length,
          movements: data.movements.length,
          reconciliationEvents: data.reconciliationEvents.length,
        },
        operations: data.operations.map(
          ({
            id,
            side,
            effectiveDate,
            product,
            assetCode,
            quantity,
            unitPrice,
            currency,
            fees,
          }) => ({
            id,
            side,
            effectiveDate,
            product,
            assetCode,
            quantity,
            unitPrice,
            currency,
            fees,
          }),
        ),
        movements: data.movements.map(
          ({
            id,
            occurredAt,
            product,
            assetCode,
            quantity,
            unitPrice,
            operationValue,
            direction,
            movementType,
          }) => ({
            id,
            occurredAt,
            product,
            assetCode,
            quantity,
            unitPrice,
            operationValue,
            direction,
            movementType,
          }),
        ),
        recentReconciliationEvents: data.reconciliationEvents,
        ordering: {
          operations:
            "Até 50 mais recentes por data efetiva decrescente; desempate por criação e identificador decrescentes.",
          movements:
            "Até 50 mais recentes por data da movimentação decrescente; desempate por criação e identificador decrescentes.",
          reconciliationEvents:
            "Até 50 eventos de maior ordem de registro decrescente.",
        },
        hasMore: data.hasMore,
        limitations:
          "Cada consulta busca no máximo 51 linhas por categoria para detectar truncamento. Eventos são apenas a janela recente; não representam o estado atual dos vínculos. Sugestões de conciliação e vínculos ativos não são calculados nesta leitura.",
      };
    });
  }

  async simulateMyObjectiveProjection(
    userId: string,
    input: ObjectiveProjectionInput,
  ) {
    return runWithDataOwner(userId, async () => {
      const { months: _monthlyDetail, ...summary } =
        objectiveProjectionService.simulate(input);
      return {
        ...summary,
        monthlyDetailIncluded: false,
        interpretation:
          "Simulação hipotética baseada exclusivamente nas premissas informadas; não é previsão nem recomendação financeira.",
      };
    });
  }

  async getMyPortfolio(userId: string, requestId?: string) {
    return runWithDataOwner(userId, async () => {
      const overview = await portfolioService.getOverview(
        requestId ?? randomUUID(),
      );
      const positions = overview.positions.filter(
        (position): position is NonNullable<typeof position> =>
          position !== undefined,
      );
      return {
        valuationDate: overview.valuationDate,
        positionCount: positions.length,
        positions: positions.map((position) => ({
          id: position.id,
          product: position.product,
          assetCode: position.assetCode,
          source: position.source,
          quantity: position.quantity,
          value: position.totalValue,
          valueDate: position.referenceDate,
        })),
        knownValueBrl: positions.reduce(
          (total, position) => total + Number(position.totalValue ?? 0),
          0,
        ),
        movements: overview.movements,
      };
    });
  }

  async listMyManualPositions(userId: string, requestId?: string) {
    return runWithDataOwner(userId, () =>
      manualPortfolioPositionService.list(requestId ?? randomUUID()),
    );
  }

  async getMyEmergencyReserve(userId: string, requestId?: string) {
    return runWithDataOwner(userId, async () => {
      const data = await emergencyReserveService.getEditorData(
        requestId ?? randomUUID(),
      );
      return data.calculation;
    });
  }

  async getMyObjectives(userId: string, requestId?: string) {
    return runWithDataOwner(userId, async () => {
      const overview = await portfolioObjectivesService.getOverview(
        requestId ?? randomUUID(),
      );
      return {
        objectives: overview.objectives.map((objective) => ({
          kind: objective.kind,
          purpose: objective.purpose,
          name: objective.name,
          targetAmount: objective.targetAmount,
          monthlyPlannedAmount: objective.monthlyPlannedAmount,
          currentValue: objective.currentValue,
          knownValue: objective.knownValue,
          remainingAmount: objective.remainingAmount,
          progressPercent: objective.progressPercent,
          assignedPositionCount: objective.assignedPositionCount,
          missingPositionCount: objective.missingPositionCount,
          unvaluedPositionCount: objective.unvaluedPositionCount,
          balanceTracking: objective.balanceTracking,
        })),
        destinationSummary: overview.destinationSummary,
        unassignedKnownValue: overview.unassignedKnownValue,
        unassignedPositionCount: overview.unassignedPositionCount,
        unassignedUnvaluedPositionCount:
          overview.unassignedUnvaluedPositionCount,
      };
    });
  }

  async getMyLongTermStrategy(userId: string, requestId?: string) {
    return runWithDataOwner(userId, () =>
      personalInvestmentStrategyService.getOverview(requestId ?? randomUUID()),
    );
  }

  async getMyPortfolioAllocation(userId: string, requestId?: string) {
    return runWithDataOwner(userId, async () => {
      const id = requestId ?? randomUUID();
      const [overview, targetPercentages] = await Promise.all([
        portfolioAllocationService.getAllocationOverview(id),
        portfolioAllocationService.getAllocationTargets(id),
      ]);
      return {
        positionCount: overview.positions.length,
        classDistribution: overview.classDistribution,
        concentrations: overview.concentrations,
        targetPercentages,
      };
    });
  }

  async getMyMonthlyPortfolioReview(
    userId: string,
    period?: string,
    requestId?: string,
  ) {
    return runWithDataOwner(userId, async () => {
      const review = await portfolioService.getMonthlyReview(
        period,
        requestId ?? randomUUID(),
      );
      return {
        selectedPeriod: review.selectedPeriod,
        availablePeriods: review.availablePeriods,
        status: review.status,
        dateAlignment: review.dateAlignment,
        compositionCoverage: review.compositionCoverage,
        valuationMethodCoverage: review.valuationMethodCoverage,
        current: review.current,
        previous: review.previous,
        observedChangeCents: review.observedChangeCents,
        gapMonths: review.gapMonths,
        untrackedManualPositionCount: review.untrackedManualPositionCount,
        flowSeparation: review.flowSeparation,
      };
    });
  }
}

export const mcpPortfolioToolsService = new McpPortfolioToolsService();
