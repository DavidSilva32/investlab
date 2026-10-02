import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("strategy purpose migration", () => {
  it("adds a nullable purpose and only classifies reserve rows by structural kind", async () => {
    const migration = await readFile(
      "src/infrastructure/database/migrations/0027_big_millenium_guard.sql",
      "utf8",
    );
    expect(migration).toContain(
      'ALTER TABLE "portfolio_objectives" ADD COLUMN "purpose" varchar(32);',
    );
    expect(migration).toContain(
      'UPDATE "portfolio_objectives" SET "purpose" = \'RESERVE\' WHERE "kind" = \'RESERVE\';',
    );
    expect(migration).not.toMatch(/WHERE\s+"name"/i);
    expect(migration).not.toMatch(/DROP|DELETE|TRUNCATE/i);
  });

  it("keeps the existing strategy choice separate from allocation targets", async () => {
    const migration = await readFile(
      "src/infrastructure/database/migrations/0026_soft_sebastian_shaw.sql",
      "utf8",
    );
    expect(migration).toContain('CREATE TABLE "personal_investment_strategy"');
    expect(migration).toContain('"selectedDirection" varchar(40) NOT NULL');
    expect(migration).not.toContain("portfolio_allocation_targets");
  });
});
