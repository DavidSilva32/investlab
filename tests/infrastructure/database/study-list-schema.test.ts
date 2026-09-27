import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  studyListEntries,
  studyListObservations,
} from "@/infrastructure/database/schema";

describe("Study list schema", () => {
  it("deduplicates entries by issuer CNPJ and preserves observations separately", () => {
    const entries = getTableConfig(studyListEntries);
    const observations = getTableConfig(studyListObservations);

    expect(entries.name).toBe("study_list_entries");
    expect(entries.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "issuerCnpj",
        "companyName",
        "ticker",
        "reason",
        "addedAt",
      ]),
    );
    expect(
      entries.columns.find(({ name }) => name === "issuerCnpj")?.primary,
    ).toBe(true);
    expect(entries.foreignKeys).toHaveLength(0);

    expect(observations.name).toBe("study_list_observations");
    expect(observations.columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "id",
        "issuerCnpj",
        "text",
        "createdAt",
        "updatedAt",
      ]),
    );
    expect(observations.indexes.map(({ config }) => config.name)).toContain(
      "study_list_observations_entry_created_idx",
    );
    const reference = observations.foreignKeys[0]?.reference();
    expect(reference?.columns.map(({ name }) => name)).toEqual(["issuerCnpj"]);
    expect(reference?.foreignColumns.map(({ name }) => name)).toEqual([
      "issuerCnpj",
    ]);
    expect(observations.foreignKeys[0]?.onDelete).toBe("cascade");
  });
});
