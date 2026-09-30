import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  imports,
  movementItems,
  portfolioObjectivePositions,
  portfolioObjectives,
  positionItems,
  positionSnapshots,
} from "@/infrastructure/database/schema";

describe("database schema", () => {
  it("defines the import, position and movement tables", () => {
    expect(getTableName(imports)).toBe("imports");
    expect(getTableName(positionSnapshots)).toBe("position_snapshots");
    expect(getTableName(positionItems)).toBe("position_items");
    expect(getTableName(movementItems)).toBe("movement_items");
    const snapshotForeignKey = getTableConfig(positionSnapshots).foreignKeys[0];
    const itemForeignKey = getTableConfig(positionItems).foreignKeys[0];
    const movementForeignKey = getTableConfig(movementItems).foreignKeys[0];
    expect(snapshotForeignKey.reference().foreignColumns).toContain(imports.id);
    expect(itemForeignKey.reference().foreignColumns).toContain(
      positionSnapshots.id,
    );
    expect(movementForeignKey.reference().foreignColumns).toContain(imports.id);
    expect(movementItems.eventFingerprint).toMatchObject({
      name: "eventFingerprint",
      notNull: true,
      isUnique: true,
      uniqueName: "movement_items_eventFingerprint_unique",
    });
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
    expect(assignmentConfig.foreignKeys).toHaveLength(1);
    expect(
      assignmentConfig.foreignKeys[0].reference().foreignColumns,
    ).toContain(portfolioObjectives.id);
    expect(
      assignmentConfig.columns.find((column) => column.name === "assetKey")
        ?.isUnique,
    ).toBe(true);
  });
});
