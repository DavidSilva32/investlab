import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  screenerFinancialFacts,
  screenerIngestionRuns,
  screenerIssuers,
  screenerMarketSnapshots,
  screenerSecurities,
} from "@/infrastructure/database/schema";

describe("Screener persistence schema", () => {
  it("defines issuer, security, and run identity contracts", () => {
    const issuer = getTableConfig(screenerIssuers);
    const security = getTableConfig(screenerSecurities);
    const run = getTableConfig(screenerIngestionRuns);

    expect(issuer.name).toBe("screener_issuers");
    expect(issuer.columns.map(({ name }) => name)).toContain(
      "quantitativeEligible",
    );
    expect(issuer.columns.find(({ name }) => name === "cnpj")?.primary).toBe(
      true,
    );
    expect(security.name).toBe("screener_securities");
    expect(security.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "ticker",
        "issuerCnpj",
        "subType",
        "isActive",
        "baseTicker",
      ]),
    );
    expect(security.indexes.map(({ config }) => config.name)).toContain(
      "screener_securities_issuer_idx",
    );
    const securityReference = security.foreignKeys[0]?.reference();
    expect(securityReference?.columns.map(({ name }) => name)).toEqual([
      "issuerCnpj",
    ]);
    expect(securityReference?.foreignColumns.map(({ name }) => name)).toEqual([
      "cnpj",
    ]);
    expect(run.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "runKey",
        "status",
        "startedAt",
        "completedAt",
        "errorCode",
      ]),
    );
  });

  it("keeps financial fact provenance and unique identity at issuer and period grain", () => {
    const facts = getTableConfig(screenerFinancialFacts);
    expect(facts.name).toBe("screener_financial_facts");
    expect(facts.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "issuerCnpj",
        "referenceDate",
        "accountCode",
        "documentType",
        "statementScope",
        "exerciseOrder",
        "version",
        "sourceFile",
        "sourceRow",
        "ingestionRunId",
      ]),
    );
    expect(facts.indexes.map(({ config }) => config.name)).toEqual(
      expect.arrayContaining([
        "screener_facts_identity_uidx",
        "screener_facts_run_idx",
      ]),
    );
    expect(
      facts.foreignKeys.map(
        (foreignKey) => foreignKey.reference().columns[0]?.name,
      ),
    ).toEqual(["issuerCnpj", "ingestionRunId"]);
  });

  it("records market snapshots with freshness and class-semantics evidence", () => {
    const market = getTableConfig(screenerMarketSnapshots);
    expect(market.name).toBe("screener_market_snapshots");
    expect(market.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "issuerCnpj",
        "observedAt",
        "marketCap",
        "price",
        "sourceTicker",
        "classSemanticsValidated",
        "ingestionRunId",
      ]),
    );
    expect(market.indexes.map(({ config }) => config.name)).toContain(
      "screener_market_issuer_observed_idx",
    );
    expect(
      market.foreignKeys.map(
        (foreignKey) => foreignKey.reference().columns[0]?.name,
      ),
    ).toEqual(["issuerCnpj", "ingestionRunId"]);
  });
});
