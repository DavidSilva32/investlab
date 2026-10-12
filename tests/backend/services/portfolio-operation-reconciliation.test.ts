import { describe, expect, it } from "vitest";
import {
  applyPortfolioOperationLinks,
  getPortfolioOperationCandidates,
  getUnlinkedPortfolioMovements,
} from "@/backend/services/portfolio-operation-reconciliation";

const operation = {
  id: "op-1",
  side: "BUY" as const,
  effectiveDate: "2026-10-01",
  product: "Empresa Exemplo",
  assetCode: "EXMP3",
  quantity: "2.0000",
  unitPrice: "10.25",
  currency: "BRL",
  fees: null,
};
const movement = {
  id: "movement-1",
  occurredAt: "2026-10-01",
  product: "Empresa Exemplo - EXMP3",
  assetCode: "EXMP3",
  quantity: "2",
  unitPrice: "10.30",
  operationValue: "20.60",
  direction: "CREDITO",
  movementType: "Compra",
};

describe("manual operation and B3 movement candidates", () => {
  it("offers exact date, identity and quantity matches for human review only", () => {
    expect(
      getPortfolioOperationCandidates([operation], [movement], []),
    ).toEqual([
      expect.objectContaining({
        operationId: operation.id,
        movementId: movement.id,
        monetaryValuesComparable: false,
        limitation: expect.stringContaining("não informa a moeda"),
        movement: expect.objectContaining({
          direction: "CREDITO",
          movementType: "Compra",
        }),
      }),
    ]);
  });

  it.each([
    ["different date", { ...movement, occurredAt: "2026-10-02" }],
    ["different code", { ...movement, assetCode: "EXMP4" }],
    [
      "different product without codes",
      { ...movement, product: "Outro", assetCode: null },
    ],
    ["different quantity", { ...movement, quantity: "3" }],
  ])("does not offer a candidate for %s", (_label, changedMovement) => {
    const withCodes =
      changedMovement.assetCode !== null
        ? changedMovement
        : { ...changedMovement, product: "Outro", assetCode: null };
    expect(
      getPortfolioOperationCandidates([operation], [withCodes], []),
    ).toEqual([]);
  });

  it("uses normalized product identity when an asset code is missing", () => {
    expect(
      getPortfolioOperationCandidates(
        [{ ...operation, assetCode: null, product: "  Empresa   Exemplo " }],
        [{ ...movement, assetCode: null, product: "empresa exemplo" }],
        [],
      ),
    ).toHaveLength(1);
  });

  it("normalizes scientific decimal quantities and keeps changed B3 rows as separate candidates", () => {
    expect(
      getPortfolioOperationCandidates(
        [{ ...operation, quantity: "0.0000001" }],
        [
          { ...movement, quantity: "1e-7", id: "movement-old" },
          {
            ...movement,
            quantity: "1e-7",
            unitPrice: "11",
            id: "movement-new",
          },
        ],
        [],
      ).map(({ movementId }) => movementId),
    ).toEqual(["movement-old", "movement-new"]);
  });

  it("does not equate a malformed quantity with a valid numeric quantity", () => {
    expect(
      getPortfolioOperationCandidates(
        [{ ...operation, quantity: "+2" }],
        [{ ...movement, quantity: "2" }],
        [],
      ),
    ).toEqual([]);
  });

  it("returns B3 movements without an active operation link as pending", () => {
    expect(
      getUnlinkedPortfolioMovements(
        [movement, { ...movement, id: "movement-2" }],
        [{ operationId: operation.id, movementId: movement.id }],
      ),
    ).toEqual([{ ...movement, id: "movement-2" }]);
  });

  it("excludes both sides after a confirmed link while preserving a separate candidate", () => {
    expect(
      getPortfolioOperationCandidates(
        [operation, { ...operation, id: "op-2" }],
        [movement, { ...movement, id: "movement-2" }],
        [{ operationId: operation.id, movementId: movement.id }],
      ),
    ).toEqual([
      expect.objectContaining({
        operationId: "op-2",
        movementId: "movement-2",
      }),
    ]);
  });

  it("keeps a prior B3 link and leaves a divergent reimport row pending", () => {
    const oldMovement = {
      ...movement,
      id: "original-movement",
      unitPrice: "10.25",
      operationValue: "20.50",
    };
    const reimportedMovement = {
      ...movement,
      id: "changed-reimport",
      unitPrice: "12.00",
      operationValue: "24.00",
    };
    const links = [{ operationId: operation.id, movementId: oldMovement.id }];

    expect(
      applyPortfolioOperationLinks([{ ...links[0]!, status: "LINK" }]),
    ).toEqual(links);
    expect(
      getPortfolioOperationCandidates(
        [operation],
        [oldMovement, reimportedMovement],
        links,
      ),
    ).toEqual([]);
    expect(
      getUnlinkedPortfolioMovements([oldMovement, reimportedMovement], links),
    ).toEqual([reimportedMovement]);
    expect([oldMovement, reimportedMovement]).toHaveLength(2);
  });
});

describe("operation link history", () => {
  it("replays link and unlink events without erasing the source records", () => {
    expect(
      applyPortfolioOperationLinks([
        { operationId: "op-1", movementId: "movement-1", status: "LINK" },
        { operationId: "op-3", movementId: "movement-3", status: "LINK" },
        { operationId: "op-3", movementId: "movement-3", status: "UNLINK" },
        { operationId: "op-1", movementId: "movement-2", status: "UNLINK" },
        { operationId: "op-2", movementId: "movement-2", status: "LINK" },
      ]),
    ).toEqual([
      { operationId: "op-1", movementId: "movement-1" },
      { operationId: "op-2", movementId: "movement-2" },
    ]);
  });
});
