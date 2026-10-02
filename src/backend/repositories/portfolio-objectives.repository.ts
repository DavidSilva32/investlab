import { createHash } from "node:crypto";
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  lte,
  lt,
  notInArray,
  sql,
} from "drizzle-orm";
import { ApplicationError } from "@/backend/errors/application-error";
import { getDatabaseClient } from "@/infrastructure/database/client";
import {
  portfolioObjectivePositions,
  portfolioObjectiveBalanceReferences,
  portfolioObjectiveReferenceBatches,
  portfolioObjectives,
  positionSnapshots,
  positionItems,
  manualPortfolioPositions,
  cdbRateConfigurations,
  cdiDailyRates,
} from "@/infrastructure/database/schema";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabaseClient>["transaction"]>[0]
>[0];

export type ObjectiveAssignmentTransfer = {
  assetKey: string;
  fromObjectiveId: string;
  toObjectiveId: string;
};

export type AllocationReference = { objectiveId: string; amountCents: string };

type AllocationValuationPosition = Record<string, unknown> & {
  source?: string | null;
  id?: string;
  assetKey?: string;
  product?: string;
  assetCode?: string | null;
  indexer?: string | null;
  estimationBaseDate?: string | null;
  valuationSource?: string | null;
};
const allocationCdiInputsKey = Symbol.for("investlab.allocationCdiInputs");
const sourceSnapshotIdKey = Symbol.for("investlab.positionSnapshotId");
type AllocationCdiInputs = {
  assetCode: string | null;
  cdiPercentage: string | null;
  rates: Array<{ rateDate: string; annualRate: string; fetchedAt?: Date }>;
};

const snapshotFields = [
  "id",
  "product",
  "institution",
  "issuer",
  "assetCode",
  "indexer",
  "regimeType",
  "issuedAt",
  "maturityAt",
  "quantity",
  "availableQuantity",
  "unavailableQuantity",
  "unitPrice",
  "totalValue",
  "valuationSource",
  "mtmUnitPrice",
  "mtmTotalValue",
  "curveUnitPrice",
  "curveTotalValue",
  "closingUnitPrice",
  "closingTotalValue",
  "source",
  "referenceDate",
  "estimationBaseDate",
] as const;
const manualFields = [
  "id",
  "assetKey",
  "product",
  "assetCode",
  "institution",
  "quantity",
  "currency",
  "unitPrice",
  "totalValue",
  "reportedTotalValue",
  "valueBasis",
  "positionDate",
  "convertedValueBrl",
  "conversionDate",
] as const;

const selectFields = (
  row: Record<string, unknown>,
  fields: readonly string[],
) => Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));

const hashAllocationInputs = (input: {
  valuationDate: string;
  imported: AllocationValuationPosition[];
  manual: AllocationValuationPosition[];
  assignments: Array<{
    assetKey: string;
    objectiveId: string;
    id?: string;
    assignedAt?: Date;
  }>;
  objectives: Array<{ id: string; name: string; kind: string }>;
}) => {
  const cdiInputs = input.imported
    .flatMap((position) => {
      const allocationCdiInputs = Reflect.get(
        position,
        allocationCdiInputsKey,
      ) as AllocationCdiInputs | undefined;
      return allocationCdiInputs
        ? [{ positionId: position.id ?? null, ...allocationCdiInputs }]
        : [];
    })
    .sort((left, right) =>
      `${left.positionId}:${left.assetCode}`.localeCompare(
        `${right.positionId}:${right.assetCode}`,
      ),
    );
  const normalized = {
    valuationDate: input.valuationDate,
    imported: input.imported
      .map((position): Record<string, unknown> => ({
        ...selectFields(position, snapshotFields),
        sourceSnapshotId: Reflect.get(position, sourceSnapshotIdKey) ?? null,
      }))
      .sort((left, right) =>
        String(left["id"]).localeCompare(String(right["id"])),
      ),
    manual: input.manual
      .map((position) => selectFields(position, manualFields))
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
    assignments: input.assignments
      .map(({ assetKey, objectiveId }) => ({ assetKey, objectiveId }))
      .sort((left, right) => left.assetKey.localeCompare(right.assetKey)),
    objectives: [...input.objectives].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    cdiInputs,
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
};

export function createAllocationSourceFingerprint(input: {
  valuationDate: string;
  positions: AllocationValuationPosition[];
  assignments: Array<{
    assetKey: string;
    objectiveId: string;
    id?: string;
    assignedAt?: Date;
  }>;
  objectives: Array<{ id: string; name: string; kind: string }>;
}) {
  return hashAllocationInputs({
    valuationDate: input.valuationDate,
    imported: input.positions.filter(
      (position) => position.source !== "MANUAL",
    ),
    manual: input.positions.filter((position) => position.source === "MANUAL"),
    assignments: input.assignments,
    objectives: input.objectives,
  });
}

export class PortfolioObjectivesRepository {
  private async lockAllocationSources(transaction: DatabaseTransaction) {
    // Minimal unit-test transaction doubles omit execute; PostgreSQL clients always provide it.
    if (typeof transaction.execute !== "function") return false;
    await transaction.execute(sql`
      LOCK TABLE "position_snapshots", "position_items",
        "manual_portfolio_positions", "cdb_rate_configurations",
        "cdi_daily_rates", "portfolio_objectives",
        "portfolio_objective_positions" IN SHARE ROW EXCLUSIVE MODE
    `);
    return true;
  }

  private async currentAllocationSourceFingerprint(
    transaction: DatabaseTransaction,
    valuationDate: string,
  ) {
    const locked = await this.lockAllocationSources(transaction);
    if (!locked) return null;
    const [snapshot] = await transaction
      .select()
      .from(positionSnapshots)
      .orderBy(desc(positionSnapshots.createdAt), desc(positionSnapshots.id))
      .limit(1);
    const importedRows = snapshot
      ? await transaction
          .select()
          .from(positionItems)
          .where(eq(positionItems.snapshotId, snapshot.id))
          .orderBy(positionItems.id)
      : [];
    const imported = importedRows.map((position) => ({
      ...position,
      [sourceSnapshotIdKey]: snapshot!.id,
      referenceDate: snapshot!.referenceDate,
      estimationBaseDate: snapshot!.estimationBaseDate,
    })) as AllocationValuationPosition[];
    const manualRows = await transaction
      .select()
      .from(manualPortfolioPositions)
      .orderBy(manualPortfolioPositions.id);
    const manual = manualRows.map((position) => ({
      ...position,
      source: "MANUAL",
      reportedTotalValue: position.totalValue,
      totalValue:
        position.currency === "BRL"
          ? position.totalValue
          : position.convertedValueBrl,
      referenceDate: position.positionDate,
    })) as AllocationValuationPosition[];
    const cdbs = imported.filter(
      (position) =>
        Boolean(position.assetCode) &&
        /^CDB\b/i.test(String(position.product ?? "")) &&
        /^(DI|CDI)$/i.test(String(position.indexer ?? "")),
    );
    const codes = [...new Set(cdbs.map((position) => position.assetCode!))];
    const configurations = codes.length
      ? await transaction
          .select()
          .from(cdbRateConfigurations)
          .where(inArray(cdbRateConfigurations.assetCode, codes))
      : [];
    const percentageByCode = new Map(
      configurations.map((configuration) => [
        configuration.assetCode,
        configuration.cdiPercentage,
      ]),
    );
    const eligibleBaseDates = [
      ...new Set(
        cdbs
          .filter(
            (position) =>
              Boolean(percentageByCode.get(position.assetCode!)) &&
              position.valuationSource === "CURVA" &&
              Boolean(position.totalValue) &&
              Boolean(position.estimationBaseDate) &&
              position.estimationBaseDate! < valuationDate,
          )
          .map((position) => position.estimationBaseDate!),
      ),
    ];
    const ratesByBaseDate = new Map<
      string,
      Array<{ rateDate: string; annualRate: string; fetchedAt: Date }>
    >();
    for (const baseDate of eligibleBaseDates) {
      const rates = await transaction
        .select()
        .from(cdiDailyRates)
        .where(
          and(
            gt(cdiDailyRates.rateDate, baseDate),
            lte(cdiDailyRates.rateDate, valuationDate),
          ),
        )
        .orderBy(cdiDailyRates.rateDate);
      ratesByBaseDate.set(baseDate, rates);
    }
    const importedWithCdiInputs = imported.map((position) => {
      if (!cdbs.some((cdb) => cdb.id === position.id)) return position;
      const baseDate = String(position.estimationBaseDate ?? "");
      return {
        ...position,
        [allocationCdiInputsKey]: {
          assetCode: position.assetCode!,
          cdiPercentage: percentageByCode.get(position.assetCode!) ?? null,
          rates: ratesByBaseDate.get(baseDate) ?? [],
        },
      };
    });
    const [assignments, objectives] = await Promise.all([
      transaction.select().from(portfolioObjectivePositions),
      transaction
        .select({
          id: portfolioObjectives.id,
          name: portfolioObjectives.name,
          kind: portfolioObjectives.kind,
          purpose: portfolioObjectives.purpose,
        })
        .from(portfolioObjectives),
    ]);
    return hashAllocationInputs({
      valuationDate,
      imported: importedWithCdiInputs,
      manual,
      assignments,
      objectives,
    });
  }

  async list() {
    const [objectives, assignments] = await Promise.all([
      getDatabaseClient()
        .select()
        .from(portfolioObjectives)
        .orderBy(portfolioObjectives.createdAt),
      this.listAssignments(),
    ]);
    return { objectives, assignments };
  }

  async listAssignments() {
    return getDatabaseClient().select().from(portfolioObjectivePositions);
  }

  async create(input: {
    name: string;
    purpose: "PERSONAL_GOAL" | "LONG_TERM_INVESTMENT";
    targetAmount: string | null;
    monthlyPlannedAmount: string | null;
  }) {
    const [objective] = await getDatabaseClient()
      .insert(portfolioObjectives)
      .values({ ...input, kind: "CUSTOM" })
      .returning();
    return objective;
  }

  async update(
    objectiveId: string,
    input: {
      name: string;
      purpose: "PERSONAL_GOAL" | "LONG_TERM_INVESTMENT" | null;
      targetAmount: string | null;
      monthlyPlannedAmount: string | null;
    },
  ) {
    const [objective] = await getDatabaseClient()
      .update(portfolioObjectives)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(portfolioObjectives.id, objectiveId))
      .returning();
    return objective ?? null;
  }

  async delete(objectiveId: string) {
    const [objective] = await getDatabaseClient()
      .delete(portfolioObjectives)
      .where(eq(portfolioObjectives.id, objectiveId))
      .returning();
    return objective ?? null;
  }

  async replaceAssignments(objectiveId: string, assetKeys: string[]) {
    return getDatabaseClient().transaction(async (transaction) => {
      await transaction
        .delete(portfolioObjectivePositions)
        .where(eq(portfolioObjectivePositions.objectiveId, objectiveId));
      if (assetKeys.length) {
        await transaction
          .insert(portfolioObjectivePositions)
          .values(assetKeys.map((assetKey) => ({ objectiveId, assetKey })));
      }
    });
  }

  async replaceAssignmentsWithTransfers(
    objectiveId: string,
    assetKeys: string[],
    transfers: ObjectiveAssignmentTransfer[],
  ) {
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        if (assetKeys.length) {
          await transaction
            .delete(portfolioObjectivePositions)
            .where(
              and(
                eq(portfolioObjectivePositions.objectiveId, objectiveId),
                notInArray(portfolioObjectivePositions.assetKey, assetKeys),
              ),
            );
        } else {
          await transaction
            .delete(portfolioObjectivePositions)
            .where(eq(portfolioObjectivePositions.objectiveId, objectiveId));
        }
        await this.transferAssignments(transaction, transfers);
        if (!assetKeys.length) return;
        const assignments = await transaction
          .select()
          .from(portfolioObjectivePositions)
          .where(inArray(portfolioObjectivePositions.assetKey, assetKeys))
          .for("update");
        const assignedByKey = new Map(
          assignments.map((assignment) => [
            assignment.assetKey,
            assignment.objectiveId,
          ]),
        );
        const conflict = assignments.find(
          (assignment) => assignment.objectiveId !== objectiveId,
        );
        if (conflict) {
          const [currentObjective] = await transaction
            .select({ name: portfolioObjectives.name })
            .from(portfolioObjectives)
            .where(eq(portfolioObjectives.id, conflict.objectiveId))
            .limit(1);
          throw new ApplicationError(
            currentObjective?.name
              ? `A posição já está vinculada a ${currentObjective.name}. Atualize os objetivos e tente novamente.`
              : "A posição já está vinculada a outro objetivo. Atualize os objetivos e tente novamente.",
            409,
          );
        }
        const unassigned = assetKeys.filter(
          (assetKey) => !assignedByKey.has(assetKey),
        );
        if (unassigned.length) {
          await transaction
            .insert(portfolioObjectivePositions)
            .values(unassigned.map((assetKey) => ({ objectiveId, assetKey })));
        }
      });
    } catch (error) {
      const postgresError = error as { code?: string; constraint?: string };
      if (
        postgresError.code === "23505" &&
        postgresError.constraint ===
          "portfolio_objective_positions_assetKey_unique"
      ) {
        const assignments = await Promise.all(
          assetKeys.map((assetKey) => this.findAssignment(assetKey)),
        );
        const conflict = assignments.find(
          (assignment) => assignment && assignment.objectiveId !== objectiveId,
        );
        throw new ApplicationError(
          conflict?.objectiveName
            ? `A posição já está vinculada a ${conflict.objectiveName}. Atualize os objetivos e tente novamente.`
            : "Uma posição mudou de destino durante esta atualização. Atualize os objetivos e tente novamente.",
          409,
        );
      }
      throw error;
    }
  }

  async transferAssignments(
    transaction: DatabaseTransaction,
    transfers: ObjectiveAssignmentTransfer[],
  ) {
    if (transfers.length === 0) return;
    const assetKeys = transfers.map((transfer) => transfer.assetKey);
    if (
      new Set(assetKeys).size !== assetKeys.length ||
      transfers.some(
        (transfer) => transfer.fromObjectiveId === transfer.toObjectiveId,
      )
    ) {
      throw new ApplicationError("Revise as transferências de posições.", 400);
    }
    const assignments = await transaction
      .select()
      .from(portfolioObjectivePositions)
      .where(inArray(portfolioObjectivePositions.assetKey, assetKeys))
      .for("update");
    const assignmentByKey = new Map(
      assignments.map((assignment) => [assignment.assetKey, assignment]),
    );
    for (const transfer of transfers) {
      const assignment =
        assignmentByKey.get(transfer.assetKey) ??
        (
          await transaction
            .select()
            .from(portfolioObjectivePositions)
            .where(eq(portfolioObjectivePositions.assetKey, transfer.assetKey))
            .for("update")
        )[0];
      if (assignment?.objectiveId !== transfer.fromObjectiveId) {
        const [currentObjective] = assignment
          ? await transaction
              .select({ name: portfolioObjectives.name })
              .from(portfolioObjectives)
              .where(eq(portfolioObjectives.id, assignment.objectiveId))
              .limit(1)
          : [];
        throw new ApplicationError(
          currentObjective
            ? `A posição mudou desde a busca e agora está vinculada a ${currentObjective.name}. Atualize os objetivos e tente novamente.`
            : "A posição mudou desde a busca e está sem destino. Atualize os objetivos e tente novamente.",
          409,
        );
      }
      await transaction
        .update(portfolioObjectivePositions)
        .set({ objectiveId: transfer.toObjectiveId, assignedAt: new Date() })
        .where(
          and(
            eq(portfolioObjectivePositions.assetKey, transfer.assetKey),
            eq(
              portfolioObjectivePositions.objectiveId,
              transfer.fromObjectiveId,
            ),
          ),
        );
    }
  }

  async findAssignment(assetKey: string) {
    const [assignment] = await getDatabaseClient()
      .select()
      .from(portfolioObjectivePositions)
      .where(eq(portfolioObjectivePositions.assetKey, assetKey))
      .limit(1);
    if (!assignment) return null;
    const objective = await this.getObjective(assignment.objectiveId);
    return { ...assignment, objectiveName: objective?.name ?? null };
  }

  async getObjective(objectiveId: string) {
    const [objective] = await getDatabaseClient()
      .select()
      .from(portfolioObjectives)
      .where(eq(portfolioObjectives.id, objectiveId))
      .limit(1);
    return objective ?? null;
  }

  async listLatestBalanceReferences() {
    const rows = await getDatabaseClient()
      .select({
        objectiveId: portfolioObjectiveBalanceReferences.objectiveId,
        amountCents: portfolioObjectiveBalanceReferences.amountCents,
        cdiPercentage: portfolioObjectiveBalanceReferences.cdiPercentage,
        observedDate: portfolioObjectiveReferenceBatches.observedOn,
        createdAt: portfolioObjectiveBalanceReferences.createdAt,
      })
      .from(portfolioObjectiveBalanceReferences)
      .innerJoin(
        portfolioObjectiveReferenceBatches,
        eq(
          portfolioObjectiveBalanceReferences.batchId,
          portfolioObjectiveReferenceBatches.id,
        ),
      )
      .orderBy(
        desc(portfolioObjectiveReferenceBatches.observedOn),
        desc(portfolioObjectiveBalanceReferences.createdAt),
        desc(portfolioObjectiveBalanceReferences.id),
      );
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows)
      if (!latest.has(row.objectiveId)) latest.set(row.objectiveId, row);
    return [...latest.values()].map(
      ({ objectiveId, amountCents, observedDate, cdiPercentage }) => ({
        objectiveId,
        amountCents,
        observedDate,
        cdiPercentage,
      }),
    );
  }

  async saveObservedBalance(input: {
    objectiveId: string;
    amountCents: string;
    observedOn: string;
    cdiPercentage: string | null;
  }) {
    return getDatabaseClient().transaction(async (transaction) => {
      const [objective] = await transaction
        .select({ id: portfolioObjectives.id })
        .from(portfolioObjectives)
        .where(eq(portfolioObjectives.id, input.objectiveId))
        .for("update");
      if (!objective) return null;
      const [batch] = await transaction
        .insert(portfolioObjectiveReferenceBatches)
        .values({ observedOn: input.observedOn })
        .returning({ id: portfolioObjectiveReferenceBatches.id });
      const [reference] = await transaction
        .insert(portfolioObjectiveBalanceReferences)
        .values({
          batchId: batch.id,
          objectiveId: input.objectiveId,
          amountCents: input.amountCents,
          cdiPercentage: input.cdiPercentage,
        })
        .returning();
      return { ...reference, observedDate: input.observedOn };
    });
  }

  async saveGlobalAllocation(input: {
    observedOn: string;
    expectedSourceFingerprint: string;
    expectedOwners: Record<string, string | null>;
    allocation: Record<string, string | null>;
    references: AllocationReference[];
  }) {
    const db = getDatabaseClient();
    try {
      return await db.transaction(
        async (transaction) => {
          const currentFingerprint =
            await this.currentAllocationSourceFingerprint(
              transaction,
              input.observedOn,
            );
          if (
            currentFingerprint !== null &&
            currentFingerprint !== input.expectedSourceFingerprint
          ) {
            throw new ApplicationError(
              "Os valores, datas ou posições mudaram desde a busca. Atualize a distribuição e tente novamente.",
              409,
            );
          }
          const assetKeys = Object.keys(input.expectedOwners).sort();
          if (
            assetKeys.length !== Object.keys(input.allocation).length ||
            assetKeys.some((assetKey) => !(assetKey in input.allocation))
          ) {
            throw new ApplicationError(
              "A distribuição mudou desde a busca. Faça uma nova busca.",
              409,
            );
          }
          const locked = assetKeys.length
            ? await transaction
                .select()
                .from(portfolioObjectivePositions)
                .where(inArray(portfolioObjectivePositions.assetKey, assetKeys))
                .orderBy(portfolioObjectivePositions.assetKey)
                .for("update")
            : [];
          const currentOwners = new Map(
            locked.map((row) => [row.assetKey, row.objectiveId]),
          );
          for (const assetKey of assetKeys) {
            if (
              (currentOwners.get(assetKey) ?? null) !==
              input.expectedOwners[assetKey]
            ) {
              throw new ApplicationError(
                "Uma posição mudou de destino desde a busca. Atualize e tente novamente.",
                409,
              );
            }
          }
          const destinationIds = [
            ...new Set([
              ...input.references.map((reference) => reference.objectiveId),
              ...Object.values(input.allocation).filter(
                (id): id is string => id !== null,
              ),
            ]),
          ].sort();
          const validObjectives = await transaction
            .select({ id: portfolioObjectives.id })
            .from(portfolioObjectives)
            .where(inArray(portfolioObjectives.id, destinationIds))
            .for("update");
          if (
            destinationIds.some(
              (id) => !validObjectives.some((objective) => objective.id === id),
            )
          ) {
            throw new ApplicationError(
              "Um objetivo não está mais disponível. Atualize e tente novamente.",
              409,
            );
          }
          const batch = await transaction
            .insert(portfolioObjectiveReferenceBatches)
            .values({ observedOn: input.observedOn })
            .returning({ id: portfolioObjectiveReferenceBatches.id });
          const batchId = batch[0].id;
          if (input.references.length) {
            await transaction
              .insert(portfolioObjectiveBalanceReferences)
              .values(
                input.references.map((reference) => ({
                  ...reference,
                  batchId,
                })),
              );
          }
          for (const assetKey of assetKeys) {
            const from = input.expectedOwners[assetKey] ?? null;
            const to = input.allocation[assetKey] ?? null;
            if (from === to) continue;
            if (from !== null) {
              await transaction
                .delete(portfolioObjectivePositions)
                .where(
                  and(
                    eq(portfolioObjectivePositions.assetKey, assetKey),
                    eq(portfolioObjectivePositions.objectiveId, from),
                  ),
                );
            }
            if (to !== null) {
              await transaction
                .insert(portfolioObjectivePositions)
                .values({ assetKey, objectiveId: to });
            }
          }
          return { batchId };
        },
        { isolationLevel: "serializable" },
      );
    } catch (error) {
      const postgresError = error as { code?: string; constraint?: string };
      if (postgresError.code === "40001" || postgresError.code === "40P01") {
        throw new ApplicationError(
          "Uma atribuição mudou durante a confirmação. Atualize e tente novamente.",
          409,
        );
      }
      if (
        postgresError.code === "23505" &&
        postgresError.constraint ===
          "portfolio_objective_positions_assetKey_unique"
      ) {
        throw new ApplicationError(
          "Uma posição foi atribuída a outro objetivo durante a confirmação. Atualize e tente novamente.",
          409,
        );
      }
      throw error;
    }
  }

  async listReserveAssignments() {
    const assignments = await this.listAssignments();
    return assignments
      .filter((assignment) => assignment.objectiveId === reserveObjectiveId)
      .map((assignment) => assignment.assetKey);
  }

  async replaceReserveAssignments(assetKeys: string[]) {
    return this.replaceAssignments(reserveObjectiveId, assetKeys);
  }
}

export const portfolioObjectivesRepository =
  new PortfolioObjectivesRepository();
