import { desc, eq, sql } from "drizzle-orm";
import {
  screenerFinancialFacts,
  screenerIngestionRuns,
  screenerIssuers,
  screenerSecurities,
} from "@/infrastructure/database/schema";
import { getDatabaseClient } from "@/infrastructure/database/client";
import type {
  CvmCompanyRecord,
  ScreenerFactRecord,
  BrapiStock,
} from "@/backend/providers/screener-data.provider";

export type ScreenerSecurityRecord = BrapiStock & {
  issuerCnpj: string;
  baseTicker: string | null;
};

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
    await database.transaction(async (tx) => {
      if (input.issuers.length > 0) {
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
      await tx
        .update(screenerSecurities)
        .set({ isActive: false, updatedAt: new Date() });
      for (let offset = 0; offset < input.securities.length; offset += 500) {
        const batch = input.securities.slice(offset, offset + 500);
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
  }

  async markFailed(runId: string, errorCode: string) {
    await getDatabaseClient()
      .update(screenerIngestionRuns)
      .set({
        status: "FAILED",
        completedAt: new Date(),
        errorCode,
      })
      .where(eq(screenerIngestionRuns.id, runId));
  }
}

export const screenerSyncRepository = new ScreenerSyncRepository();
