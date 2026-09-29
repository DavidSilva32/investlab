import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  positionItems,
  positionSnapshots,
  treasuryLiquidityRules,
  treasuryPositionLiquidityFacts,
} from "@/infrastructure/database/schema";

describe("Treasury liquidity schema", () => {
  it("seeds operational and regulatory provenance separately", () => {
    const migration = readFileSync(
      new URL(
        "../../../src/infrastructure/database/migrations/0021_dashing_union_jack.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).toContain(
      "https://www.tesourodireto.com.br/sobre-o-tesouro/regras-e-regulamento",
    );
    expect(migration).toContain("Regras e Regulamento do Tesouro Direto");
    expect(migration).toContain(
      '"regulatoryBasis":{"sourceUrl":"https://www.in.gov.br/web/dou/-/portaria-mf-n-1.748-de-8-de-novembro-de-2024-595136872"',
    );
    expect(migration).toContain('"effectiveFrom":"2024-11-11"');
    expect(migration).toContain("'2026-09-29',");
    expect(migration).toContain("'portaria-mf-1748-2024-v1',");
  });

  it("keeps general terms versioned separately from per-snapshot facts", () => {
    const rules = getTableConfig(treasuryLiquidityRules);
    const facts = getTableConfig(treasuryPositionLiquidityFacts);

    expect(rules.name).toBe("treasury_liquidity_rules");
    expect(rules.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "version",
        "sourceUrl",
        "sourceTitle",
        "observedAt",
        "effectiveFrom",
        "effectiveTo",
        "terms",
      ]),
    );
    expect(rules.columns.find(({ name }) => name === "version")?.isUnique).toBe(
      true,
    );

    expect(facts.name).toBe("treasury_position_liquidity_facts");
    expect(facts.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "positionItemId",
        "snapshotId",
        "ruleVersion",
        "status",
        "reasons",
        "asOf",
        "availableQuantity",
        "settlementEstimate",
      ]),
    );
    expect(facts.indexes.map(({ config }) => config.name)).toContain(
      "treasury_position_liquidity_position_uidx",
    );
    const positionReference = facts.foreignKeys.find((foreignKey) =>
      foreignKey.reference().foreignColumns.includes(positionItems.id),
    );
    const snapshotReference = facts.foreignKeys.find((foreignKey) =>
      foreignKey.reference().foreignColumns.includes(positionSnapshots.id),
    );
    const ruleReference = facts.foreignKeys.find((foreignKey) =>
      foreignKey
        .reference()
        .foreignColumns.includes(treasuryLiquidityRules.version),
    );
    expect(positionReference?.onDelete).toBe("cascade");
    expect(snapshotReference?.onDelete).toBe("cascade");
    expect(ruleReference?.reference().columns.map(({ name }) => name)).toEqual([
      "ruleVersion",
    ]);
  });
});
