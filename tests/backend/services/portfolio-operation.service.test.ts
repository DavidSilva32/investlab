import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("@/backend/repositories/portfolio-operation.repository", () => ({
  portfolioOperationRepository: repository,
}));

import { portfolioOperationService } from "@/backend/services/portfolio-operation.service";

const valid = {
  side: "BUY",
  effectiveDate: "2026-10-01",
  product: "Empresa Exemplo",
  assetCode: "EXMP3",
  quantity: "2",
  unitPrice: "10.25",
  currency: "BRL",
  fees: null,
};
const idempotencyKey = "58cde392-a188-41a6-88a7-6c2a4927025d";
const operation = { id: "ebbacdf2-dfd1-49e9-9fe6-2676c43a6c32", ...valid };
const movement = {
  id: "88f1a411-36af-4622-a59b-c9d2795cad8f",
  occurredAt: valid.effectiveDate,
  product: "Empresa Exemplo - EXMP3",
  assetCode: "EXMP3",
  quantity: "2",
  unitPrice: "10.25",
  operationValue: "20.50",
  direction: "CREDITO",
  movementType: "Compra",
};

beforeEach(() => vi.clearAllMocks());

describe("PortfolioOperationService", () => {
  it("lists operations, B3 sources, candidates and active links", async () => {
    repository.list.mockResolvedValue({
      operations: [operation],
      movements: [movement],
      events: [],
    });
    await expect(portfolioOperationService.list("r1")).resolves.toMatchObject({
      operations: [operation],
      movements: [movement],
      pendingMovements: [movement],
      candidates: [
        expect.objectContaining({
          operationId: operation.id,
          movementId: movement.id,
        }),
      ],
      links: [],
    });
  });

  it("keeps a changed reimport as pending beside the preserved historical link", async () => {
    const changed = {
      ...movement,
      id: "changed-row",
      unitPrice: "12",
      operationValue: "24",
    };
    repository.list.mockResolvedValue({
      operations: [operation],
      movements: [movement, changed],
      events: [
        { operationId: operation.id, movementId: movement.id, status: "LINK" },
      ],
    });
    await expect(portfolioOperationService.list("r1")).resolves.toMatchObject({
      links: [{ operationId: operation.id, movementId: movement.id }],
      pendingMovements: [changed],
      candidates: [],
      movements: [movement, changed],
    });
  });

  it("validates and creates an explicit manual operation", async () => {
    repository.create.mockResolvedValue(operation);
    await expect(
      portfolioOperationService.create(
        { ...valid, assetCode: "   " },
        idempotencyKey,
        "r1",
      ),
    ).resolves.toEqual(operation);
    expect(repository.create).toHaveBeenCalledWith(
      { ...valid, assetCode: null },
      idempotencyKey,
      "r1",
    );
  });

  it.each([
    [{ ...valid, side: "CREDIT" }],
    [{ ...valid, effectiveDate: "2026-02-31" }],
    [{ ...valid, product: " " }],
    [{ ...valid, quantity: "0" }],
    [{ ...valid, unitPrice: "0" }],
    [{ ...valid, currency: "BR" }],
    [{ ...valid, fees: "-1" }],
    [{ ...valid, unknown: true }],
  ])("rejects invalid manual operation input %#", async (input) => {
    await expect(
      portfolioOperationService.create(input, idempotencyKey),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid idempotency key before writing", async () => {
    await expect(
      portfolioOperationService.create(valid, "invalid"),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("confirms only a current candidate and verifies uniqueness before writing", async () => {
    repository.list.mockResolvedValue({
      operations: [operation],
      movements: [movement],
      events: [],
    });
    repository.reconcile.mockResolvedValue({ id: "event-1" });
    await expect(
      portfolioOperationService.reconcile(
        operation.id,
        { movementId: movement.id, action: "LINK" },
        "r1",
      ),
    ).resolves.toEqual({ id: "event-1" });
    expect(repository.reconcile).toHaveBeenCalledWith(
      operation.id,
      movement.id,
      "LINK",
      "r1",
    );
  });

  it("rejects a candidate that is no longer available", async () => {
    repository.list.mockResolvedValue({
      operations: [operation],
      movements: [],
      events: [],
    });
    await expect(
      portfolioOperationService.reconcile(
        operation.id,
        { movementId: movement.id, action: "LINK" },
        "r1",
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.reconcile).not.toHaveBeenCalled();
  });

  it("rejects an operation or movement already linked elsewhere", async () => {
    repository.list.mockResolvedValue({
      operations: [operation],
      movements: [
        movement,
        { ...movement, id: "c2d00d2f-9a71-4fa2-b7c7-39c6bcff2e22" },
      ],
      events: [
        {
          operationId: operation.id,
          movementId: "c2d00d2f-9a71-4fa2-b7c7-39c6bcff2e22",
          status: "LINK",
        },
      ],
    });
    await expect(
      portfolioOperationService.reconcile(
        operation.id,
        { movementId: movement.id, action: "LINK" },
        "r1",
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.reconcile).not.toHaveBeenCalled();
  });

  it("validates IDs and reconciliation payloads and delegates unlinking", async () => {
    await expect(
      portfolioOperationService.reconcile(
        "bad",
        { movementId: movement.id, action: "UNLINK" },
        "r1",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      portfolioOperationService.reconcile(
        operation.id,
        { movementId: "bad", action: "LINK" },
        "r1",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    repository.reconcile.mockResolvedValue({ id: "event-2" });
    await expect(
      portfolioOperationService.reconcile(
        operation.id,
        { movementId: movement.id, action: "UNLINK" },
        "r1",
      ),
    ).resolves.toEqual({ id: "event-2" });
    expect(repository.reconcile).toHaveBeenCalledWith(
      operation.id,
      movement.id,
      "UNLINK",
      "r1",
    );
  });
});
