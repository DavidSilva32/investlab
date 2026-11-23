import { describe, expect, it } from "vitest";
import { financialEntryRelationSchema } from "@/backend/schemas/financial-entry-relation.schema";

const ids = {
  entry: "11111111-1111-4111-8111-111111111111",
  related: "22222222-2222-4222-8222-222222222222",
};

describe("financialEntryRelationSchema", () => {
  it.each(["TRANSFER", "REVERSAL"] as const)(
    "accepts a %s relation between different entries",
    (kind) => {
      expect(
        financialEntryRelationSchema.parse({
          kind,
          entryId: ids.entry,
          relatedEntryId: ids.related,
        }),
      ).toEqual({ kind, entryId: ids.entry, relatedEntryId: ids.related });
    },
  );

  it("accepts an explicit reversal dismissal with only an entry", () => {
    expect(
      financialEntryRelationSchema.parse({
        kind: "REVERSAL_DISMISSED",
        entryId: ids.entry,
      }),
    ).toEqual({ kind: "REVERSAL_DISMISSED", entryId: ids.entry });
  });

  it.each([
    { kind: "TRANSFER", entryId: ids.entry, relatedEntryId: ids.entry },
    {
      kind: "REVERSAL_DISMISSED",
      entryId: ids.entry,
      relatedEntryId: ids.related,
    },
    { kind: "REVERSAL", entryId: "invalid", relatedEntryId: ids.related },
  ])("rejects invalid relation data %#", (input) => {
    expect(financialEntryRelationSchema.safeParse(input).success).toBe(false);
  });
});
