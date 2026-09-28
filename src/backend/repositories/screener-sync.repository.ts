import { and, desc, eq, or, sql } from "drizzle-orm";
import {
  screenerFinancialFacts,
  screenerIngestionRuns,
  screenerIssuers,
  screenerSecurities,
  valuationAccountingFacts,
} from "@/infrastructure/database/schema";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/logging/logger";
import type {
  CvmCompanyRecord,
  ScreenerFactRecord,
  BrapiStock,
} from "@/backend/providers/screener-data.provider";
import type { ValuationAccountingFactRecord } from "@/backend/providers/cvm-valuation-input.provider";

export type ScreenerSecurityRecord = BrapiStock & {
  issuerCnpj: string;
  baseTicker: string | null;
};

type PersistenceStage =
  | "issuer_upsert"
  | "securities_deactivation"
  | "security_upsert"
  | "financial_facts_upsert"
  | "financial_facts_count"
  | "valuation_accounting_facts_upsert"
  | "completion_update"
  | "transaction_commit"
  | "mark_failed"
  | "transaction";

function safeDatabaseErrorContext(error: unknown) {
  const errorRecord =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : undefined;
  const errorType =
    errorRecord &&
    typeof errorRecord.name === "string" &&
    /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(errorRecord.name)
      ? errorRecord.name
      : "unknown";
  const context: Record<string, string> = { errorType };
  const visited = new Set<object>();
  let databaseErrorType: string | undefined;
  let current: unknown = error;

  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== "object" || visited.has(current)) break;
    visited.add(current);
    const source = current as Record<string, unknown>;
    if (
      depth > 0 &&
      typeof source.name === "string" &&
      /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(source.name)
    )
      databaseErrorType = source.name;
    if (
      !context.databaseCode &&
      typeof source.code === "string" &&
      /^[A-Z0-9]{5}$/.test(source.code)
    )
      context.databaseCode = source.code;
    for (const field of ["constraint", "table", "column"] as const) {
      const value = source[field];
      if (
        !context[field] &&
        typeof value === "string" &&
        /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(value)
      )
        context[field] = value;
    }
    current = source.cause;
  }
  if (databaseErrorType) context.databaseErrorType = databaseErrorType;
  return context;
}
async function withPersistenceDiagnostics<T>(
  stage: PersistenceStage,
  context: Record<string, number | string>,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await operation();
  } catch (error) {
    logger.error("screener_sync_persistence_failed", {
      stage,
      ...context,
      durationMs: Math.max(0, Date.now() - startedAt),
      ...safeDatabaseErrorContext(error),
    });
    throw error;
  }
}
export class ScreenerSyncRepository {
  async getStatus() {
    const database = getDatabaseClient();
    const [latestRun] = await database
      .select({
        status: screenerIngestionRuns.status,
        startedAt: screenerIngestionRuns.startedAt,
        completedAt: screenerIngestionRuns.completedAt,
        issuerCount: screenerIngestionRuns.issuerCount,
        securityCount: screenerIngestionRuns.securityCount,
        factCount: screenerIngestionRuns.factCount,
        errorCode: screenerIngestionRuns.errorCode,
      })
      .from(screenerIngestionRuns)
      .orderBy(desc(screenerIngestionRuns.startedAt))
      .limit(1);
    const successfulRuns = await database
      .select({ completedAt: screenerIngestionRuns.completedAt })
      .from(screenerIngestionRuns)
      .where(eq(screenerIngestionRuns.status, "COMPLETED"))
      .orderBy(desc(screenerIngestionRuns.completedAt))
      .limit(1);

    return {
      hasSuccessfulSync: successfulRuns.length > 0,
      lastSuccessfulCompletedAt: successfulRuns[0]?.completedAt ?? null,
      latestRun: latestRun ?? null,
    };
  }
  async startRun(runKey: string) {
    const [run] = await getDatabaseClient()
      .insert(screenerIngestionRuns)
      .values({ runKey, status: "RUNNING" })
      .returning({ id: screenerIngestionRuns.id });
    if (!run) throw new Error("Could not create screener ingestion run");
    return run.id;
  }

  async saveFullSync(input: {
    runId: string;
    catalogCount: number;
    profileCount: number;
    issuers: CvmCompanyRecord[];
    securities: ScreenerSecurityRecord[];
    facts: ScreenerFactRecord[];
  }) {
    const database = getDatabaseClient();
    let stage: PersistenceStage = "transaction";
    let operationContext: Record<string, number | string> = {};
    let operationStartedAt = Date.now();
    let persistedFactCount = 0;
    try {
      await database.transaction(async (tx) => {
        if (input.issuers.length > 0) {
          stage = "issuer_upsert";
          operationContext = { issuerCount: input.issuers.length };
          operationStartedAt = Date.now();
          await tx
            .insert(screenerIssuers)
            .values(
              input.issuers.map((issuer) => ({
                cnpj: issuer.cnpj,
                cvmCode: issuer.cvmCode,
                name: issuer.name,
                sector: issuer.sector,
              })),
            )
            .onConflictDoUpdate({
              target: screenerIssuers.cnpj,
              set: {
                cvmCode: sql`excluded."cvmCode"`,
                name: sql`excluded.name`,
                sector: sql`excluded.sector`,
                updatedAt: new Date(),
              },
            });
        }
        stage = "securities_deactivation";
        operationContext = { securityCount: input.securities.length };
        operationStartedAt = Date.now();
        await tx
          .update(screenerSecurities)
          .set({ isActive: false, updatedAt: new Date() });
        for (let offset = 0; offset < input.securities.length; offset += 500) {
          const batch = input.securities.slice(offset, offset + 500);
          stage = "security_upsert";
          operationContext = {
            batchIndex: Math.floor(offset / 500) + 1,
            batchSize: batch.length,
            securityCount: input.securities.length,
          };
          operationStartedAt = Date.now();
          await tx
            .insert(screenerSecurities)
            .values(
              batch.map((security) => ({
                ticker: security.ticker,
                issuerCnpj: security.issuerCnpj,
                name: security.name,
                subType: security.subtype,
                isActive: security.active,
                baseTicker: security.baseTicker,
                observedAt: new Date(),
              })),
            )
            .onConflictDoUpdate({
              target: screenerSecurities.ticker,
              set: {
                issuerCnpj: sql`excluded."issuerCnpj"`,
                name: sql`excluded.name`,
                subType: sql`excluded."subType"`,
                isActive: sql`excluded."isActive"`,
                baseTicker: sql`excluded."baseTicker"`,
                observedAt: sql`excluded."observedAt"`,
                updatedAt: new Date(),
              },
            });
        }
        for (let offset = 0; offset < input.facts.length; offset += 500) {
          const batch = input.facts.slice(offset, offset + 500);
          stage = "financial_facts_upsert";
          operationContext = {
            batchIndex: Math.floor(offset / 500) + 1,
            batchSize: batch.length,
            factCount: input.facts.length,
          };
          operationStartedAt = Date.now();
          await tx
            .insert(screenerFinancialFacts)
            .values(
              batch.map((fact) => ({
                issuerCnpj: fact.issuerCnpj,
                referenceDate: fact.referenceDate,
                accountCode: fact.accountCode,
                accountLabel: fact.accountLabel,
                value: fact.value,
                documentType: fact.documentType,
                statementScope: fact.statementScope,
                exerciseOrder: fact.exerciseOrder,
                version: fact.version,
                sourceFile: fact.sourceFile,
                sourceRow: fact.sourceRow,
                ingestionRunId: input.runId,
              })),
            )
            .onConflictDoUpdate({
              target: [
                screenerFinancialFacts.issuerCnpj,
                screenerFinancialFacts.referenceDate,
                screenerFinancialFacts.accountCode,
                screenerFinancialFacts.documentType,
                screenerFinancialFacts.statementScope,
                screenerFinancialFacts.exerciseOrder,
              ],
              set: {
                accountLabel: sql`excluded."accountLabel"`,
                value: sql`excluded.value`,
                version: sql`excluded.version`,
                sourceFile: sql`excluded."sourceFile"`,
                sourceRow: sql`excluded."sourceRow"`,
                ingestionRunId: sql`excluded."ingestionRunId"`,
                updatedAt: new Date(),
              },
              setWhere: sql`
            excluded.version > ${screenerFinancialFacts.version}
            OR (
              excluded."accountCode" = '6.01'
              AND excluded."sourceFile" LIKE '%DFC_MI_con_%'
              AND ${screenerFinancialFacts.sourceFile} LIKE '%DFC_MD_con_%'
            )
            OR (
              excluded.version = ${screenerFinancialFacts.version}
              AND NOT (
                excluded."accountCode" = '6.01'
                AND excluded."sourceFile" LIKE '%DFC_MD_con_%'
                AND ${screenerFinancialFacts.sourceFile} LIKE '%DFC_MI_con_%'
              )
              AND (
                excluded."sourceFile" < ${screenerFinancialFacts.sourceFile}
                OR (
                  excluded."sourceFile" = ${screenerFinancialFacts.sourceFile}
                  AND excluded."sourceRow" < ${screenerFinancialFacts.sourceRow}
                )
              )
            )
          `,
            });
        }
        stage = "financial_facts_count";
        operationContext = { factCount: input.facts.length };
        operationStartedAt = Date.now();
        for (let offset = 0; offset < input.facts.length; offset += 500) {
          const batch = input.facts.slice(offset, offset + 500);
          const [representedFacts] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(screenerFinancialFacts)
            .where(
              or(
                ...batch.map((fact) =>
                  and(
                    eq(screenerFinancialFacts.issuerCnpj, fact.issuerCnpj),
                    eq(
                      screenerFinancialFacts.referenceDate,
                      fact.referenceDate,
                    ),
                    eq(screenerFinancialFacts.accountCode, fact.accountCode),
                    eq(screenerFinancialFacts.documentType, fact.documentType),
                    eq(
                      screenerFinancialFacts.statementScope,
                      fact.statementScope,
                    ),
                    eq(
                      screenerFinancialFacts.exerciseOrder,
                      fact.exerciseOrder,
                    ),
                  ),
                ),
              ),
            );
          persistedFactCount += Number(representedFacts?.count ?? 0);
        }
        if (input.facts.length === 0) {
          const [emptyResult] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(screenerFinancialFacts)
            .where(sql`false`);
          persistedFactCount = Number(emptyResult?.count ?? 0);
        }

        stage = "completion_update";
        operationContext = {
          issuerCount: input.issuers.length,
          securityCount: input.securities.length,
          factCount: input.facts.length,
        };
        operationStartedAt = Date.now();
        await tx
          .update(screenerIngestionRuns)
          .set({
            status: "COMPLETED",
            completedAt: new Date(),
            issuerCount: input.issuers.length,
            securityCount: input.securities.length,
            factCount: input.facts.length,
            catalogCount: input.catalogCount,
            profileCount: input.profileCount,
          })
          .where(eq(screenerIngestionRuns.id, input.runId));
        stage = "transaction_commit";
        operationContext = {
          issuerCount: input.issuers.length,
          securityCount: input.securities.length,
          factCount: input.facts.length,
        };
        operationStartedAt = Date.now();
      });
      return { persistedFactCount };
    } catch (error) {
      logger.error("screener_sync_persistence_failed", {
        stage,
        runId: input.runId,
        ...operationContext,
        durationMs: Math.max(0, Date.now() - operationStartedAt),
        ...safeDatabaseErrorContext(error),
      });
      throw error;
    }
  }

  async markFailed(runId: string, errorCode: string) {
    await withPersistenceDiagnostics("mark_failed", { runId }, async () =>
      getDatabaseClient()
        .update(screenerIngestionRuns)
        .set({
          status: "FAILED",
          completedAt: new Date(),
          errorCode,
        })
        .where(eq(screenerIngestionRuns.id, runId)),
    );
  }
  async saveValuationFacts(input: {
    runId: string;
    facts: ValuationAccountingFactRecord[];
  }) {
    if (input.facts.length === 0) return;
    const database = getDatabaseClient();
    try {
      await database.transaction(async (tx) => {
        for (let offset = 0; offset < input.facts.length; offset += 500) {
          const batch = input.facts.slice(offset, offset + 500);
          await tx
            .insert(valuationAccountingFacts)
            .values(
              batch.map((fact) => ({
                factKey: fact.factKey,
                issuerCnpj: fact.issuerCnpj,
                ingestionRunId: input.runId,
                documentType: fact.documentType,
                documentId: fact.documentId,
                documentCategory: fact.documentCategory,
                documentReceivedDate: fact.documentReceivedDate,
                metadataMatch: fact.metadataMatch,
                referenceDate: fact.referenceDate,
                periodStart: fact.periodStart,
                periodEnd: fact.periodEnd,
                statement: fact.statement,
                accountCode: fact.accountCode,
                accountLabel: fact.accountLabel,
                candidateKind: fact.candidateKind,
                rawValue: fact.rawValue,
                currency: fact.currency,
                scale: fact.scale,
                statementGroup: fact.statementGroup,
                exerciseOrder: fact.exerciseOrder,
                version: fact.version,
                sourceFile: fact.sourceFile,
                sourceRow: fact.sourceRow,
                archiveFetchedAt: fact.archiveFetchedAt,
                recordType: fact.recordType,
                calculatedValue: fact.calculatedValue,
                derivationMethod: fact.derivationMethod,
                derivationCurrentFactKey: fact.derivationCurrentFactKey,
                derivationPreviousFactKey: fact.derivationPreviousFactKey,
              })),
            )
            .onConflictDoUpdate({
              target: valuationAccountingFacts.factKey,
              set: {
                ingestionRunId: sql`excluded.ingestion_run_id`,
                documentId: sql`excluded.document_id`,
                documentCategory: sql`excluded.document_category`,
                documentReceivedDate: sql`excluded.document_received_date`,
                metadataMatch: sql`excluded.metadata_match`,
                referenceDate: sql`excluded.reference_date`,
                periodStart: sql`excluded.period_start`,
                periodEnd: sql`excluded.period_end`,
                statement: sql`excluded.statement`,
                accountCode: sql`excluded.account_code`,
                accountLabel: sql`excluded.account_label`,
                candidateKind: sql`excluded.candidate_kind`,
                rawValue: sql`excluded.raw_value`,
                currency: sql`excluded.currency`,
                scale: sql`excluded.scale`,
                statementGroup: sql`excluded.statement_group`,
                exerciseOrder: sql`excluded.exercise_order`,
                version: sql`excluded.version`,
                sourceFile: sql`excluded.source_file`,
                sourceRow: sql`excluded.source_row`,
                archiveFetchedAt: sql`excluded.archive_fetched_at`,
                recordType: sql`excluded.record_type`,
                calculatedValue: sql`excluded.calculated_value`,
                derivationMethod: sql`excluded.derivation_method`,
                derivationCurrentFactKey: sql`excluded.derivation_current_fact_key`,
                derivationPreviousFactKey: sql`excluded.derivation_previous_fact_key`,
              },
            });
        }
      });
    } catch (error) {
      logger.error("screener_sync_persistence_failed", {
        stage: "valuation_accounting_facts_upsert",
        runId: input.runId,
        factCount: input.facts.length,
        ...safeDatabaseErrorContext(error),
      });
      throw error;
    }
  }
}

export const screenerSyncRepository = new ScreenerSyncRepository();
