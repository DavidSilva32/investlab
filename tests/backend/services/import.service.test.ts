import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/backend/services/b3-position-xlsx-parser", () => ({
  b3PositionXlsxParser: {
    parse: vi.fn(() => [{ product: "Ativo", quantity: "1" }]),
  },
}));

import { ApplicationError } from "@/backend/errors/application-error";
import { importService } from "@/backend/services/import.service";

describe("ImportService", () => {
  const file = {
    name: "b3.xlsx",
    size: 3,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("b3"),
  };

  it("creates a deterministic SHA-256 preview", () => {
    expect(importService.preview(file)).toEqual({
      hash: createHash("sha256").update(file.buffer).digest("hex"),
      positions: [{ product: "Ativo", quantity: "1" }],
    });
  });

  it("rejects duplicate confirmation", () => {
    expect(() => importService.assertCanBeConfirmed(true)).toThrow(
      ApplicationError,
    );
    expect(() => importService.assertCanBeConfirmed(false)).not.toThrow();
  });

  it("uses the SHA-256 hash to identify an identical file", () => {
    const sameFile = { ...file, buffer: Buffer.from("b3") };
    const otherFile = { ...file, buffer: Buffer.from("different") };
    expect(importService.preview(file).hash).toBe(
      importService.preview(sameFile).hash,
    );
    expect(importService.preview(file).hash).not.toBe(
      importService.preview(otherFile).hash,
    );
  });
});
