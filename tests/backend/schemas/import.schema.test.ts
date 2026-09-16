import { describe, expect, it } from "vitest";

import { importFileSchema } from "@/backend/schemas/import.schema";

describe("importFileSchema", () => {
  const validFile = {
    name: "posicoes.xlsx",
    size: 1024,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };

  it("accepts a reasonably sized XLSX file", () => {
    expect(importFileSchema.parse(validFile)).toEqual(validFile);
  });

  it("rejects a non-XLSX extension", () => {
    expect(() =>
      importFileSchema.parse({ ...validFile, name: "posicoes.pdf" }),
    ).toThrow();
  });

  it("rejects an empty or oversized file", () => {
    expect(() => importFileSchema.parse({ ...validFile, size: 0 })).toThrow();
    expect(() =>
      importFileSchema.parse({ ...validFile, size: 5 * 1024 * 1024 + 1 }),
    ).toThrow();
  });
});
