import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  imports,
  positionItems,
  positionSnapshots,
} from "@/infrastructure/database/schema";

describe("database schema", () => {
  it("defines the import and position tables", () => {
    expect(getTableName(imports)).toBe("imports");
    expect(getTableName(positionSnapshots)).toBe("position_snapshots");
    expect(getTableName(positionItems)).toBe("position_items");
    const snapshotForeignKey = getTableConfig(positionSnapshots).foreignKeys[0];
    const itemForeignKey = getTableConfig(positionItems).foreignKeys[0];
    expect(snapshotForeignKey.reference().foreignColumns).toContain(imports.id);
    expect(itemForeignKey.reference().foreignColumns).toContain(
      positionSnapshots.id,
    );
  });
});
