import { and, eq, gte, inArray, isNull, desc } from "drizzle-orm";
import {
  screenerFinancialFacts,
  screenerIngestionRuns,
  screenerIssuers,
  screenerMarketSnapshots,
  screenerSecurities,
} from "@/infrastructure/database/schema";
import { getDatabaseClient } from "@/infrastructure/database/client";

export class ScreenerRepository {
  async hasSuccessfulSync() {
    const [run] = await getDatabaseClient()
      .select({ id: screenerIngestionRuns.id })
      .from(screenerIngestionRuns)
      .where(eq(screenerIngestionRuns.status, "COMPLETED"))
      .limit(1);
    return Boolean(run);
  }
  async getUniverse() {
    const database = getDatabaseClient();
    const issuers = await database
      .select({
        cnpj: screenerIssuers.cnpj,
        cvmCode: screenerIssuers.cvmCode,
        name: screenerIssuers.name,
        sector: screenerIssuers.sector,
        quantitativeEligible: screenerIssuers.quantitativeEligible,
      })
      .from(screenerIssuers);
    if (issuers.length === 0) return [];

    const cnpjs = issuers.map((issuer) => issuer.cnpj);
    const quantitativeCnpjs = issuers
      .filter((issuer) => issuer.quantitativeEligible)
      .map((issuer) => issuer.cnpj);
    const minimumReferenceDate = `${new Date().getUTCFullYear() - 6}-01-01`;
    const [securities, facts, snapshots] = await Promise.all([
      database
        .select({
          issuerCnpj: screenerSecurities.issuerCnpj,
          ticker: screenerSecurities.ticker,
          name: screenerSecurities.name,
        })
        .from(screenerSecurities)
        .where(
          and(
            inArray(screenerSecurities.issuerCnpj, cnpjs),
            eq(screenerSecurities.subType, "stock"),
            eq(screenerSecurities.isActive, true),
            isNull(screenerSecurities.baseTicker),
          ),
        ),
      database
        .select({
          issuerCnpj: screenerFinancialFacts.issuerCnpj,
          referenceDate: screenerFinancialFacts.referenceDate,
          accountCode: screenerFinancialFacts.accountCode,
          accountLabel: screenerFinancialFacts.accountLabel,
          value: screenerFinancialFacts.value,
          documentType: screenerFinancialFacts.documentType,
          statementScope: screenerFinancialFacts.statementScope,
          exerciseOrder: screenerFinancialFacts.exerciseOrder,
        })
        .from(screenerFinancialFacts)
        .where(
          and(
            inArray(screenerFinancialFacts.issuerCnpj, cnpjs),
            gte(screenerFinancialFacts.referenceDate, minimumReferenceDate),
            inArray(screenerFinancialFacts.accountCode, [
              "3.01",
              "3.11",
              "2.03",
            ]),
            eq(screenerFinancialFacts.documentType, "DFP"),
            eq(screenerFinancialFacts.statementScope, "CONSOLIDATED"),
            eq(screenerFinancialFacts.exerciseOrder, "ULTIMO"),
          ),
        ),
      database
        .select({
          issuerCnpj: screenerMarketSnapshots.issuerCnpj,
          marketCap: screenerMarketSnapshots.marketCap,
          observedAt: screenerMarketSnapshots.observedAt,
          classSemanticsValidated:
            screenerMarketSnapshots.classSemanticsValidated,
        })
        .from(screenerMarketSnapshots)
        .where(
          and(
            inArray(screenerMarketSnapshots.issuerCnpj, quantitativeCnpjs),
            eq(screenerMarketSnapshots.classSemanticsValidated, true),
          ),
        )
        .orderBy(desc(screenerMarketSnapshots.observedAt)),
    ]);

    const byIssuer = new Map(
      issuers.map((issuer) => [
        issuer.cnpj,
        {
          ...issuer,
          securities: [] as { ticker: string; name: string }[],
          facts: [] as typeof facts,
          marketSnapshot: null as (typeof snapshots)[number] | null,
        },
      ]),
    );
    for (const security of securities)
      byIssuer.get(security.issuerCnpj)?.securities.push({
        ticker: security.ticker,
        name: security.name,
      });
    for (const fact of facts) byIssuer.get(fact.issuerCnpj)?.facts.push(fact);
    for (const snapshot of snapshots) {
      const company = byIssuer.get(snapshot.issuerCnpj);
      if (company && company.marketSnapshot === null)
        company.marketSnapshot = snapshot;
    }
    return [...byIssuer.values()].filter(
      (issuer) => issuer.securities.length > 0,
    );
  }
}

export const screenerRepository = new ScreenerRepository();
