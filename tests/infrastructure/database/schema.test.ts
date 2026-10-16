import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as databaseSchema from "@/infrastructure/database/schema";

import {
  positionReconciliationEvents,
  imports,
  movementItems,
  portfolioObjectivePositions,
  portfolioObjectives,
  manualPortfolioAdjustmentEvents,
  manualPortfolioOperations,
  portfolioOperationReconciliationEvents,
  positionItems,
  positionSnapshots,
  manualPortfolioPositionSnapshots,
  stockOpportunityManualInputs,
  authUsers,
} from "@/infrastructure/database/schema";

describe("database schema", () => {
  it("exposes valid Drizzle configurations for every declared table", () => {
    const configs = Object.values(databaseSchema).map((table) =>
      getTableConfig(table),
    );
    configs.forEach((config) =>
      config.foreignKeys.forEach((foreignKey) => {
        const reference = foreignKey.reference();
        expect(reference.foreignColumns.length).toBeGreaterThan(0);
      }),
    );
    const names = configs.map((config) => config.name);

    expect(configs.length).toBeGreaterThan(0);
    expect(names.every((name) => name.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it("retains reconciliation audit events without cascading source deletion", () => {
    const config = getTableConfig(positionReconciliationEvents);
    expect(config.name).toBe("position_reconciliation_events");
    expect(config.foreignKeys).toHaveLength(1);
    expect(config.foreignKeys[0].reference().foreignColumns).toContain(
      authUsers.id,
    );
    expect(config.indexes).toHaveLength(1);
    expect(config.checks).toHaveLength(1);
  });
  it("defines the import, position and movement tables", () => {
    expect(getTableName(imports)).toBe("imports");
    expect(getTableName(positionSnapshots)).toBe("position_snapshots");
    expect(getTableName(positionItems)).toBe("position_items");
    expect(getTableName(movementItems)).toBe("movement_items");
    const snapshotForeignKey = getTableConfig(
      positionSnapshots,
    ).foreignKeys.find((key) =>
      key.reference().foreignColumns.includes(imports.id),
    );
    const itemForeignKey = getTableConfig(positionItems).foreignKeys.find(
      (key) => key.reference().foreignColumns.includes(positionSnapshots.id),
    );
    const movementForeignKey = getTableConfig(movementItems).foreignKeys.find(
      (key) => key.reference().foreignColumns.includes(imports.id),
    );
    expect(snapshotForeignKey).toBeDefined();
    expect(itemForeignKey).toBeDefined();
    expect(movementForeignKey).toBeDefined();
    expect(snapshotForeignKey?.reference().foreignColumns).toContain(
      imports.id,
    );
    expect(itemForeignKey?.reference().foreignColumns).toContain(
      positionSnapshots.id,
    );
    expect(movementForeignKey?.reference().foreignColumns).toContain(
      imports.id,
    );
    const movementFingerprintIndex = getTableConfig(movementItems).indexes.find(
      (index) =>
        index.config.name === "movement_items_user_event_fingerprint_uidx",
    );
    expect(movementFingerprintIndex?.config.columns).toHaveLength(2);
    expect(movementItems.eventFingerprint.notNull).toBe(true);
  });

  it("stores portfolio objectives with single-objective position assignments", () => {
    expect(getTableName(portfolioObjectives)).toBe("portfolio_objectives");
    expect(getTableName(portfolioObjectivePositions)).toBe(
      "portfolio_objective_positions",
    );

    const objectiveConfig = getTableConfig(portfolioObjectives);
    expect(objectiveConfig.indexes).toHaveLength(1);
    expect(
      objectiveConfig.columns.find((column) => column.name === "name")?.notNull,
    ).toBe(true);

    const assignmentConfig = getTableConfig(portfolioObjectivePositions);
    expect(assignmentConfig.foreignKeys).toHaveLength(2);
    const objectiveForeignKey = assignmentConfig.foreignKeys.find((key) =>
      key.reference().foreignColumns.includes(portfolioObjectives.id),
    );
    expect(objectiveForeignKey).toBeDefined();
    expect(objectiveForeignKey?.reference().foreignColumns).toContain(
      portfolioObjectives.id,
    );
    expect(
      assignmentConfig.indexes.find(
        (index) =>
          index.config.name === "portfolio_objective_positions_user_asset_uidx",
      )?.config.columns,
    ).toHaveLength(2);
  });

  it("stores manual stock opportunity inputs with unique ticker and input keys", () => {
    expect(getTableName(stockOpportunityManualInputs)).toBe(
      "stock_opportunity_manual_inputs",
    );
    const config = getTableConfig(stockOpportunityManualInputs);
    expect(config.indexes).toHaveLength(2);
    expect(config.indexes.map((index) => index.config.name)).toEqual([
      "stock_opportunity_manual_user_ticker_input_idx",
      "stock_opportunity_manual_ticker_idx",
    ]);
    expect(config.columns.map((column) => column.name)).toContain("inputKey");
  });

  it("stores append-only manual portfolio observations by asset and timestamp", () => {
    const config = getTableConfig(manualPortfolioPositionSnapshots);
    expect(config.name).toBe("manual_portfolio_position_snapshots");
    expect(config.indexes.map((index) => index.config.name)).toContain(
      "manual_portfolio_position_snapshots_user_asset_recorded_uidx",
    );
    expect(config.columns.map((column) => column.name)).toContain(
      "conversionDate",
    );
    expect(config.foreignKeys).toHaveLength(1);
    expect(config.foreignKeys[0].reference().foreignColumns).toContain(
      authUsers.id,
    );
  });
  it("stores economic changes as explicit neutral manual adjustment events", () => {
    const config = getTableConfig(manualPortfolioAdjustmentEvents);
    expect(config.name).toBe("manual_portfolio_adjustment_events");
    expect(config.foreignKeys).toHaveLength(1);
    expect(config.foreignKeys[0].reference().foreignColumns).toContain(
      authUsers.id,
    );
    expect(config.indexes.map((index) => index.config.name)).toContain(
      "manual_portfolio_adjustment_events_asset_recorded_idx",
    );
    expect(config.checks.map((constraint) => constraint.name)).toContain(
      "manual_portfolio_adjustment_events_type_check",
    );
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "eventType",
        "previousQuantity",
        "quantity",
        "previousUnitPrice",
        "unitPrice",
        "previousTotalValue",
        "totalValue",
      ]),
    );
  });
  it("stores manual buy and sell records with append-only source reconciliation history", () => {
    const operations = getTableConfig(manualPortfolioOperations);
    const reconciliations = getTableConfig(
      portfolioOperationReconciliationEvents,
    );
    expect(operations.name).toBe("manual_portfolio_operations");
    expect(operations.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "manual_portfolio_operations_side_check",
        "manual_portfolio_operations_quantity_check",
        "manual_portfolio_operations_unit_price_check",
        "manual_portfolio_operations_fees_check",
      ]),
    );
    expect(operations.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "side",
        "effectiveDate",
        "currency",
        "fees",
        "idempotencyKey",
      ]),
    );
    expect(reconciliations.name).toBe(
      "portfolio_operation_reconciliation_events",
    );
    expect(reconciliations.foreignKeys).toHaveLength(3);
    expect(reconciliations.columns.map((column) => column.name)).toContain(
      "eventOrder",
    );
    expect(
      reconciliations.foreignKeys.map((key) => key.reference().foreignColumns),
    ).toEqual(
      expect.arrayContaining([
        [manualPortfolioOperations.id],
        [movementItems.id],
      ]),
    );
    expect(reconciliations.checks).toHaveLength(1);
  });
});
