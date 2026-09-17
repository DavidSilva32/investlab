import { describe, expect, it } from "vitest";
import {
  createB3MovementFingerprint,
  prepareB3MovementForPersistence,
} from "@/backend/services/b3-movement-fingerprint";

const movement = {
  direction: "CREDITO" as const,
  occurredAt: "2026-09-11",
  movementType: " Aplicação ",
  product: " CDB - Banco Inter ",
  assetCode: null,
  institution: null,
  quantity: "001.2300",
  unitPrice: "0.0100",
  operationValue: null,
};

describe("B3 movement fingerprint", () => {
  it("is stable for the same event despite display-only formatting", () => {
    const equivalent = {
      ...movement,
      movementType: "APLICAÇÃO",
      product: "cdb - banco inter",
      quantity: "1.23",
      unitPrice: "0.01",
    };

    expect(createB3MovementFingerprint(movement)).toBe(
      createB3MovementFingerprint(equivalent),
    );
    expect(prepareB3MovementForPersistence(movement)).toEqual({
      ...movement,
      eventFingerprint: createB3MovementFingerprint(movement),
    });
  });

  it("changes when a field that identifies the event changes", () => {
    expect(createB3MovementFingerprint(movement)).not.toBe(
      createB3MovementFingerprint({ ...movement, operationValue: "10" }),
    );
    expect(createB3MovementFingerprint(movement)).not.toBe(
      createB3MovementFingerprint({ ...movement, quantity: "" }),
    );
  });
});
