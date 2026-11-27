import { createHash, randomUUID } from "node:crypto";
import { manualPortfolioPositionService } from "@/backend/services/manual-portfolio-position.service";
import { portfolioService } from "@/backend/services/portfolio.service";
import { emergencyReserveService } from "@/backend/services/emergency-reserve.service";
import { portfolioObjectivesService } from "@/backend/services/portfolio-objectives.service";
import { objectiveBalanceService } from "@/backend/services/objective-balance.service";
import { personalInvestmentStrategyService } from "@/backend/services/personal-investment-strategy.service";
import { portfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import { portfolioOperationService } from "@/backend/services/portfolio-operation.service";
import { objectiveProjectionService } from "@/backend/services/objective-projection.service";
import { stockAnalysisService } from "@/backend/services/stock-analysis.service";
import type { ObjectiveProjectionInput } from "@/lib/objective-projection";
import { runWithDataOwner } from "@/infrastructure/auth/data-owner-context";
import { ApplicationError } from "@/backend/errors/application-error";
import { mcpMutationReplaysRepository } from "@/backend/repositories/mcp-mutation-replays.repository";
import { financialService } from "@/backend/services/financial.service";

const maximumFinancialPageSize = 50;

function currentFinancialMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

function compareNullableDate(left: string | null, right: string | null) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right);
}

export class McpPortfolioToolsService {
  async getMyFinancialSummary(userId: string, month?: string) {
    return runWithDataOwner(userId, async () => {
      const overview = await financialService.getMonthlyOverview(
        month ?? currentFinancialMonth(),
      );
      return {
        month: overview.month,
        summary: {
          income: overview.summary.realizedIncome,
          expenses: overview.summary.realizedExpenses,
          periodResult: overview.summary.recordedBalance,
          completeness: overview.summary.completeness,
        },
        categoryBreakdown: overview.categoryBreakdown,
        interpretation:
          "O resultado do período é a diferença entre entradas e saídas registradas. Não representa o saldo bancário. Transferências próprias confirmadas e estornos vinculados são tratados conforme os vínculos existentes no InvestLab.",
        limitations:
          "Inclui apenas movimentos registrados no InvestLab para o mês. Compras de cartão não entram neste resumo. Previsões não fazem parte dos valores realizados; meses sem dados não significam valores zerados nem cobertura completa.",
      };
    });
  }

  async listMyFinancialEntries(
    userId: string,
    input: {
      month?: string;
      page: number;
      pageSize: number;
      kind?: "INCOME" | "EXPENSE";
      category?: string;
    },
  ) {
    if (
      !Number.isInteger(input.page) ||
      input.page < 1 ||
      input.page > 50_000 ||
      !Number.isInteger(input.pageSize) ||
      input.pageSize < 1 ||
      input.pageSize > maximumFinancialPageSize
    ) {
      throw new ApplicationError("Revise a paginação solicitada.", 400);
    }
    const month = input.month ?? currentFinancialMonth();
    const categoryQuery = input.category?.trim().toLocaleLowerCase("pt-BR");
    return runWithDataOwner(userId, async () => {
      const { entries } = await financialService.listEntries(month);
      const filteredEntries = [...entries]
        .sort(
          (left, right) =>
            compareNullableDate(left.expectedDate, right.expectedDate) ||
            compareNullableDate(left.actualDate, right.actualDate) ||
            left.id.localeCompare(right.id),
        )
        .filter(
          (entry) =>
            (!input.kind || entry.kind === input.kind) &&
            (!categoryQuery ||
              entry.categoryName
                .toLocaleLowerCase("pt-BR")
                .includes(categoryQuery)),
        );
      const start = (input.page - 1) * input.pageSize;
      const selectedEntries = filteredEntries.slice(
        start,
        start + input.pageSize,
      );
      return {
        month,
        page: input.page,
        pageSize: input.pageSize,
        totalCount: filteredEntries.length,
        hasMore: start + selectedEntries.length < filteredEntries.length,
        ordering:
          "Data prevista crescente, depois data realizada crescente e identificador crescente; datas ausentes ficam por último.",
        entries: selectedEntries.map((entry) => ({
          id: entry.id,
          description: entry.description,
          kind: entry.kind,
          category: entry.categoryName,
          expectedAmount: entry.expectedAmount,
          expectedDate: entry.expectedDate,
          actualAmount: entry.actualAmount,
          actualDate: entry.actualDate,
        })),
        limitations:
          "A lista contém apenas os lançamentos da conta conectada e do mês selecionado; movimentos do cartão não são incluídos nesta consulta. Valores previstos e realizados são apresentados separadamente.",
      };
    });
  }

  async createMyObjective(
    userId: string,
    input: {
      name: string;
      purpose: "PERSONAL_GOAL" | "LONG_TERM_INVESTMENT";
      targetAmount: number | null;
      monthlyPlannedAmount: number | null;
    },
    idempotencyKey: string,
  ) {
    return runWithDataOwner(userId, () =>
      portfolioObjectivesService.create(input, { idempotencyKey }),
    );
  }

  async saveMyObservedBalance(
    userId: string,
    input: {
      objectiveId: string;
      amount: string;
      observedOn: string;
    },
    idempotencyKey: string,
    requestId: string,
  ) {
    return runWithDataOwner(userId, () =>
      objectiveBalanceService.save(input, requestId, { idempotencyKey }),
    );
  }

  async updateMyObjective(
    userId: string,
    objectiveId: string,
    input: {
      name: string;
      purpose: "PERSONAL_GOAL" | "LONG_TERM_INVESTMENT";
      targetAmount: number | null;
      monthlyPlannedAmount: number | null;
    },
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ) {
    return runWithDataOwner(userId, () =>
      portfolioObjectivesService.update(objectiveId, input, {
        expectedUpdatedAt,
        idempotencyKey,
      }),
    );
  }

  async deleteMyObjective(
    userId: string,
    objectiveId: string,
    expectedUpdatedAt: string,
    objectiveName: string,
    confirmation: string,
    idempotencyKey: string,
    requestId: string,
  ) {
    return runWithDataOwner(userId, async () => {
      const replayKey = {
        operation: "delete_objective" as const,
        key: idempotencyKey,
        payloadHash: createHash("sha256")
          .update(
            JSON.stringify({
              objectiveId,
              expectedUpdatedAt,
              objectiveName,
              confirmation,
            }),
          )
          .digest("hex"),
      };
      const replay = await mcpMutationReplaysRepository.find(replayKey);
      if (replay) return replay;
      const overview = await portfolioObjectivesService.getOverview(requestId);
      const current = overview.objectives.find(
        (objective) => objective.id === objectiveId,
      );
      if (!current) {
        const racedReplay = await mcpMutationReplaysRepository.find(replayKey);
        if (racedReplay) return racedReplay;
        throw new ApplicationError("Objetivo não encontrado.", 404);
      }
      if (
        current.name !== objectiveName ||
        current.updatedAt !== expectedUpdatedAt
      ) {
        throw new ApplicationError(
          "O objetivo mudou desde a última consulta. Atualize a lista antes de excluir.",
          409,
        );
      }
      const requiredConfirmation = `EXCLUIR OBJETIVO "${current.name}" [${current.id}]`;
      if (confirmation !== requiredConfirmation) {
        throw new ApplicationError(
          "A confirmação deve repetir o nome e o identificador do objetivo.",
          400,
        );
      }
      const deletionReceipt = {
        deleted: true,
        objectiveId: current.id,
        objectiveName: current.name,
        positionsRetained: true,
        balanceHistoryDeleted: true,
      };
      const deleted = await portfolioObjectivesService.delete(
        objectiveId,
        { objectiveId },
        {
          expectedUpdatedAt,
          mcpMutation: {
            key: idempotencyKey,
            payloadHash: replayKey.payloadHash,
            replayResult: deletionReceipt,
          },
        },
      );
      return "mcpReplay" in deleted ? deleted.mcpReplay : deletionReceipt;
    });
  }

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

  async createMyManualPosition(
    userId: string,
    input: unknown,
    idempotencyKey: string,
    requestId?: string,
  ) {
    return runWithDataOwner(userId, () =>
      manualPortfolioPositionService.create(input, requestId ?? randomUUID(), {
        idempotencyKey,
      }),
    );
  }

  async updateMyManualPosition(
    userId: string,
    positionId: string,
    input: unknown,
    expectedUpdatedAt: string,
    idempotencyKey: string,
    requestId?: string,
  ) {
    return runWithDataOwner(userId, () =>
      manualPortfolioPositionService.update(
        positionId,
        input,
        requestId ?? randomUUID(),
        { expectedUpdatedAt, idempotencyKey },
      ),
    );
  }

  async deleteMyManualPosition(
    userId: string,
    positionId: string,
    expectedUpdatedAt: string,
    positionIdentity: string,
    confirmation: string,
    idempotencyKey: string,
    requestId?: string,
  ) {
    return runWithDataOwner(userId, async () => {
      const replayKey = {
        operation: "delete_manual_position" as const,
        key: idempotencyKey,
        payloadHash: createHash("sha256")
          .update(
            JSON.stringify({
              positionId,
              expectedUpdatedAt,
              positionIdentity,
              confirmation,
            }),
          )
          .digest("hex"),
      };
      const replay = await mcpMutationReplaysRepository.find(replayKey);
      if (replay) return replay;
      const current = (
        await manualPortfolioPositionService.list(requestId ?? randomUUID())
      ).find((position) => position.id === positionId);
      if (!current) {
        const racedReplay = await mcpMutationReplaysRepository.find(replayKey);
        if (racedReplay) return racedReplay;
        throw new ApplicationError("Posição manual não encontrada.", 404);
      }
      const identity = `${current.product}${current.assetCode ? ` (${current.assetCode})` : ""}`;
      if (
        identity !== positionIdentity ||
        current.lastUpdatedAt !== expectedUpdatedAt
      ) {
        throw new ApplicationError(
          "A posição mudou desde a última consulta. Atualize a lista antes de excluir.",
          409,
        );
      }
      const requiredConfirmation = `EXCLUIR POSIÇÃO "${identity}" [${current.id}]`;
      if (confirmation !== requiredConfirmation) {
        throw new ApplicationError(
          "A confirmação deve repetir a identidade e o identificador da posição.",
          400,
        );
      }
      const deletionReceipt = {
        deleted: true,
        positionId,
        positionIdentity: identity,
        historicalSnapshotsRetained: true,
      };
      const result = await manualPortfolioPositionService.delete(
        positionId,
        requestId,
        {
          expectedUpdatedAt,
          mcpMutation: {
            key: idempotencyKey,
            payloadHash: replayKey.payloadHash,
            replayResult: deletionReceipt,
          },
        },
      );
      return "mcpReplayResult" in Object(result) ? result : deletionReceipt;
    });
  }

  async getMyEmergencyReserve(userId: string, requestId?: string) {
    return runWithDataOwner(userId, async () => {
      const id = requestId ?? randomUUID();
      const calculation = await emergencyReserveService.getSummary(id);
      const hasObservedBalance = calculation.hasObservedBalance;
      return {
        hasObservedBalance,
        balanceCents: hasObservedBalance
          ? (calculation.balanceCents ?? null)
          : null,
        balanceDate: hasObservedBalance ? calculation.referenceDate : null,
        monthlyExpenses: calculation.monthlyExpenses,
        targetMonths: calculation.targetMonths,
        coveredMonths: hasObservedBalance ? calculation.coveredMonths : null,
        progressPercent: hasObservedBalance
          ? calculation.progressPercentage
          : null,
        remainingAmount:
          !hasObservedBalance || calculation.difference === null
            ? null
            : Math.max(calculation.difference, 0),
      };
    });
  }

  async getMyObjectives(userId: string, requestId?: string) {
    return runWithDataOwner(userId, async () => {
      const overview = await portfolioObjectivesService.getOverview(
        requestId ?? randomUUID(),
      );
      return {
        objectives: overview.objectives.map((objective) => ({
          id: objective.id,
          updatedAt: objective.updatedAt,
          kind: objective.kind,
          purpose: objective.purpose,
          name: objective.name,
          targetAmount: objective.targetAmount,
          monthlyPlannedAmount: objective.monthlyPlannedAmount,
          currentValue: objective.currentValue,
          remainingAmount: objective.remainingAmount,
          progressPercent: objective.progressPercent,
          balanceTracking: objective.balanceTracking,
        })),
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
