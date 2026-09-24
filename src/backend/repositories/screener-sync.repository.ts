import { desc, eq, sql } from "drizzle-orm";
import {
  screenerFinancialFacts,
  screenerIngestionRuns,
  screenerIssuers,
  screenerSecurities,
} from "@/infrastructure/database/schema";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/logging/logger";
import type {
  CvmCompanyRecord,
  ScreenerFactRecord,
  BrapiStock,
} from "@/backend/providers/screener-data.provider";

export type ScreenerSecurityRecord = BrapiStock & {
  issuerCnpj: string;
  baseTicker: string | null;
};

type PersistenceStage =
  | "issuer_upsert"
  | "securities_deactivation"
  | "security_upsert"
  | "financial_facts_upsert"
  | "completion_update"
  | "mark_failed"
  | "transaction";

function safeDatabaseErrorContext(error: unknown) {
  if (!error || typeof error !== "object") return { errorType: "unknown" };
  const source = error as Record<string, unknown>;
  const errorType =
    typeof source.name === "string" &&
    /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(source.name)
      ? source.name
      : "unknown";
  const context: Record<string, string> = { errorType };
  if (typeof source.code === "string" && /^[A-Z0-9]{5}$/.test(source.code))
    context.databaseCode = source.code;
  for (const field of ["constraint", "table", "column"] as const) {
    const value = source[field];
    if (
      typeof value === "string" &&
      /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(value)
    )
      context[field] = value;
  }
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
      .select({ status: screenerIngestionRuns.status })
      .from(screenerIngestionRuns)
      .where(eq(screenerIngestionRuns.status, "COMPLETED"))
      .limit(1);

    return {
      hasSuccessfulSync: successfulRuns.length > 0,
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
                quantitativeEligible: issuer.quantitativeEligible,
                eligibilityReason: issuer.quantitativeEligible
                  ? null
                  : "EXPLICIT_FINANCIAL_SECTOR_OR_UNCLASSIFIED",
              })),
            )
            .onConflictDoUpdate({
              target: screenerIssuers.cnpj,
              set: {
                cvmCode: sql`excluded.cvm_code`,
                name: sql`excluded.name`,
                sector: sql`excluded.sector`,
                quantitativeEligible: sql`excluded.quantitative_eligible`,
                eligibilityReason: sql`excluded.eligibility_reason`,
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
                issuerCnpj: sql`excluded.issuer_cnpj`,
                name: sql`excluded.name`,
                subType: sql`excluded.sub_type`,
                isActive: sql`excluded.is_active`,
                baseTicker: sql`excluded.base_ticker`,
                observedAt: sql`excluded.observed_at`,
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
                accountLabel: sql`excluded.account_label`,
                value: sql`excluded.value`,
                version: sql`excluded.version`,
                sourceFile: sql`excluded.source_file`,
                sourceRow: sql`excluded.source_row`,
                ingestionRunId: sql`excluded.ingestion_run_id`,
                updatedAt: new Date(),
              },
              setWhere: sql`
            excluded.version > ${screenerFinancialFacts.version}
            OR (
              excluded.version = ${screenerFinancialFacts.version}
              AND (
                excluded.source_file < ${screenerFinancialFacts.sourceFile}
                OR (
                  excluded.source_file = ${screenerFinancialFacts.sourceFile}
                  AND excluded.source_row < ${screenerFinancialFacts.sourceRow}
                )
              )
            )
          `,
            });
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
      });
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
    await withPersistenceDiagnostics("mark_failed", {}, async () =>
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
}

export const screenerSyncRepository = new ScreenerSyncRepository();
