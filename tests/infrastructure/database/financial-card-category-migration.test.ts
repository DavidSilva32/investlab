import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("financial card category migration", () => {
  it("reassigns only matching owner-category references before deleting the duplicate", async () => {
    const migration = await readFile(
      "src/infrastructure/database/migrations/0072_add_financial_card_bill_category.sql",
      "utf8",
    );
    const preferenceMerge = migration.indexOf(
      'INSERT INTO "financial_category_preferences"',
    );
    const activeStateMerge = migration.indexOf(
      'INSERT INTO "financial_category_preferences"',
      preferenceMerge + 1,
    );
    const entryReassignment = migration.indexOf(
      'UPDATE "financial_entries" entry',
    );
    const recurrenceReassignment = migration.indexOf(
      'UPDATE "financial_recurrences" recurrence',
    );
    const ruleReassignment = migration.indexOf(
      'UPDATE "financial_statement_category_rules" rule',
    );
    const duplicateRemoval = migration.indexOf(
      'DELETE FROM "financial_categories" owner_category',
    );

    expect(preferenceMerge).toBeGreaterThan(-1);
    expect(activeStateMerge).toBeGreaterThan(preferenceMerge);
    expect(activeStateMerge).toBeLessThan(entryReassignment);
    expect(migration.slice(activeStateMerge, entryReassignment)).toContain(
      'owner_category."active"',
    );
    expect(entryReassignment).toBeGreaterThan(activeStateMerge);
    expect(recurrenceReassignment).toBeGreaterThan(entryReassignment);
    expect(ruleReassignment).toBeGreaterThan(recurrenceReassignment);
    expect(duplicateRemoval).toBeGreaterThan(ruleReassignment);
    expect(migration).toContain(
      'ON CONFLICT ("userId", "categoryId") DO NOTHING',
    );
    expect(migration).toContain('owner_category."userId" IS NOT NULL');
    expect(migration).toContain('entry."userId" = owner_category."userId"');
    expect(migration).toContain(
      'recurrence."userId" = owner_category."userId"',
    );
    expect(migration).toContain('rule."userId" = owner_category."userId"');
    expect(migration).toContain(
      "lower(trim(owner_category.\"name\")) = lower(trim('Fatura do cartão'))",
    );
    expect(migration).not.toMatch(/DELETE FROM "financial_entries"|TRUNCATE/i);
  });
});
