import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  delete: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));

import { AuthRepository } from "@/backend/repositories/auth.repository";
import {
  authUsers,
  authInvitations,
  authPasswordResets,
  authTermsAcceptances,
  authVerifications,
  positionItems,
  positionSnapshots,
  imports,
  movementItems,
  oauthClients,
  tradingItems,
} from "@/infrastructure/database/schema";

const repository = new AuthRepository();

const createUpdateQuery = (rows: unknown[]) => {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { set, where, returning };
};

describe("AuthRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks all rate-limit keys atomically and returns no delay under the limit", async () => {
    const cleanupWhere = vi.fn().mockResolvedValue(undefined);
    const cleanup = vi.fn().mockReturnValue({ where: cleanupWhere });
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ count: 1, lastRequest: 1000 }])
      .mockResolvedValueOnce([{ count: 2, lastRequest: 1000 }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    const transaction = { delete: cleanup, insert };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      repository.checkAuthenticationRateLimits({
        keys: [
          { key: "email:one", maximum: 3 },
          { key: "ip:one", maximum: 5 },
        ],
        now: 1000,
        windowMs: 60_000,
      }),
    ).resolves.toBeNull();

    expect(database.transaction).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(cleanupWhere).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledTimes(2);
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(2);
    expect(returning).toHaveBeenCalledTimes(2);
  });

  it("returns the greatest retry delay when a rate limit is exceeded", async () => {
    const cleanup = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ count: 4, lastRequest: 1000 }])
      .mockResolvedValueOnce([{ count: 8, lastRequest: 2000 }]);
    const transaction = {
      delete: cleanup,
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(() => ({ returning })),
        })),
      })),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      repository.checkAuthenticationRateLimits({
        keys: [
          { key: "email:one", maximum: 3 },
          { key: "ip:one", maximum: 5 },
        ],
        now: 10_000,
        windowMs: 60_000,
      }),
    ).resolves.toBe(52);
  });

  it("creates an invitation and returns its identifier", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "invite-1" }]);
    const values = vi.fn().mockReturnValue({ returning });
    database.insert.mockReturnValue({ values });
    const input = {
      email: "person@example.com",
      tokenHash: "hashed-token",
      expiresAt: new Date("2026-11-01T00:00:00Z"),
      createdByUserId: "admin-1",
    };

    await expect(repository.createInvitation(input)).resolves.toEqual({
      id: "invite-1",
    });
    expect(values).toHaveBeenCalledWith(input);
  });

  it("lists users, invitations, and password resets with descending creation order", async () => {
    const userRows = [{ id: "user-1", email: "person@example.com" }];
    const invitationRows = [{ id: "invite-1", usedAt: null }];
    const resetRows = [{ id: "reset-1", email: "person@example.com" }];
    const userOrderBy = vi.fn().mockResolvedValue(userRows);
    const invitationOrderBy = vi.fn().mockResolvedValue(invitationRows);
    const resetOrderBy = vi.fn().mockResolvedValue(resetRows);
    const innerJoin = vi.fn().mockReturnValue({ orderBy: resetOrderBy });
    const from = vi
      .fn()
      .mockReturnValueOnce({ orderBy: userOrderBy })
      .mockReturnValueOnce({ orderBy: invitationOrderBy })
      .mockReturnValueOnce({ innerJoin });
    database.select.mockReturnValue({ from });

    await expect(repository.listUsers()).resolves.toEqual(userRows);
    await expect(repository.listInvitations()).resolves.toEqual(invitationRows);
    await expect(repository.listPasswordResets()).resolves.toEqual(resetRows);
    expect(database.select).toHaveBeenCalledTimes(3);
    expect(innerJoin).toHaveBeenCalledOnce();
    expect(userOrderBy).toHaveBeenCalledOnce();
    expect(invitationOrderBy).toHaveBeenCalledOnce();
    expect(resetOrderBy).toHaveBeenCalledOnce();
  });

  it("updates a profile with an optional phone and returns the saved user", async () => {
    const user = { name: "Ana Souza", phone: "11987654321" };
    const query = createUpdateQuery([user]);
    database.update.mockReturnValue({ set: query.set });

    await expect(
      repository.updateOwnProfile({
        id: "user-1",
        name: "Ana Souza",
        phone: "11987654321",
      }),
    ).resolves.toEqual(user);
    expect(query.set).toHaveBeenCalledWith({
      name: "Ana Souza",
      phone: "11987654321",
      updatedAt: expect.any(Date),
    });
  });

  it("omits an unspecified phone and returns null when the user is missing", async () => {
    const query = createUpdateQuery([]);
    database.update.mockReturnValue({ set: query.set });

    await expect(
      repository.updateOwnProfile({ id: "user-1", name: "Ana Souza" }),
    ).resolves.toBeNull();
    expect(query.set).toHaveBeenCalledWith({
      name: "Ana Souza",
      updatedAt: expect.any(Date),
    });
  });

  it("returns login eligibility for an existing user and null for an unknown email", async () => {
    const limit = vi
      .fn()
      .mockResolvedValueOnce([{ id: "user-1", accountStatus: "ACTIVE" }])
      .mockResolvedValueOnce([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    await expect(
      repository.getLoginEligibility("person@example.com"),
    ).resolves.toEqual({ id: "user-1", accountStatus: "ACTIVE" });
    await expect(
      repository.getLoginEligibility("missing@example.com"),
    ).resolves.toBeNull();
    expect(limit).toHaveBeenCalledWith(1);
    expect(where).toHaveBeenCalledTimes(2);
  });

  it("records first and most recent successful login only for active users", async () => {
    const updateQuery = createUpdateQuery([{ id: "user-1" }]);
    const transaction = {
      update: vi.fn().mockReturnValue(updateQuery),
      select: vi.fn(),
      delete: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      repository.recordSuccessfulLogin("user@example.com"),
    ).resolves.toBe(true);
    expect(updateQuery.set).toHaveBeenCalledWith(
      expect.objectContaining({
        accountStatus: "ACTIVE",
        lastLoginAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it("clears sessions when a concurrent deactivation prevents login recording", async () => {
    const updateQuery = createUpdateQuery([]);
    const sessionDeleteWhere = vi.fn().mockResolvedValue(undefined);
    const sessionDelete = vi
      .fn()
      .mockReturnValue({ where: sessionDeleteWhere });
    const selectLimit = vi.fn().mockResolvedValue([{ id: "user-1" }]);
    const transaction = {
      update: vi.fn().mockReturnValue(updateQuery),
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit: selectLimit })) })),
      })),
      delete: sessionDelete,
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      repository.recordSuccessfulLogin("user@example.com"),
    ).resolves.toBe(false);
    expect(sessionDelete).toHaveBeenCalledOnce();
    expect(sessionDeleteWhere).toHaveBeenCalledOnce();
  });

  it("rejects login recording if the account was deleted concurrently", async () => {
    const updateQuery = createUpdateQuery([]);
    const selectLimit = vi.fn().mockResolvedValue([]);
    const transaction = {
      update: vi.fn().mockReturnValue(updateQuery),
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit: selectLimit })) })),
      })),
      delete: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      repository.recordSuccessfulLogin("deleted@example.com"),
    ).resolves.toBe(false);
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it("returns not found when a managed account no longer exists", async () => {
    const targetLimit = vi.fn().mockResolvedValue([]);
    const targetFor = vi.fn().mockReturnValue({ limit: targetLimit });
    const targetWhere = vi.fn().mockReturnValue({ for: targetFor });
    const targetFrom = vi.fn().mockReturnValue({ where: targetWhere });
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({ from: targetFrom })),
      update: vi.fn(),
      delete: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      repository.updateManagedUser({
        id: "deleted-user",
        actorId: "admin-1",
        name: "New name",
      }),
    ).resolves.toEqual({ kind: "not-found" });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it("allows editing and demoting an administrator while another active admin remains", async () => {
    const targetLimit = vi
      .fn()
      .mockResolvedValue([
        { id: "admin-2", role: "ADMIN", accountStatus: "ACTIVE" },
      ]);
    const targetFor = vi.fn().mockReturnValue({ limit: targetLimit });
    const targetWhere = vi.fn().mockReturnValue({ for: targetFor });
    const targetFrom = vi.fn().mockReturnValue({ where: targetWhere });
    const countWhere = vi.fn().mockResolvedValue([{ total: 2 }]);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });
    const updateQuery = createUpdateQuery([{ id: "admin-2" }]);
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce({ from: targetFrom })
        .mockReturnValueOnce({ from: countFrom }),
      update: vi.fn().mockReturnValue(updateQuery),
      delete: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      repository.updateManagedUser({
        id: "admin-2",
        actorId: "admin-1",
        name: "Updated name",
        role: "USER",
        isActive: true,
      }),
    ).resolves.toEqual({ kind: "updated" });
    expect(updateQuery.set).toHaveBeenCalledWith({
      name: "Updated name",
      role: "USER",
      accountStatus: "ACTIVE",
      updatedAt: expect.any(Date),
    });
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it("returns not found if a managed account disappears before its update", async () => {
    const targetLimit = vi.fn().mockResolvedValue([
      {
        id: "user-1",
        email: "person@example.com",
        role: "USER",
        accountStatus: "ACTIVE",
      },
    ]);
    const targetFor = vi.fn().mockReturnValue({ limit: targetLimit });
    const targetWhere = vi.fn().mockReturnValue({ for: targetFor });
    const targetFrom = vi.fn().mockReturnValue({ where: targetWhere });
    const updateQuery = createUpdateQuery([]);
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({ from: targetFrom })),
      update: vi.fn().mockReturnValue(updateQuery),
      delete: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      repository.updateManagedUser({
        id: "user-1",
        actorId: "admin-1",
        name: "Updated name",
      }),
    ).resolves.toEqual({ kind: "not-found" });
    expect(updateQuery.set).toHaveBeenCalledWith({
      updatedAt: expect.any(Date),
      name: "Updated name",
    });
  });

  it("serializes lifecycle changes and deletes sessions when deactivating a user", async () => {
    const userLimit = vi
      .fn()
      .mockResolvedValue([
        { id: "user-1", role: "USER", accountStatus: "PENDING" },
      ]);
    const userForUpdate = vi.fn().mockReturnValue({ limit: userLimit });
    const userWhere = vi.fn().mockReturnValue({ for: userForUpdate });
    const userFrom = vi.fn().mockReturnValue({ where: userWhere });
    const updateQuery = createUpdateQuery([{ id: "user-1" }]);
    const sessionDeleteWhere = vi.fn().mockResolvedValue(undefined);
    const sessionDelete = vi
      .fn()
      .mockReturnValue({ where: sessionDeleteWhere });
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({ from: userFrom })),
      update: vi.fn().mockReturnValue(updateQuery),
      delete: sessionDelete,
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      repository.updateManagedUser({
        id: "user-1",
        actorId: "admin-1",
        isActive: false,
      }),
    ).resolves.toEqual({ kind: "updated" });
    expect(transaction.execute).toHaveBeenCalledOnce();
    expect(userForUpdate).toHaveBeenCalledWith("update");
    expect(updateQuery.set).toHaveBeenCalledWith({
      accountStatus: "DISABLED",
      updatedAt: expect.any(Date),
    });
    expect(sessionDelete).toHaveBeenCalledOnce();
    expect(sessionDeleteWhere).toHaveBeenCalledOnce();
  });

  it("prevents self-deactivation and removal of the last active administrator", async () => {
    const makeTransaction = (target: unknown, activeAdmins = 0) => {
      const targetLimit = vi.fn().mockResolvedValue([target]);
      const targetFor = vi.fn().mockReturnValue({ limit: targetLimit });
      const targetWhere = vi.fn().mockReturnValue({ for: targetFor });
      const targetFrom = vi.fn().mockReturnValue({ where: targetWhere });
      const countWhere = vi.fn().mockResolvedValue([{ total: activeAdmins }]);
      const countFrom = vi.fn().mockReturnValue({ where: countWhere });
      const select = vi
        .fn()
        .mockReturnValueOnce({ from: targetFrom })
        .mockReturnValue({ from: countFrom });
      return {
        execute: vi.fn().mockResolvedValue(undefined),
        update: vi.fn(),
        select,
        delete: vi.fn(),
      };
    };
    const selfUpdateTransaction = makeTransaction({
      id: "admin-1",
      role: "ADMIN",
      accountStatus: "ACTIVE",
    });
    const lastAdminTransaction = makeTransaction(
      { id: "admin-1", role: "ADMIN", accountStatus: "ACTIVE" },
      1,
    );
    database.transaction
      .mockImplementationOnce(async (callback) =>
        callback(selfUpdateTransaction),
      )
      .mockImplementationOnce(async (callback) =>
        callback(lastAdminTransaction),
      );

    await expect(
      repository.updateManagedUser({
        id: "admin-1",
        actorId: "admin-1",
        isActive: false,
      }),
    ).resolves.toEqual({ kind: "self-deactivation" });
    await expect(
      repository.updateManagedUser({
        id: "admin-1",
        actorId: "admin-2",
        role: "USER",
      }),
    ).resolves.toEqual({ kind: "last-admin" });
    expect(selfUpdateTransaction.execute).toHaveBeenCalledOnce();
    expect(lastAdminTransaction.execute).toHaveBeenCalledOnce();
    expect(selfUpdateTransaction.update).not.toHaveBeenCalled();
    expect(lastAdminTransaction.update).not.toHaveBeenCalled();
  });

  it("extends beta access only to a later date while holding the user lock", async () => {
    const limit = vi.fn().mockResolvedValue([
      {
        id: "user-1",
        role: "USER",
        accountStatus: "ACTIVE",
        betaExpiresAt: new Date("2026-11-01T00:00:00.000Z"),
      },
    ]);
    const forUpdate = vi.fn().mockReturnValue({ limit });
    const userWhere = vi.fn().mockReturnValue({ for: forUpdate });
    const from = vi.fn().mockReturnValue({ where: userWhere });
    const updateQuery = createUpdateQuery([{ id: "user-1" }]);
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({ from })),
      update: vi.fn().mockReturnValue(updateQuery),
      delete: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    const laterDate = new Date("2026-12-01T00:00:00.000Z");
    await expect(
      repository.updateManagedUser({
        id: "user-1",
        actorId: "admin-1",
        betaExpiresAt: laterDate,
      }),
    ).resolves.toEqual({ kind: "updated" });
    expect(updateQuery.set).toHaveBeenCalledWith({
      betaExpiresAt: laterDate,
      updatedAt: expect.any(Date),
    });
  });

  it("deletes user-owned history in dependency order inside one transaction", async () => {
    const targetLimit = vi
      .fn()
      .mockResolvedValue([
        { id: "user-1", role: "USER", accountStatus: "ACTIVE" },
      ]);
    const targetFor = vi.fn().mockReturnValue({ limit: targetLimit });
    const targetWhere = vi.fn().mockReturnValue({ for: targetFor });
    const targetFrom = vi.fn().mockReturnValue({ where: targetWhere });
    const returning = vi.fn().mockResolvedValue([{ id: "user-1" }]);
    const deleteWhere = vi.fn().mockReturnValue({ returning });
    const deleteQuery = vi.fn().mockReturnValue({ where: deleteWhere });
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({ from: targetFrom })),
      delete: deleteQuery,
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      repository.deleteManagedUser({ id: "user-1", actorId: "admin-1" }),
    ).resolves.toEqual({ kind: "deleted" });
    expect(deleteQuery.mock.calls.map(([table]) => table)).toEqual([
      positionItems,
      positionSnapshots,
      movementItems,
      tradingItems,
      imports,
      authTermsAcceptances,
      authVerifications,
      authInvitations,
      authPasswordResets,
      oauthClients,
      authUsers,
    ]);
    expect(transaction.execute).toHaveBeenCalledTimes(6);
    expect(database.transaction).toHaveBeenCalledOnce();
  });

  it("prevents deleting the current user and the last active administrator", async () => {
    const makeTransaction = (target: unknown, activeAdmins = 0) => {
      const targetLimit = vi.fn().mockResolvedValue([target]);
      const targetFor = vi.fn().mockReturnValue({ limit: targetLimit });
      const targetWhere = vi.fn().mockReturnValue({ for: targetFor });
      const targetFrom = vi.fn().mockReturnValue({ where: targetWhere });
      const countWhere = vi.fn().mockResolvedValue([{ total: activeAdmins }]);
      const countFrom = vi.fn().mockReturnValue({ where: countWhere });
      const select = vi
        .fn()
        .mockReturnValueOnce({ from: targetFrom })
        .mockReturnValue({ from: countFrom });
      return {
        execute: vi.fn().mockResolvedValue(undefined),
        select,
        delete: vi.fn(),
      };
    };
    const selfTransaction = makeTransaction({
      id: "admin-1",
      role: "ADMIN",
      accountStatus: "ACTIVE",
    });
    database.transaction.mockImplementationOnce(async (callback) =>
      callback(selfTransaction),
    );
    await expect(
      repository.deleteManagedUser({ id: "admin-1", actorId: "admin-1" }),
    ).resolves.toEqual({ kind: "self-delete" });
    expect(selfTransaction.delete).not.toHaveBeenCalled();

    const lastAdminTransaction = makeTransaction(
      { id: "admin-1", role: "ADMIN", accountStatus: "ACTIVE" },
      1,
    );
    database.transaction.mockImplementationOnce(async (callback) =>
      callback(lastAdminTransaction),
    );
    await expect(
      repository.deleteManagedUser({ id: "admin-1", actorId: "other-admin" }),
    ).resolves.toEqual({ kind: "last-admin" });
    expect(lastAdminTransaction.delete).not.toHaveBeenCalled();
  });

  it.each([
    ["password reset", "revokePasswordReset"],
    ["invitation", "revokeInvitation"],
  ] as const)("revokes an active %s", async (_label, method) => {
    const query = createUpdateQuery([{ id: "record-1" }]);
    database.update.mockReturnValue(query);

    await expect(repository[method]("record-1")).resolves.toBe(true);
    expect(query.set).toHaveBeenCalledWith({ revokedAt: expect.any(Date) });
    expect(query.where).toHaveBeenCalledOnce();
  });

  it.each([
    ["password reset", "revokePasswordReset"],
    ["invitation", "revokeInvitation"],
  ] as const)(
    "returns false when a %s cannot be revoked",
    async (_label, method) => {
      database.update.mockReturnValue(createUpdateQuery([]));

      await expect(repository[method]("record-1")).resolves.toBe(false);
    },
  );

  it("claims the invitation and inserts the Better Auth credential and terms event in one transaction", async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ email: "bound@example.com" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const insertValues: unknown[] = [];
    const transaction = {
      update: vi.fn().mockReturnValue({ set }),
      insert: vi.fn(() => ({
        values: vi.fn((value) => {
          insertValues.push(value);
          return Promise.resolve();
        }),
      })),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      repository.activateInvitation({
        tokenHash: "hashed-token",
        name: "Invitee",
        passwordHash: "better-auth-compatible-password-hash",
        termsVersion: "2026-10-17",
      }),
    ).resolves.toBe(true);

    expect(database.transaction).toHaveBeenCalledOnce();
    expect(transaction.update).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith({ usedAt: expect.any(Date) });
    expect(transaction.insert).toHaveBeenCalledTimes(3);
    expect(insertValues[0]).toEqual(
      expect.objectContaining({
        name: "Invitee",
        email: "bound@example.com",
        emailVerified: false,
        role: "USER",
        accountStatus: "PENDING",
      }),
    );
    expect(insertValues[1]).toEqual(
      expect.objectContaining({
        accountId: expect.any(String),
        providerId: "credential",
        password: "better-auth-compatible-password-hash",
      }),
    );
    expect(insertValues[2]).toEqual(
      expect.objectContaining({
        userId: expect.any(String),
        termsVersion: "2026-10-17",
        acceptedAt: expect.any(Date),
      }),
    );
    expect((insertValues[1] as { userId: string }).userId).toBe(
      (insertValues[0] as { id: string }).id,
    );
    expect((insertValues[2] as { userId: string }).userId).toBe(
      (insertValues[0] as { id: string }).id,
    );
  });

  it("does not create account or acceptance records if the invite was already used", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const transaction = {
      update: vi.fn().mockReturnValue({ set }),
      insert: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      repository.activateInvitation({
        tokenHash: "spent-token",
        name: "Invitee",
        passwordHash: "hash",
        termsVersion: "2026-10-17",
      }),
    ).resolves.toBe(false);
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("propagates an acceptance insert failure so the invitation transaction can roll back", async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ email: "bound@example.com" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const rollback = vi.fn();
    let insertCount = 0;
    const transaction = {
      update: vi.fn().mockReturnValue({ set }),
      insert: vi.fn(() => ({
        values: vi.fn(() => {
          insertCount += 1;
          return insertCount === 3
            ? Promise.reject(new Error("acceptance insert failed"))
            : Promise.resolve();
        }),
      })),
    };
    database.transaction.mockImplementation(async (callback) => {
      try {
        return await callback(transaction);
      } catch (error) {
        rollback();
        throw error;
      }
    });

    await expect(
      repository.activateInvitation({
        tokenHash: "hashed-token",
        name: "Invitee",
        passwordHash: "password-hash",
        termsVersion: "approved-2026-10-20.1",
      }),
    ).rejects.toThrow("acceptance insert failed");

    expect(database.transaction).toHaveBeenCalledOnce();
    expect(transaction.insert).toHaveBeenCalledTimes(3);
    expect(rollback).toHaveBeenCalledOnce();
  });

  it("finds a user by email and returns null when none exists", async () => {
    const limit = vi
      .fn()
      .mockResolvedValueOnce([{ id: "user-1", email: "person@example.com" }])
      .mockResolvedValueOnce([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    await expect(
      repository.findUserByEmail("person@example.com"),
    ).resolves.toEqual({
      id: "user-1",
      email: "person@example.com",
    });
    await expect(
      repository.findUserByEmail("missing@example.com"),
    ).resolves.toBe(null);
    expect(limit).toHaveBeenCalledWith(1);
    expect(where).toHaveBeenCalledTimes(2);
  });

  it("creates a password reset and returns its identifier", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "reset-1" }]);
    const values = vi.fn().mockReturnValue({ returning });
    database.insert.mockReturnValue({ values });
    const input = {
      userId: "user-1",
      tokenHash: "reset-hash",
      expiresAt: new Date("2026-11-01T00:00:00Z"),
      createdByUserId: "admin-1",
    };

    await expect(repository.createPasswordReset(input)).resolves.toEqual({
      id: "reset-1",
    });
    expect(values).toHaveBeenCalledWith(input);
  });

  it("applies a password reset and invalidates the credential account and sessions", async () => {
    const resetQuery = createUpdateQuery([{ userId: "user-1" }]);
    const accountQuery = createUpdateQuery([]);
    const sessionWhere = vi.fn().mockResolvedValue(undefined);
    const sessionDelete = vi.fn().mockReturnValue({ where: sessionWhere });
    const update = vi
      .fn()
      .mockReturnValueOnce(resetQuery)
      .mockReturnValueOnce(accountQuery);
    const transaction = { update, delete: sessionDelete };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      repository.applyPasswordReset("reset-hash", "new-password-hash"),
    ).resolves.toBe(true);
    expect(resetQuery.set).toHaveBeenCalledWith({ usedAt: expect.any(Date) });
    expect(accountQuery.set).toHaveBeenCalledWith({
      password: "new-password-hash",
      updatedAt: expect.any(Date),
    });
    expect(accountQuery.where).toHaveBeenCalledOnce();
    expect(sessionDelete).toHaveBeenCalledOnce();
    expect(sessionWhere).toHaveBeenCalledOnce();
  });

  it("does not update credentials or sessions for an invalid reset token", async () => {
    const resetQuery = createUpdateQuery([]);
    const update = vi.fn().mockReturnValue(resetQuery);
    const transaction = { update, delete: vi.fn() };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      repository.applyPasswordReset("expired-hash", "new-password-hash"),
    ).resolves.toBe(false);
    expect(update).toHaveBeenCalledOnce();
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it("promotes the legacy user and assigns unowned historical data atomically", async () => {
    const promotionReturning = vi
      .fn()
      .mockResolvedValue([{ id: "admin-1", role: "ADMIN" }]);
    const promotionWhere = vi.fn().mockReturnValue({
      returning: promotionReturning,
    });
    const promotionSet = vi.fn().mockReturnValue({ where: promotionWhere });
    const updatedTables: Array<{ id?: string; userId?: string }> = [];
    const backfillWhere = vi.fn(async () => undefined);
    const backfillSet = vi.fn((values: { id?: string; userId?: string }) => {
      updatedTables.push(values);
      return { where: backfillWhere };
    });
    const update = vi
      .fn()
      .mockReturnValueOnce({ set: promotionSet })
      .mockImplementation(() => ({ set: backfillSet }));
    const transaction = { update };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      repository.promoteLegacyAdmin("admin@example.com"),
    ).resolves.toEqual({ id: "admin-1" });
    expect(database.transaction).toHaveBeenCalledOnce();
    expect(promotionSet).toHaveBeenCalledWith({
      role: "ADMIN",
      updatedAt: expect.any(Date),
    });
    expect(promotionWhere).toHaveBeenCalledOnce();
    expect(updatedTables).toHaveLength(26);
    expect(
      updatedTables.slice(0, 22).every((value) => value.userId === "admin-1"),
    ).toBe(true);
    expect(
      updatedTables.slice(22).every((value) => value.id === "admin-1"),
    ).toBe(true);
    expect(backfillWhere).toHaveBeenCalledTimes(26);
  });

  it("does not backfill when no legacy administrator exists", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    database.transaction.mockImplementation(async (callback) =>
      callback({ update }),
    );

    await expect(
      repository.promoteLegacyAdmin("missing@example.com"),
    ).resolves.toBeNull();
    expect(update).toHaveBeenCalledOnce();
  });

  it("reports whether any user exists", async () => {
    const limit = vi
      .fn()
      .mockResolvedValueOnce([{ id: "user-1" }])
      .mockResolvedValueOnce([]);
    const from = vi.fn().mockReturnValue({ limit });
    database.select.mockReturnValue({ from });

    await expect(repository.hasAnyUser()).resolves.toBe(true);
    await expect(repository.hasAnyUser()).resolves.toBe(false);
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("checks whether an invitation remains unused and unexpired", async () => {
    const limit = vi
      .fn()
      .mockResolvedValueOnce([{ id: "invite-1" }])
      .mockResolvedValueOnce([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    await expect(
      repository.claimInvitationExistsUnused("fresh-hash"),
    ).resolves.toBe(true);
    await expect(
      repository.claimInvitationExistsUnused("spent-hash"),
    ).resolves.toBe(false);
    expect(limit).toHaveBeenCalledWith(1);
    expect(where).toHaveBeenCalledTimes(2);
  });
});
