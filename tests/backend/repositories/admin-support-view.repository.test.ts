import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));

import { AdminSupportViewRepository } from "@/backend/repositories/admin-support-view.repository";

function selectBuilder(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit, orderBy });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, limit, orderBy };
}

describe("AdminSupportViewRepository", () => {
  const repository = new AdminSupportViewRepository();

  beforeEach(() => vi.clearAllMocks());

  it("lists only active USER targets after confirming the actor is an active admin", async () => {
    const actor = selectBuilder([{ id: "admin-1" }]);
    const targets = selectBuilder([
      { id: "customer-1", name: "Marcos", email: "m@example.com" },
    ]);
    database.select.mockReturnValueOnce(actor).mockReturnValueOnce(targets);

    await expect(repository.listTargets("admin-1")).resolves.toEqual({
      kind: "listed",
      targets: [{ id: "customer-1", name: "Marcos", email: "m@example.com" }],
    });
    expect(actor.limit).toHaveBeenCalledWith(1);
    expect(targets.orderBy).toHaveBeenCalledOnce();
  });

  it("does not list targets when the actor is no longer an active admin", async () => {
    database.select.mockReturnValueOnce(selectBuilder([]));
    await expect(repository.listTargets("user-1")).resolves.toEqual({
      kind: "actor-not-authorized",
    });
    expect(database.select).toHaveBeenCalledOnce();
  });

  it("returns only an active USER target for the active ADMIN actor", async () => {
    database.select
      .mockReturnValueOnce(selectBuilder([{ id: "admin-1" }]))
      .mockReturnValueOnce(
        selectBuilder([
          { id: "customer-1", name: "Marcos", email: "m@example.com" },
        ]),
      );
    await expect(
      repository.getActiveTarget("admin-1", "customer-1"),
    ).resolves.toEqual({
      kind: "found",
      target: { id: "customer-1", name: "Marcos", email: "m@example.com" },
    });
  });

  it("rejects inactive/non-admin actors and missing, disabled, or admin targets", async () => {
    database.select.mockReturnValueOnce(selectBuilder([]));
    await expect(
      repository.getActiveTarget("disabled-admin", "customer-1"),
    ).resolves.toEqual({ kind: "actor-not-authorized" });

    database.select
      .mockReturnValueOnce(selectBuilder([{ id: "admin-1" }]))
      .mockReturnValueOnce(selectBuilder([]));
    await expect(
      repository.getActiveTarget("admin-1", "disabled-user"),
    ).resolves.toEqual({ kind: "target-not-found" });
  });
});
