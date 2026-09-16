import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/backend/services/b3-position-xlsx-parser", () => ({
  parseB3PositionXlsx: vi.fn(() => [{ product: "Ativo", quantity: "1" }]),
}));

import { ApplicationError } from "@/backend/errors/application-error";
import {
  assertImportCanBeConfirmed,
  previewImport,
} from "@/backend/services/import.service";

describe("import service", () => {
  const file = {
    name: "b3.xlsx",
    size: 3,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("b3"),
  };

  it("creates a deterministic SHA-256 preview", () => {
    expect(previewImport(file)).toEqual({
      hash: createHash("sha256").update(file.buffer).digest("hex"),
      positions: [{ product: "Ativo", quantity: "1" }],
    });
  });

  it("rejects duplicate confirmation", () => {
    expect(() => assertImportCanBeConfirmed(true)).toThrow(ApplicationError);
    expect(() => assertImportCanBeConfirmed(false)).not.toThrow();
  });
});
