import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const database = vi.hoisted(() => ({ select: vi.fn(), transaction: vi.fn() }));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));

import { PrivacyCenterRepository } from "@/backend/repositories/privacy-center.repository";

describe("PrivacyCenterRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only the requesting user's acceptance history newest first", async () => {
    const rows = [
      { termsVersion: "2026-10-17", acceptedAt: new Date("2026-10-17") },
    ];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });
    const repository = new PrivacyCenterRepository();

    await expect(repository.listTermsAcceptances("user-1")).resolves.toEqual(
      rows,
    );
    expect(database.select).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toContain(
      "user-1",
    );
    expect(orderBy).toHaveBeenCalledOnce();
  });

  it("checks only the exact user and Terms version", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "acceptance-1" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    const repository = new PrivacyCenterRepository();
    await expect(
      repository.hasTermsAcceptance("user-1", "terms-v2"),
    ).resolves.toBe(true);

    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.params).toContain("user-1");
    expect(query.params).toContain("terms-v2");
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("records one acceptance for a version and reuses an existing record", async () => {
    const timestamp = new Date("2026-10-19T12:00:00.000Z");
    const execute = vi.fn();
    const insertReturning = vi
      .fn()
      .mockResolvedValue([{ termsVersion: "terms-v2", acceptedAt: timestamp }]);
    const values = vi.fn().mockReturnValue({ returning: insertReturning });
    const insert = vi.fn().mockReturnValue({ values });
    const limit = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "existing" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const transaction = { execute, select: vi.fn(() => ({ from })), insert };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    const repository = new PrivacyCenterRepository();
    await expect(
      repository.recordTermsAcceptance("user-1", "terms-v2"),
    ).resolves.toEqual({
      recorded: true,
      acceptance: { termsVersion: "terms-v2", acceptedAt: timestamp },
    });
    await expect(
      repository.recordTermsAcceptance("user-1", "terms-v2"),
    ).resolves.toEqual({ recorded: false });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith({
      userId: "user-1",
      termsVersion: "terms-v2",
    });
  });
});
