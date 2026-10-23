import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { getTableName } from "drizzle-orm";
import { runWithDataOwner } from "@/infrastructure/auth/data-owner-context";

const database = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));

import { BillingRepository } from "@/backend/repositories/billing.repository";
import { billingWebhookEvents } from "@/infrastructure/database/schema";

function settled<T>(value: T) {
  const promise = Promise.resolve(value);
  return { then: promise.then.bind(promise) };
}

function transactionMock(
  selectResults: unknown[][],
  insertedEvent: unknown[] = [{ id: "event-row" }],
  updateResults: unknown[][] = [],
  conflictReturnResults: unknown[][] = [],
) {
  const writes: Array<{ operation: string; table: string; value?: unknown }> =
    [];
  const conditions: Array<{ table: string; condition: unknown }> = [];
  const conflictUpdates: unknown[] = [];
  const transaction = {
    select: vi.fn(() => ({
      from: vi.fn((table) => {
        getTableName(table);
        return {
          where: vi.fn(() => ({
            limit: vi.fn(async () => selectResults.shift() ?? []),
            orderBy: vi.fn(() => settled(selectResults.shift() ?? [])),
          })),
        };
      }),
    })),
    insert: vi.fn((table) => {
      const tableName = getTableName(table);
      return {
        values: vi.fn((value) => {
          writes.push({ operation: "insert", table: tableName, value });
          return {
            onConflictDoNothing: vi.fn(() => ({
              returning: vi.fn(async () => insertedEvent),
            })),
            onConflictDoUpdate: vi.fn((value) => {
              conflictUpdates.push(value);
              return {
                returning: vi.fn(
                  async () =>
                    conflictReturnResults.shift() ?? [
                      { id: "subscription-row" },
                    ],
                ),
              };
            }),
          };
        }),
      };
    }),
    update: vi.fn((table) => {
      const tableName = getTableName(table);
      return {
        set: vi.fn((value) => {
          writes.push({ operation: "update", table: tableName, value });
          return {
            where: vi.fn((condition) => {
              conditions.push({ table: tableName, condition });
              const promise = Promise.resolve(undefined);
              return Object.assign(promise, {
                returning: vi.fn(
                  async () =>
                    updateResults.shift() ?? [{ id: "replacement-local" }],
                ),
              });
            }),
          };
        }),
      };
    }),
  };
  database.transaction.mockImplementation((callback) => callback(transaction));
  return { transaction, writes, conditions, conflictUpdates };
}

function webhookInput(
  overrides: Partial<Parameters<BillingRepository["receiveWebhook"]>[0]> = {},
): Parameters<BillingRepository["receiveWebhook"]>[0] {
  return {
    eventId: "billing-test-event",
    eventType: "PAYMENT_CONFIRMED",
    resourceId: "asaas-subscription",
    externalReference: null,
    checkoutId: null,
    checkoutStatus: null,
    subscriptionId: "asaas-subscription",
    subscriptionStatus: null,
    paymentStatus: "ACTIVE",
    nextDueDate: "2026-12-22",
    paymentDueDate: null,
    providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
    payload: {},
    ...overrides,
  };
}

describe("BillingRepository", () => {
  const repository = new BillingRepository();

  beforeEach(() => {
    vi.resetAllMocks();
    database.update.mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn(() => settled(undefined)) })),
    });
  });

  it("scopes profile, subscription, checkout, and reservations to the active data owner", async () => {
    const limit = vi
      .fn()
      .mockResolvedValueOnce([{ id: "owner-a", email: "a@example.com" }])
      .mockResolvedValueOnce([{ id: "sub-a" }])
      .mockResolvedValueOnce([{ id: "checkout-a" }]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ limit, orderBy });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });
    const returning = vi.fn().mockResolvedValue([{ id: "checkout-a" }]);
    const values = vi.fn().mockReturnValue({ returning });
    database.insert.mockReturnValue({ values });

    await runWithDataOwner("owner-a", async () => {
      await expect(repository.getCurrentOwnerProfile()).resolves.toMatchObject({
        id: "owner-a",
      });
      await expect(
        repository.getCurrentOwnerSubscription(),
      ).resolves.toMatchObject({ id: "sub-a" });
      await expect(repository.getCurrentOwnerCheckout()).resolves.toMatchObject(
        { id: "checkout-a" },
      );
      await expect(
        repository.reserveCheckout({
          externalReference: "reference",
          billingType: "CREDIT_CARD",
          amountCents: 2500,
        }),
      ).resolves.toMatchObject({ id: "checkout-a" });
    });
    const ownerParams = where.mock.calls
      .slice(0, 3)
      .map(
        ([condition]) => new PgDialect().sqlToQuery(condition as SQL).params,
      );
    expect(ownerParams).toEqual([
      expect.arrayContaining(["owner-a"]),
      expect.arrayContaining(["owner-a"]),
      expect.arrayContaining(["owner-a"]),
    ]);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-a",
        externalReference: "reference",
      }),
    );
  });

  it("handles missing owner records and updates checkout or subscription reservations", async () => {
    const emptyLimit = vi.fn().mockResolvedValue([]);
    const emptyOrderBy = vi.fn().mockReturnValue({ limit: emptyLimit });
    const emptyWhere = vi.fn().mockReturnValue({
      limit: emptyLimit,
      orderBy: emptyOrderBy,
    });
    database.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: emptyWhere }),
    });
    database.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn(() => {
          const result = Promise.resolve(undefined);
          return Object.assign(result, {
            returning: vi.fn().mockResolvedValue([]),
          });
        }),
      }),
    });

    await runWithDataOwner("owner-a", async () => {
      await expect(repository.getCurrentOwnerProfile()).resolves.toBeNull();
      await expect(
        repository.getCurrentOwnerSubscription(),
      ).resolves.toBeNull();
      await expect(repository.getCurrentOwnerCheckout()).resolves.toBeNull();
      await expect(
        repository.attachProviderCheckout({
          externalReference: "missing-reference",
          providerCheckoutId: "provider-id",
          checkoutUrl: "https://asaas.test/checkout",
        }),
      ).resolves.toBeNull();
      await repository.abandonCheckout("missing-reference");
      await expect(
        repository.cancelCurrentOwnerSubscription("missing-subscription"),
      ).resolves.toBeNull();
      await repository.markCanceled("missing-subscription");
      await repository.cancelCheckout("missing-checkout");
      await expect(repository.hasPaidAccess("owner-a")).resolves.toBe(false);
    });
  });

  it("attaches provider identifiers and returns paid access for an active period", async () => {
    const updateWhere = vi.fn(() => {
      const result = Promise.resolve(undefined);
      return Object.assign(result, {
        returning: vi.fn().mockResolvedValue([{ id: "checkout-row" }]),
      });
    });
    database.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: updateWhere }),
    });
    database.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: "subscription-row" }]),
        })),
      })),
    });

    await runWithDataOwner("owner-a", async () => {
      await expect(
        repository.attachProviderCheckout({
          externalReference: "reference",
          providerCheckoutId: "provider-checkout",
          checkoutUrl: "https://asaas.test/checkout",
        }),
      ).resolves.toMatchObject({ id: "checkout-row" });
      await expect(repository.hasPaidAccess("owner-a")).resolves.toBe(true);
    });
  });

  it("does not overwrite terminal refund state with a local cancellation timestamp", async () => {
    const where = vi.fn((_condition: SQL) => settled(undefined));
    const set = vi.fn((_value: Record<string, unknown>) => ({ where }));
    database.update.mockReturnValue({ set });
    const accessWhere = vi.fn((_condition: SQL) => ({
      limit: vi.fn().mockResolvedValue([]),
    }));
    database.select.mockReturnValue({
      from: vi.fn(() => ({
        where: accessWhere,
      })),
    });

    const canceledAt = new Date("2026-10-22T12:00:00.000Z");
    await repository.markCanceled("provider-subscription", canceledAt);
    await expect(repository.hasPaidAccess("owner-a")).resolves.toBe(false);

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "CANCELED",
        localCancellationAt: canceledAt,
      }),
    );
    expect(set.mock.calls[0][0]).not.toHaveProperty("providerEventAt");
    const condition = new PgDialect().sqlToQuery(where.mock.calls[0][0] as SQL);
    expect(condition.params).toContain("provider-subscription");
    expect(condition.params).toEqual(
      expect.arrayContaining(["PENDING", "ACTIVE", "OVERDUE"]),
    );
    expect(condition.params).not.toContain("REFUNDED");
    const accessCondition = new PgDialect().sqlToQuery(
      accessWhere.mock.calls[0][0] as SQL,
    );
    expect(accessCondition.params).toEqual(
      expect.arrayContaining(["ACTIVE", "CANCELED"]),
    );
    expect(accessCondition.params).not.toContain("REFUNDED");
  });

  it("expires provider-backed pending checkouts at the 60 minute cutoff", async () => {
    const now = new Date("2026-10-22T12:00:00.000Z");
    const where = vi.fn((_condition: SQL) => settled(undefined));
    const set = vi.fn(() => ({ where }));
    database.update.mockReturnValue({ set });
    database.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
        })),
      })),
    });

    await runWithDataOwner("owner-a", () =>
      repository.getCurrentOwnerCheckout(now),
    );

    expect(set).toHaveBeenCalledWith({ status: "EXPIRED", updatedAt: now });
    const condition = new PgDialect().sqlToQuery(where.mock.calls[0][0] as SQL);
    expect(condition.sql).toContain('"providerCheckoutId" is not null');
    expect(condition.sql).toContain('"updatedAt" <=');
    expect(condition.params).toEqual([
      "owner-a",
      "PENDING",
      "2026-10-22T11:00:00.000Z",
    ]);
    const cutoff = new Date(condition.params[2] as string);
    expect(new Date(now.getTime() - 59 * 60 * 1000) <= cutoff).toBe(false);
    expect(new Date(now.getTime() - 60 * 60 * 1000) <= cutoff).toBe(true);
    expect(new Date(now.getTime() - 61 * 60 * 1000) <= cutoff).toBe(true);
  });

  it("expires stale checkouts before reserving a replacement", async () => {
    const operations: string[] = [];
    database.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => {
          operations.push("expire");
          return settled(undefined);
        }),
      })),
    });
    database.insert.mockReturnValue({
      values: vi.fn(() => {
        operations.push("reserve");
        return {
          returning: vi.fn().mockResolvedValue([{ id: "new-checkout" }]),
        };
      }),
    });

    await runWithDataOwner("owner-a", () =>
      repository.reserveCheckout(
        {
          externalReference: "new-reference",
          billingType: "CREDIT_CARD",
          amountCents: 2500,
        },
        new Date("2026-10-22T12:00:00.000Z"),
      ),
    );

    expect(operations).toEqual(["expire", "reserve"]);
  });

  it("finds an open replacement checkout only for a newer paid event", async () => {
    const now = new Date("2026-10-22T12:00:00.000Z");
    const queryFor = (rows: unknown[]) => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })),
      })),
    });
    const competitor = {
      id: "replacement-local",
      userId: "owner-a",
      providerCheckoutId: "replacement-provider",
      status: "SUBSCRIPTION_CREATED",
    };
    database.select
      .mockReturnValueOnce(queryFor([]))
      .mockReturnValueOnce(
        queryFor([
          {
            id: "expired-local",
            userId: "owner-a",
            status: "EXPIRED",
            providerEventAt: new Date(now.getTime() - 60_000),
          },
        ]),
      )
      .mockReturnValueOnce(queryFor([competitor]));

    await expect(
      repository.getCheckoutConflictForPaidWebhook({
        eventId: "late-paid-event",
        providerCheckoutId: null,
        externalReference: "old-reference",
        providerCreatedAt: now,
        incomingStatus: "PAID",
      }),
    ).resolves.toEqual(competitor);
  });

  it("matches by external reference and advances a subscription-created checkout to completed", async () => {
    const providerEventAt = new Date("2026-10-22T12:00:00.000Z");
    const checkout = {
      id: "original-checkout",
      userId: "owner-a",
      externalReference: "ref-original",
      providerEventAt,
      status: "SUBSCRIPTION_CREATED",
    };
    const incomingProviderEventAt = new Date("2026-10-22T12:00:00.000Z");
    const queryFor = (rows: unknown[]) => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })),
      })),
    });
    database.select
      .mockReturnValueOnce(queryFor([]))
      .mockReturnValueOnce(queryFor([checkout]))
      .mockReturnValueOnce(queryFor([]));

    await expect(
      repository.getCheckoutConflictForPaidWebhook({
        eventId: "second-paid-milestone",
        providerCheckoutId: null,
        externalReference: "ref-original",
        providerCreatedAt: incomingProviderEventAt,
        incomingStatus: "PAID",
      }),
    ).resolves.toBeNull();
  });

  it("fails closed for unknown checkout states and unsupported incoming milestone values", async () => {
    const queryFor = (rows: unknown[]) => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })),
      })),
    });
    database.select
      .mockReturnValueOnce(queryFor([]))
      .mockReturnValueOnce(
        queryFor([
          {
            id: "unknown-state-checkout",
            userId: "owner-a",
            providerEventAt: new Date("2026-10-22T12:00:00.000Z"),
            status: "UNRECOGNIZED",
          },
        ]),
      )
      .mockReturnValueOnce(queryFor([]));
    await expect(
      repository.getCheckoutConflictForPaidWebhook({
        eventId: "unknown-current-status",
        providerCheckoutId: "unknown-checkout",
        externalReference: null,
        providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
        incomingStatus: "PAID",
      }),
    ).resolves.toBeNull();

    database.select.mockReturnValueOnce(queryFor([])).mockReturnValueOnce(
      queryFor([
        {
          id: "known-state-checkout",
          userId: "owner-a",
          providerEventAt: new Date("2026-10-22T12:00:00.000Z"),
          status: "PENDING",
        },
      ]),
    );
    await expect(
      repository.getCheckoutConflictForPaidWebhook({
        eventId: "unknown-incoming-status",
        providerCheckoutId: "known-checkout",
        externalReference: null,
        providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
        incomingStatus: "UNRECOGNIZED" as unknown as "PAID",
      }),
    ).resolves.toBeNull();
  });

  it("skips conflict reconciliation for duplicate or stale paid events", async () => {
    const queryFor = (rows: unknown[]) => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })),
      })),
    });
    database.select.mockReturnValueOnce(queryFor([{ id: "event-row" }]));
    await expect(
      repository.getCheckoutConflictForPaidWebhook({
        eventId: "duplicate-event",
        providerCheckoutId: "expired-provider",
        externalReference: "old-reference",
        providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
        incomingStatus: "PAID",
      }),
    ).resolves.toBeNull();
    expect(database.select).toHaveBeenCalledTimes(1);

    database.select.mockReturnValueOnce(queryFor([])).mockReturnValueOnce(
      queryFor([
        {
          id: "expired-local",
          userId: "owner-a",
          status: "PAID",
          providerEventAt: new Date("2026-10-22T13:00:00.000Z"),
        },
      ]),
    );
    await expect(
      repository.getCheckoutConflictForPaidWebhook({
        eventId: "stale-event",
        providerCheckoutId: "expired-provider",
        externalReference: "old-reference",
        providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
        incomingStatus: "PAID",
      }),
    ).resolves.toBeNull();
    expect(database.select).toHaveBeenCalledTimes(3);
  });

  it("returns no competing checkout when a paid event has no reservation match", async () => {
    const queryFor = (rows: unknown[]) => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })),
      })),
    });
    database.select
      .mockReturnValueOnce(queryFor([]))
      .mockReturnValueOnce(queryFor([]));
    await expect(
      repository.getCheckoutConflictForPaidWebhook({
        eventId: "orphan-paid-event",
        providerCheckoutId: "unknown-checkout",
        externalReference: null,
        providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
        incomingStatus: "PAID",
      }),
    ).resolves.toBeNull();
  });

  it("does not reconcile a paid event whose provider timestamp is absent", async () => {
    const queryFor = (rows: unknown[]) => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })),
      })),
    });
    database.select.mockReturnValueOnce(queryFor([])).mockReturnValueOnce(
      queryFor([
        {
          id: "checkout-row",
          userId: "owner-a",
          providerEventAt: new Date("2026-10-22T12:00:00.000Z"),
          status: "PENDING",
        },
      ]),
    );
    await expect(
      repository.getCheckoutConflictForPaidWebhook({
        eventId: "missing-time-event",
        providerCheckoutId: "known-checkout",
        externalReference: null,
        providerCreatedAt: null as unknown as Date,
        incomingStatus: "PAID",
      }),
    ).resolves.toBeNull();
    expect(database.select).toHaveBeenCalledTimes(2);
  });

  it("allows a delayed payment after the replacement cancellation event clears the open checkout", async () => {
    const queryFor = (rows: unknown[]) => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })),
      })),
    });
    database.select
      .mockReturnValueOnce(queryFor([]))
      .mockReturnValueOnce(
        queryFor([
          {
            id: "expired-local",
            userId: "owner-a",
            status: "EXPIRED",
            providerEventAt: new Date("2026-10-22T11:00:00.000Z"),
          },
        ]),
      )
      .mockReturnValueOnce(queryFor([]));
    await expect(
      repository.getCheckoutConflictForPaidWebhook({
        eventId: "late-paid-after-cancel",
        providerCheckoutId: "expired-provider",
        externalReference: "old-reference",
        providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
        incomingStatus: "PAID",
      }),
    ).resolves.toBeNull();

    const { writes } = transactionMock(
      [
        [
          {
            id: "expired-local",
            userId: "owner-a",
            providerCheckoutId: "expired-provider",
            status: "EXPIRED",
            providerEventAt: new Date("2026-10-22T11:00:00.000Z"),
            providerSubscriptionId: null,
            billingType: "CREDIT_CARD",
            amountCents: 2500,
            nextDueDate: null,
          },
        ],
      ],
      [{ id: "event-row" }],
    );
    await repository.receiveWebhook({
      eventId: "late-paid-after-cancel",
      eventType: "CHECKOUT_PAID",
      resourceId: "expired-provider",
      externalReference: "old-reference",
      checkoutId: "expired-provider",
      checkoutStatus: "PAID",
      subscriptionId: null,
      subscriptionStatus: "ACTIVE",
      paymentStatus: null,
      nextDueDate: null,
      paymentDueDate: null,
      providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
      payload: {},
    });
    expect(
      writes.some(
        (write) =>
          write.table === "billing_checkouts" &&
          (write.value as { status?: string })?.status === "PAID",
      ),
    ).toBe(true);
  });

  it("deduplicates provider events before touching linked records", async () => {
    const { transaction } = transactionMock([], []);
    const result = await repository.receiveWebhook({
      eventId: "event-1",
      eventType: "UNKNOWN",
      resourceId: null,
      externalReference: null,
      checkoutId: null,
      checkoutStatus: null,
      subscriptionId: null,
      subscriptionStatus: null,
      paymentStatus: null,
      nextDueDate: null,
      paymentDueDate: null,
      providerCreatedAt: null,
      payload: {},
    });
    expect(result).toEqual({ duplicate: true, matched: true });
    expect(transaction.select).not.toHaveBeenCalled();
    expect(getTableName(billingWebhookEvents)).toBe("billing_webhook_events");
  });

  it("rejects state-changing webhook events without a valid provider timestamp", async () => {
    await expect(
      repository.receiveWebhook({
        eventId: "event-missing-time",
        eventType: "CHECKOUT_PAID",
        resourceId: "asaas-subscription",
        externalReference: "external-reference",
        checkoutId: "asaas-checkout",
        checkoutStatus: "PAID",
        subscriptionId: null,
        subscriptionStatus: null,
        paymentStatus: null,
        nextDueDate: null,
        paymentDueDate: null,
        providerCreatedAt: null,
        payload: {},
      }),
    ).rejects.toThrow("missing a valid creation date");
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("acknowledges inapplicable subscription lifecycle events without deferring them", async () => {
    const { writes } = transactionMock([[]], [{ id: "event-row" }]);
    const result = await repository.receiveWebhook({
      eventId: "unknown-subscription-event",
      eventType: "SUBSCRIPTION_DELETED",
      resourceId: "unknown-subscription",
      externalReference: null,
      checkoutId: null,
      checkoutStatus: null,
      subscriptionId: "unknown-subscription",
      subscriptionStatus: "CANCELED",
      paymentStatus: null,
      nextDueDate: null,
      paymentDueDate: null,
      providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
      payload: {},
    });

    expect(result).toEqual({
      duplicate: false,
      matched: true,
      deferred: false,
    });
    expect(
      writes.some(
        (write) =>
          write.table === "billing_webhook_events" &&
          write.operation === "update",
      ),
    ).toBe(true);
  });

  it("acknowledges an unlinked, inapplicable checkout event without mutating state", async () => {
    const { writes } = transactionMock([[]], [{ id: "event-row" }]);
    await expect(
      repository.receiveWebhook({
        eventId: "unlinked-checkout-update",
        eventType: "CHECKOUT_UPDATED",
        resourceId: "unknown-checkout",
        externalReference: null,
        checkoutId: "unknown-checkout",
        checkoutStatus: null,
        subscriptionId: null,
        subscriptionStatus: null,
        paymentStatus: null,
        nextDueDate: null,
        paymentDueDate: null,
        providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
        payload: {},
      }),
    ).resolves.toMatchObject({ matched: true });
    expect(
      writes.filter((write) => write.table === "billing_checkouts"),
    ).toHaveLength(0);
  });

  it("does not query unknown subscriptions for a correlated checkout creation event", async () => {
    const checkout = {
      id: "local-checkout",
      userId: "owner-a",
      providerCheckoutId: "provider-checkout",
      status: "PENDING",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
    };
    const { transaction } = transactionMock(
      [[checkout]],
      [{ id: "event-row" }],
    );
    await repository.receiveWebhook({
      eventId: "creation-without-subscription-id",
      eventType: "SUBSCRIPTION_CREATED",
      resourceId: "provider-checkout",
      externalReference: null,
      checkoutId: "provider-checkout",
      checkoutStatus: null,
      subscriptionId: null,
      subscriptionStatus: null,
      paymentStatus: null,
      nextDueDate: null,
      paymentDueDate: null,
      providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
      payload: {},
    });
    expect(transaction.select).toHaveBeenCalledOnce();
  });

  it("links a checkout identifier from an otherwise inapplicable event", async () => {
    const checkout = {
      id: "local-checkout",
      userId: "owner-a",
      providerCheckoutId: null,
      status: "PENDING",
    };
    const { writes } = transactionMock([[checkout]], [{ id: "event-row" }]);
    await expect(
      repository.receiveWebhook({
        eventId: "checkout-linked-event",
        eventType: "CHECKOUT_UPDATED",
        resourceId: "provider-checkout",
        externalReference: null,
        checkoutId: "provider-checkout",
        checkoutStatus: null,
        subscriptionId: null,
        subscriptionStatus: null,
        paymentStatus: null,
        nextDueDate: null,
        paymentDueDate: null,
        providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
        payload: {},
      }),
    ).resolves.toMatchObject({ matched: true });
    expect(writes).toContainEqual(
      expect.objectContaining({
        operation: "update",
        table: "billing_checkouts",
        value: expect.objectContaining({
          providerCheckoutId: "provider-checkout",
        }),
      }),
    );
  });

  it("keeps existing checkout linkage when a newer milestone omits optional identifiers", async () => {
    const oldDueDate = "2026-11-22";
    const oldSubscriptionId = "known-subscription";
    const checkout = {
      id: "local-checkout",
      userId: "owner-a",
      providerCheckoutId: "provider-checkout",
      providerSubscriptionId: oldSubscriptionId,
      externalReference: "known-reference",
      providerEventAt: new Date("2026-10-22T10:00:00.000Z"),
      status: "PENDING",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: oldDueDate,
    };
    const { writes } = transactionMock([[checkout]], [{ id: "event-row" }]);
    await repository.receiveWebhook({
      eventId: "payment-milestone-without-identifiers",
      eventType: "CHECKOUT_PAID",
      resourceId: "provider-checkout",
      externalReference: "known-reference",
      checkoutId: null,
      checkoutStatus: "PAID",
      subscriptionId: null,
      subscriptionStatus: "ACTIVE",
      paymentStatus: null,
      nextDueDate: null,
      paymentDueDate: null,
      providerCreatedAt: new Date("2026-10-22T11:00:00.000Z"),
      payload: {},
    });
    expect(
      writes.find(
        (write) =>
          write.operation === "update" && write.table === "billing_checkouts",
      )?.value,
    ).toMatchObject({
      status: "PAID",
    });
    expect(
      writes.find(
        (write) =>
          write.operation === "insert" &&
          write.table === "billing_subscriptions",
      )?.value,
    ).toMatchObject({
      providerSubscriptionId: oldSubscriptionId,
      nextDueDate: oldDueDate,
    });
  });

  it("rolls back an activation event that has no known checkout or subscription", async () => {
    const { writes } = transactionMock([[], []], [{ id: "event-row" }]);

    await expect(
      repository.receiveWebhook({
        eventId: "orphan-activation",
        eventType: "SUBSCRIPTION_CREATED",
        resourceId: "unknown-subscription",
        externalReference: null,
        checkoutId: null,
        checkoutStatus: null,
        subscriptionId: "unknown-subscription",
        subscriptionStatus: "ACTIVE",
        paymentStatus: null,
        nextDueDate: "2026-11-22",
        paymentDueDate: null,
        providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
        payload: {},
      }),
    ).rejects.toThrow("cannot be correlated");
    expect(writes).toContainEqual(
      expect.objectContaining({
        operation: "insert",
        table: "billing_webhook_events",
      }),
    );
  });

  it("activates only a paid hosted checkout with provider-confirmed subscription date", async () => {
    const providerCreatedAt = new Date("2026-10-22T12:00:00.000Z");
    const checkout = {
      id: "local-checkout",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      status: "PENDING",
      providerSubscriptionId: null,
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: null,
    };
    const { writes, conflictUpdates } = transactionMock(
      [[checkout], []],
      [{ id: "event-row" }],
    );
    const result = await repository.receiveWebhook({
      eventId: "event-2",
      eventType: "CHECKOUT_PAID",
      resourceId: "asaas-subscription",
      externalReference: "external-reference",
      checkoutId: "asaas-checkout",
      checkoutStatus: "PAID",
      subscriptionId: "asaas-subscription",
      subscriptionStatus: "ACTIVE",
      paymentStatus: null,
      nextDueDate: "2026-11-22",
      paymentDueDate: null,
      providerCreatedAt,
      payload: {},
    });
    expect(result).toMatchObject({ duplicate: false, matched: true });
    const subscriptionWrite = writes.find(
      (write) =>
        write.operation === "insert" && write.table === "billing_subscriptions",
    );
    expect(subscriptionWrite?.value).toMatchObject({
      userId: "owner-a",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
      providerEventAt: providerCreatedAt,
      accessUntil: new Date("2026-11-22T23:59:59.999Z"),
    });
    const upsertSetWhere = (conflictUpdates[0] as { setWhere: SQL }).setWhere;
    expect(new PgDialect().sqlToQuery(upsertSetWhere).params).toEqual(
      expect.arrayContaining(["CANCELED", "REFUNDED", "CHARGEBACK"]),
    );
  });

  it("fails retryably if the checkout disappears during a failed paid-state CAS", async () => {
    const checkout = {
      id: "local-checkout",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      status: "PENDING",
      providerEventAt: new Date("2026-10-22T10:00:00.000Z"),
      billingType: "CREDIT_CARD",
      amountCents: 2500,
    };
    transactionMock([[checkout], []], [{ id: "event-row" }], [[]]);
    await expect(
      repository.receiveWebhook({
        eventId: "checkout-disappeared",
        eventType: "CHECKOUT_PAID",
        resourceId: "asaas-checkout",
        externalReference: null,
        checkoutId: "asaas-checkout",
        checkoutStatus: "PAID",
        subscriptionId: null,
        subscriptionStatus: null,
        paymentStatus: null,
        nextDueDate: null,
        paymentDueDate: null,
        providerCreatedAt: new Date("2026-10-22T11:00:00.000Z"),
        payload: {},
      }),
    ).rejects.toThrow("Checkout disappeared during webhook reconciliation.");
  });

  it("fails retryably if the subscription disappears during activation upsert", async () => {
    const checkout = {
      id: "local-checkout",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      status: "PENDING",
      providerSubscriptionId: null,
      billingType: "CREDIT_CARD",
      amountCents: 2500,
    };
    transactionMock([[checkout], [], []], [{ id: "event-row" }], [], [[]]);
    await expect(
      repository.receiveWebhook({
        eventId: "subscription-disappeared",
        eventType: "CHECKOUT_PAID",
        resourceId: "asaas-subscription",
        externalReference: null,
        checkoutId: "asaas-checkout",
        checkoutStatus: "PAID",
        subscriptionId: "asaas-subscription",
        subscriptionStatus: "ACTIVE",
        paymentStatus: null,
        nextDueDate: "2026-11-22",
        paymentDueDate: null,
        providerCreatedAt: new Date("2026-10-22T11:00:00.000Z"),
        payload: {},
      }),
    ).rejects.toThrow(
      "Subscription disappeared during activation reconciliation.",
    );
  });

  it("keeps the newer subscription snapshot when an activation upsert loses a race", async () => {
    const checkout = {
      id: "local-checkout",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: "asaas-subscription",
      externalReference: "external-reference",
      providerEventAt: new Date("2026-10-22T09:00:00.000Z"),
      status: "COMPLETED",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
    };
    const snapshot = {
      id: "sub-row",
      userId: "owner-a",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      providerEventAt: new Date("2026-10-22T10:00:00.000Z"),
      localCancellationAt: null,
      nextDueDate: "2026-11-22",
      accessUntil: new Date("2026-11-22T23:59:59.999Z"),
    };
    const newerSubscription = {
      ...snapshot,
      providerEventAt: new Date("2026-10-22T12:00:00.000Z"),
      nextDueDate: "2026-12-22",
      accessUntil: new Date("2026-12-22T23:59:59.999Z"),
    };
    const deferredEvent = {
      id: "deferred-payment",
      payload: { paymentStatus: "ACTIVE", nextDueDate: "2026-11-22" },
      providerCreatedAt: new Date("2026-10-22T11:30:00.000Z"),
    };
    const { writes, conflictUpdates } = transactionMock(
      [[checkout], [snapshot], [newerSubscription], [deferredEvent]],
      [{ id: "event-row" }],
      [],
      [[]],
    );

    await repository.receiveWebhook({
      eventId: "older-activation-upsert-race",
      eventType: "SUBSCRIPTION_CREATED",
      resourceId: "asaas-subscription",
      externalReference: "external-reference",
      checkoutId: "asaas-checkout",
      checkoutStatus: null,
      subscriptionId: "asaas-subscription",
      subscriptionStatus: "ACTIVE",
      paymentStatus: null,
      nextDueDate: "2026-11-22",
      paymentDueDate: null,
      providerCreatedAt: new Date("2026-10-22T11:00:00.000Z"),
      payload: {},
    });

    const setWhere = (conflictUpdates[0] as { setWhere: SQL }).setWhere;
    expect(new PgDialect().sqlToQuery(setWhere).params).toEqual(
      expect.arrayContaining([
        "ACTIVE",
        snapshot.providerEventAt.toISOString(),
        "CANCELED",
        "REFUNDED",
        "CHARGEBACK",
      ]),
    );
    expect(
      writes.some(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_subscriptions",
      ),
    ).toBe(false);
  });

  it("re-reads a completed checkout when an older paid event loses its CAS", async () => {
    const checkoutSnapshot = {
      id: "local-checkout",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: null,
      externalReference: "external-reference",
      providerEventAt: new Date("2026-10-22T10:00:00.000Z"),
      status: "PENDING",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: null,
    };
    const completedCheckout = {
      ...checkoutSnapshot,
      providerEventAt: new Date("2026-10-22T12:00:00.000Z"),
      status: "COMPLETED",
    };
    const { conditions, writes } = transactionMock(
      [[checkoutSnapshot], [completedCheckout]],
      [{ id: "event-row" }],
      [[]],
    );

    await expect(
      repository.receiveWebhook({
        eventId: "older-checkout-paid-cas-race",
        eventType: "CHECKOUT_PAID",
        resourceId: "asaas-checkout",
        externalReference: "external-reference",
        checkoutId: "asaas-checkout",
        checkoutStatus: "PAID",
        subscriptionId: null,
        subscriptionStatus: null,
        paymentStatus: null,
        nextDueDate: null,
        paymentDueDate: null,
        providerCreatedAt: new Date("2026-10-22T11:00:00.000Z"),
        payload: {},
      }),
    ).resolves.toMatchObject({ duplicate: false, matched: true });

    const checkoutCondition = conditions.find(
      ({ table, condition }) =>
        table === "billing_checkouts" &&
        new PgDialect().sqlToQuery(condition as SQL).params.includes("PENDING"),
    );
    expect(checkoutCondition).toBeDefined();
    expect(
      new PgDialect().sqlToQuery(checkoutCondition!.condition as SQL).params,
    ).toEqual(
      expect.arrayContaining([
        "PENDING",
        checkoutSnapshot.providerEventAt.toISOString(),
      ]),
    );
    expect(
      writes.filter((write) => write.table === "billing_checkouts"),
    ).toHaveLength(1);
  });

  it("fails retryably when a paid checkout CAS loses to an expired checkout", async () => {
    const checkoutSnapshot = {
      id: "local-checkout",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: null,
      externalReference: "external-reference",
      providerEventAt: new Date("2026-10-22T10:00:00.000Z"),
      status: "PENDING",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: null,
    };
    const expiredCheckout = {
      ...checkoutSnapshot,
      providerEventAt: new Date("2026-10-22T12:00:00.000Z"),
      status: "EXPIRED",
    };
    const { conditions, writes } = transactionMock(
      [[checkoutSnapshot], [expiredCheckout]],
      [{ id: "event-row" }],
      [[]],
    );

    await expect(
      repository.receiveWebhook({
        eventId: "paid-checkout-loses-to-expiration",
        eventType: "CHECKOUT_PAID",
        resourceId: "asaas-checkout",
        externalReference: "external-reference",
        checkoutId: "asaas-checkout",
        checkoutStatus: "PAID",
        subscriptionId: null,
        subscriptionStatus: null,
        paymentStatus: null,
        nextDueDate: null,
        paymentDueDate: null,
        providerCreatedAt: new Date("2026-10-22T11:00:00.000Z"),
        payload: {},
      }),
    ).rejects.toThrow("Checkout changed during webhook reconciliation.");

    expect(
      conditions.some(
        ({ table, condition }) =>
          table === "billing_checkouts" &&
          new PgDialect()
            .sqlToQuery(condition as SQL)
            .params.includes(checkoutSnapshot.providerEventAt.toISOString()),
      ),
    ).toBe(true);
  });

  it("cancels the replacement reservation atomically before applying a delayed payment", async () => {
    const providerCreatedAt = new Date("2026-10-22T12:00:00.000Z");
    const expiredCheckout = {
      id: "expired-local",
      userId: "owner-a",
      providerCheckoutId: "expired-provider",
      status: "EXPIRED",
      providerEventAt: new Date("2026-10-22T11:00:00.000Z"),
      providerSubscriptionId: null,
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: null,
    };
    const { writes } = transactionMock(
      [[expiredCheckout]],
      [{ id: "event-row" }],
    );

    await repository.receiveWebhook({
      eventId: "delayed-paid-event",
      eventType: "CHECKOUT_PAID",
      resourceId: "expired-provider",
      externalReference: "old-reference",
      checkoutId: "expired-provider",
      checkoutStatus: "PAID",
      subscriptionId: null,
      subscriptionStatus: null,
      paymentStatus: null,
      nextDueDate: null,
      paymentDueDate: null,
      providerCreatedAt,
      payload: {},
      competingCheckoutToCancelId: "replacement-local",
    });

    expect(
      writes.filter((write) => write.table === "billing_checkouts"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "update",
          value: expect.objectContaining({ status: "CANCELED" }),
        }),
        expect.objectContaining({
          operation: "update",
          value: expect.objectContaining({
            status: "PAID",
            providerEventAt: providerCreatedAt,
          }),
        }),
      ]),
    );
  });

  it("does not apply the delayed payment if the competing reservation changed", async () => {
    const { transaction } = transactionMock([
      [
        {
          id: "expired-local",
          userId: "owner-a",
          providerCheckoutId: "expired-provider",
          status: "EXPIRED",
          providerEventAt: new Date("2026-10-22T11:00:00.000Z"),
          providerSubscriptionId: null,
          billingType: "CREDIT_CARD",
          amountCents: 2500,
          nextDueDate: null,
        },
      ],
    ]);
    transaction.update.mockImplementation((table) => {
      const tableName = getTableName(table);
      return {
        set: vi.fn((value) => ({
          where: vi.fn(() => {
            const promise = Promise.resolve(undefined);
            return Object.assign(promise, {
              returning: vi.fn(async () =>
                tableName === "billing_checkouts" &&
                (value as { status?: string }).status === "CANCELED"
                  ? []
                  : [{ id: "expired-local" }],
              ),
            });
          }),
        })),
      };
    });

    await expect(
      repository.receiveWebhook({
        eventId: "delayed-paid-event",
        eventType: "CHECKOUT_PAID",
        resourceId: "expired-provider",
        externalReference: "old-reference",
        checkoutId: "expired-provider",
        checkoutStatus: "PAID",
        subscriptionId: null,
        subscriptionStatus: null,
        paymentStatus: null,
        nextDueDate: null,
        paymentDueDate: null,
        providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
        payload: {},
        competingCheckoutToCancelId: "replacement-local",
      }),
    ).rejects.toThrow("changed before payment reconciliation");
  });

  it("does not grant access from a synthetic checkout due date and ignores stale payment state", async () => {
    const futureProviderEventAt = new Date("2026-10-22T12:00:00.000Z");
    const checkout = {
      id: "local-checkout",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      status: "PENDING",
      providerSubscriptionId: null,
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-10-23",
    };
    const { writes } = transactionMock([[checkout], []], [{ id: "event-row" }]);
    await repository.receiveWebhook({
      eventId: "event-3",
      eventType: "SUBSCRIPTION_CREATED",
      resourceId: "asaas-subscription",
      externalReference: "external-reference",
      checkoutId: "asaas-checkout",
      checkoutStatus: null,
      subscriptionId: "asaas-subscription",
      subscriptionStatus: "ACTIVE",
      paymentStatus: null,
      nextDueDate: null,
      paymentDueDate: null,
      providerCreatedAt: futureProviderEventAt,
      payload: {},
    });
    expect(
      writes.some((write) => write.table === "billing_subscriptions"),
    ).toBe(false);

    const { writes: staleWrites } = transactionMock([
      [
        {
          id: "sub-row",
          userId: "owner-a",
          providerSubscriptionId: "asaas-subscription",
          status: "REFUNDED",
          providerEventAt: futureProviderEventAt,
          nextDueDate: "2026-11-22",
        },
      ],
    ]);
    await repository.receiveWebhook({
      eventId: "event-4",
      eventType: "PAYMENT_CONFIRMED",
      resourceId: "asaas-subscription",
      externalReference: null,
      checkoutId: null,
      checkoutStatus: null,
      subscriptionId: "asaas-subscription",
      subscriptionStatus: null,
      paymentStatus: "ACTIVE",
      nextDueDate: "2026-12-22",
      paymentDueDate: null,
      providerCreatedAt: new Date("2026-10-22T11:00:00.000Z"),
      payload: {},
    });
    expect(
      staleWrites.filter(
        (write) =>
          write.table === "billing_subscriptions" &&
          write.operation === "update",
      ),
    ).toHaveLength(0);
  });

  it("does not let a stale checkout event overwrite the newest state or linkage", async () => {
    const newestEventAt = new Date("2026-10-22T13:00:00.000Z");
    const { writes } = transactionMock(
      [
        [
          {
            id: "local-checkout",
            userId: "owner-a",
            providerCheckoutId: "asaas-checkout",
            providerSubscriptionId: "new-subscription",
            providerEventAt: newestEventAt,
            status: "PAID",
            billingType: "CREDIT_CARD",
            amountCents: 2500,
            nextDueDate: "2026-11-22",
          },
        ],
      ],
      [{ id: "event-row" }],
    );

    await repository.receiveWebhook({
      eventId: "stale-checkout-event",
      eventType: "CHECKOUT_CANCELED",
      resourceId: "old-subscription",
      externalReference: "external-reference",
      checkoutId: "asaas-checkout",
      checkoutStatus: "CANCELED",
      subscriptionId: "old-subscription",
      subscriptionStatus: null,
      paymentStatus: null,
      nextDueDate: "2026-10-23",
      paymentDueDate: null,
      providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
      payload: {},
    });

    const checkoutUpdate = writes.find(
      (write) =>
        write.operation === "update" && write.table === "billing_checkouts",
    );
    expect(checkoutUpdate?.value).not.toHaveProperty("status");
    expect(checkoutUpdate?.value).not.toHaveProperty("providerSubscriptionId");
    expect(checkoutUpdate?.value).not.toHaveProperty("nextDueDate");
  });

  it("preserves refund and chargeback after newer subscription cancellation events", async () => {
    for (const terminalStatus of ["REFUNDED", "CHARGEBACK"] as const) {
      const { writes } = transactionMock([
        [
          {
            id: "subscription-row",
            userId: "owner-a",
            providerSubscriptionId: "asaas-subscription",
            status: terminalStatus,
            providerEventAt: new Date("2026-10-22T11:00:00.000Z"),
            nextDueDate: "2026-11-22",
          },
        ],
      ]);
      await repository.receiveWebhook({
        eventId: `cancel-after-${terminalStatus.toLowerCase()}`,
        eventType: "SUBSCRIPTION_DELETED",
        resourceId: "asaas-subscription",
        externalReference: null,
        checkoutId: null,
        checkoutStatus: null,
        subscriptionId: "asaas-subscription",
        subscriptionStatus: "CANCELED",
        paymentStatus: null,
        nextDueDate: null,
        paymentDueDate: null,
        providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
        payload: {},
      });
      expect(
        writes.some(
          (write) =>
            write.operation === "update" &&
            write.table === "billing_subscriptions",
        ),
      ).toBe(false);
    }
  });

  it("merges checkout milestones with identical second-precision timestamps", async () => {
    const providerEventAt = new Date("2026-10-22T12:00:00.000Z");
    const { writes } = transactionMock(
      [
        [
          {
            id: "local-checkout",
            userId: "owner-a",
            providerCheckoutId: "asaas-checkout",
            providerSubscriptionId: null,
            providerEventAt,
            status: "PAID",
            billingType: "CREDIT_CARD",
            amountCents: 2500,
            nextDueDate: null,
          },
        ],
        [],
      ],
      [{ id: "event-row" }],
    );

    await repository.receiveWebhook({
      eventId: "subscription-created-same-second",
      eventType: "SUBSCRIPTION_CREATED",
      resourceId: "asaas-subscription",
      externalReference: "external-reference",
      checkoutId: "asaas-checkout",
      checkoutStatus: null,
      subscriptionId: "asaas-subscription",
      subscriptionStatus: "ACTIVE",
      paymentStatus: null,
      nextDueDate: "2026-11-22",
      paymentDueDate: null,
      providerCreatedAt: new Date(providerEventAt),
      payload: {},
    });

    expect(
      writes.find(
        (write) =>
          write.operation === "update" && write.table === "billing_checkouts",
      )?.value,
    ).toMatchObject({ status: "COMPLETED", nextDueDate: "2026-11-22" });
    expect(
      writes.some(
        (write) =>
          write.operation === "insert" &&
          write.table === "billing_subscriptions",
      ),
    ).toBe(true);
  });

  it("accepts a newer provider payment after local checkout expiry", async () => {
    const expiredCheckout = {
      id: "local-checkout",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: null,
      providerEventAt: new Date("2026-10-22T10:00:00.000Z"),
      status: "EXPIRED",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: null,
    };
    const paidAt = new Date("2026-10-22T12:01:00.000Z");
    const paid = transactionMock([[expiredCheckout]], [{ id: "event-row" }]);
    await repository.receiveWebhook({
      eventId: "late-checkout-paid",
      eventType: "CHECKOUT_PAID",
      resourceId: "asaas-checkout",
      externalReference: "external-reference",
      checkoutId: "asaas-checkout",
      checkoutStatus: "PAID",
      subscriptionId: null,
      subscriptionStatus: null,
      paymentStatus: null,
      nextDueDate: null,
      paymentDueDate: null,
      providerCreatedAt: paidAt,
      payload: {},
    });
    expect(
      paid.writes.find(
        (write) =>
          write.operation === "update" && write.table === "billing_checkouts",
      )?.value,
    ).toMatchObject({ status: "PAID" });

    const subscriptionCreatedAt = new Date("2026-10-22T12:02:00.000Z");
    const subscriptionCreated = transactionMock(
      [
        [
          {
            ...expiredCheckout,
            status: "PAID",
            providerEventAt: paidAt,
          },
        ],
        [],
      ],
      [{ id: "event-row" }],
    );
    await repository.receiveWebhook({
      eventId: "late-subscription-created",
      eventType: "SUBSCRIPTION_CREATED",
      resourceId: "asaas-subscription",
      externalReference: "external-reference",
      checkoutId: "asaas-checkout",
      checkoutStatus: null,
      subscriptionId: "asaas-subscription",
      subscriptionStatus: "ACTIVE",
      paymentStatus: null,
      nextDueDate: "2026-11-22",
      paymentDueDate: null,
      providerCreatedAt: subscriptionCreatedAt,
      payload: {},
    });
    expect(
      subscriptionCreated.writes.find(
        (write) =>
          write.operation === "insert" &&
          write.table === "billing_subscriptions",
      )?.value,
    ).toMatchObject({
      status: "ACTIVE",
      providerEventAt: subscriptionCreatedAt,
      accessUntil: new Date("2026-11-22T23:59:59.999Z"),
    });
  });

  it("preserves a pre-cancellation confirmed payment deferred until subscription correlation", async () => {
    const localCancellationAt = new Date("2026-10-22T12:00:00.000Z");
    const providerEventAt = new Date("2026-10-22T11:55:00.000Z");
    const checkout = {
      id: "local-checkout",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: "asaas-subscription",
      externalReference: "external-reference",
      providerEventAt: new Date("2026-10-22T11:00:00.000Z"),
      status: "PAID",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
    };
    const subscription = {
      id: "sub-row",
      userId: "owner-a",
      providerSubscriptionId: "asaas-subscription",
      status: "CANCELED",
      providerEventAt: new Date("2026-10-22T11:50:00.000Z"),
      localCancellationAt,
      nextDueDate: "2026-11-22",
      accessUntil: new Date("2026-11-22T23:59:59.999Z"),
    };
    const deferredPayment = {
      id: "deferred-payment",
      payload: { paymentStatus: "ACTIVE", nextDueDate: "2026-12-22" },
      providerCreatedAt: providerEventAt,
    };
    const { writes } = transactionMock([
      [checkout],
      [subscription],
      [deferredPayment],
    ]);

    await repository.receiveWebhook({
      eventId: "subscription-created-after-local-cancel",
      eventType: "SUBSCRIPTION_CREATED",
      resourceId: "asaas-subscription",
      externalReference: "external-reference",
      checkoutId: "asaas-checkout",
      checkoutStatus: null,
      subscriptionId: "asaas-subscription",
      subscriptionStatus: "ACTIVE",
      paymentStatus: null,
      nextDueDate: "2026-11-22",
      paymentDueDate: null,
      providerCreatedAt: new Date("2026-10-22T11:58:00.000Z"),
      payload: {},
    });

    expect(
      writes.find(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_subscriptions",
      )?.value,
    ).toEqual(
      expect.objectContaining({
        status: "CANCELED",
        nextDueDate: "2026-12-22",
        accessUntil: new Date("2026-12-22T23:59:59.999Z"),
        providerEventAt,
      }),
    );
  });

  it("preserves the existing provider timestamp when a deferred terminal event has no timestamp", async () => {
    const localCancellationAt = new Date("2026-10-22T12:00:00.000Z");
    const providerEventAt = new Date("2026-10-22T11:50:00.000Z");
    const checkout = {
      id: "local-checkout",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: "asaas-subscription",
      status: "COMPLETED",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
    };
    const subscription = {
      id: "sub-row",
      userId: "owner-a",
      providerSubscriptionId: "asaas-subscription",
      status: "CANCELED",
      providerEventAt,
      localCancellationAt,
      nextDueDate: "2026-11-22",
    };
    const deferredRefund = {
      id: "deferred-refund",
      payload: { paymentStatus: "REFUNDED", nextDueDate: null },
      providerCreatedAt: null,
    };
    const { writes } = transactionMock([
      [checkout],
      [subscription],
      [deferredRefund],
    ]);

    await repository.receiveWebhook({
      eventId: "subscription-created-after-refund",
      eventType: "SUBSCRIPTION_CREATED",
      resourceId: "asaas-subscription",
      externalReference: "external-reference",
      checkoutId: "asaas-checkout",
      checkoutStatus: null,
      subscriptionId: "asaas-subscription",
      subscriptionStatus: "ACTIVE",
      paymentStatus: null,
      nextDueDate: "2026-11-22",
      paymentDueDate: null,
      providerCreatedAt: new Date("2026-10-22T12:01:00.000Z"),
      payload: {},
    });

    expect(
      writes.find(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_subscriptions",
      )?.value,
    ).toMatchObject({ status: "REFUNDED", providerEventAt });
  });

  it.each(["REFUNDED", "CHARGEBACK"] as const)(
    "applies a deferred %s event over a local cancellation even when the event is older",
    async (paymentStatus) => {
      const localCancellationAt = new Date("2026-10-22T12:00:00.000Z");
      const providerEventAt = new Date("2026-10-22T11:50:00.000Z");
      const checkout = {
        id: "local-checkout",
        userId: "owner-a",
        providerCheckoutId: "asaas-checkout",
        providerSubscriptionId: "asaas-subscription",
        status: "COMPLETED",
        billingType: "CREDIT_CARD",
        amountCents: 2500,
        nextDueDate: "2026-11-22",
      };
      const subscription = {
        id: "sub-row",
        userId: "owner-a",
        providerSubscriptionId: "asaas-subscription",
        status: "CANCELED",
        providerEventAt,
        localCancellationAt,
        nextDueDate: "2026-11-22",
      };
      const deferredEvent = {
        id: "deferred-terminal",
        payload: { paymentStatus, nextDueDate: null },
        providerCreatedAt: new Date("2026-10-22T11:40:00.000Z"),
      };
      const { writes } = transactionMock(
        [[checkout], [subscription], [deferredEvent], [subscription]],
        [{ id: "event-row" }],
        [[{ id: "checkout-row" }], [], [{ id: "subscription-row" }]],
      );

      await repository.receiveWebhook({
        eventId: `subscription-created-after-${paymentStatus.toLowerCase()}`,
        eventType: "SUBSCRIPTION_CREATED",
        resourceId: "asaas-subscription",
        externalReference: "external-reference",
        checkoutId: "asaas-checkout",
        checkoutStatus: null,
        subscriptionId: "asaas-subscription",
        subscriptionStatus: "ACTIVE",
        paymentStatus: null,
        nextDueDate: "2026-11-22",
        paymentDueDate: null,
        providerCreatedAt: new Date("2026-10-22T12:01:00.000Z"),
        payload: {},
      });

      const terminalUpdate = writes.find(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_subscriptions" &&
          (write.value as { status?: string } | undefined)?.status ===
            paymentStatus,
      );
      expect(terminalUpdate?.value).toMatchObject({
        status: paymentStatus,
        providerEventAt,
      });
    },
  );

  it("fails retryably if a deferred terminal fallback loses its compare-and-set", async () => {
    const localCancellationAt = new Date("2026-10-22T12:00:00.000Z");
    const checkout = {
      id: "local-checkout",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: "asaas-subscription",
      status: "COMPLETED",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
    };
    const canceled = {
      id: "sub-row",
      userId: "owner-a",
      providerSubscriptionId: "asaas-subscription",
      status: "CANCELED",
      localCancellationAt,
      nextDueDate: "2026-11-22",
    };
    const deferredRefund = {
      id: "deferred-refund",
      payload: { paymentStatus: "REFUNDED", nextDueDate: null },
      providerCreatedAt: new Date("2026-10-22T11:40:00.000Z"),
    };
    transactionMock(
      [[checkout], [canceled], [deferredRefund], [canceled]],
      [{ id: "event-row" }],
      [[{ id: "checkout-row" }], [], []],
    );
    await expect(
      repository.receiveWebhook({
        eventId: "deferred-terminal-cas-loss",
        eventType: "SUBSCRIPTION_CREATED",
        resourceId: "asaas-subscription",
        externalReference: "external-reference",
        checkoutId: "asaas-checkout",
        checkoutStatus: null,
        subscriptionId: "asaas-subscription",
        subscriptionStatus: "ACTIVE",
        paymentStatus: null,
        nextDueDate: "2026-11-22",
        paymentDueDate: null,
        providerCreatedAt: new Date("2026-10-22T12:01:00.000Z"),
        payload: {},
      }),
    ).rejects.toThrow(
      "Subscription changed during deferred terminal reconciliation.",
    );
  });

  it("reconciles a deferred payment when cancellation wins the concurrent update", async () => {
    const localCancellationAt = new Date("2026-10-22T12:00:00.000Z");
    const providerEventAt = new Date("2026-10-22T11:55:00.000Z");
    const checkout = {
      id: "local-checkout",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: "asaas-subscription",
      externalReference: "external-reference",
      providerEventAt: new Date("2026-10-22T11:00:00.000Z"),
      status: "PAID",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
    };
    const original = {
      id: "sub-row",
      userId: "owner-a",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      providerEventAt: new Date("2026-10-22T11:50:00.000Z"),
      localCancellationAt: null,
      nextDueDate: "2026-11-22",
      accessUntil: new Date("2026-11-22T23:59:59.999Z"),
    };
    const deferredPayment = {
      id: "deferred-payment",
      payload: { paymentStatus: "ACTIVE", nextDueDate: "2026-12-22" },
      providerCreatedAt: providerEventAt,
    };
    const canceled = {
      ...original,
      status: "CANCELED",
      localCancellationAt,
    };
    const { writes } = transactionMock(
      [[checkout], [original], [deferredPayment], [canceled]],
      [{ id: "event-row" }],
      [[{ id: "checkout-row" }], [], [{ id: "subscription-row" }]],
    );

    await repository.receiveWebhook({
      eventId: "subscription-created-deferred-cancel-race",
      eventType: "SUBSCRIPTION_CREATED",
      resourceId: "asaas-subscription",
      externalReference: "external-reference",
      checkoutId: "asaas-checkout",
      checkoutStatus: null,
      subscriptionId: "asaas-subscription",
      subscriptionStatus: "ACTIVE",
      paymentStatus: null,
      nextDueDate: "2026-11-22",
      paymentDueDate: null,
      providerCreatedAt: new Date("2026-10-22T11:53:00.000Z"),
      payload: {},
    });

    const subscriptionUpdates = writes.filter(
      (write) =>
        write.operation === "update" && write.table === "billing_subscriptions",
    );
    expect(subscriptionUpdates).toHaveLength(2);
    expect(subscriptionUpdates[0].value).toMatchObject({ status: "ACTIVE" });
    expect(subscriptionUpdates[1].value).toEqual(
      expect.objectContaining({
        nextDueDate: "2026-12-22",
        accessUntil: new Date("2026-12-22T23:59:59.999Z"),
        providerEventAt,
      }),
    );
    expect(subscriptionUpdates[1].value).not.toHaveProperty("status");
  });

  it("preserves a terminal subscription state over an active event in the same second", async () => {
    const eventAt = new Date("2026-10-22T12:00:00.000Z");
    const { writes } = transactionMock([
      [
        {
          id: "sub-row",
          userId: "owner-a",
          providerSubscriptionId: "asaas-subscription",
          status: "REFUNDED",
          providerEventAt: eventAt,
          nextDueDate: "2026-11-22",
        },
      ],
    ]);

    await repository.receiveWebhook({
      eventId: "payment-confirmed-same-second",
      eventType: "PAYMENT_CONFIRMED",
      resourceId: "asaas-subscription",
      externalReference: null,
      checkoutId: null,
      checkoutStatus: null,
      subscriptionId: "asaas-subscription",
      subscriptionStatus: null,
      paymentStatus: "ACTIVE",
      nextDueDate: "2026-12-22",
      paymentDueDate: null,
      providerCreatedAt: new Date(eventAt),
      payload: {},
    });

    expect(
      writes.filter(
        (write) =>
          write.table === "billing_subscriptions" &&
          write.operation === "update",
      ),
    ).toHaveLength(0);
  });

  it.each(["ACTIVE", "OVERDUE"] as const)(
    "does not reopen a provider-canceled subscription on a later %s payment event",
    async (paymentStatus) => {
      const canceledAt = new Date("2026-10-22T12:00:00.000Z");
      const { writes } = transactionMock([
        [
          {
            id: "sub-row",
            userId: "owner-a",
            providerSubscriptionId: "asaas-subscription",
            status: "CANCELED",
            providerEventAt: canceledAt,
            localCancellationAt: null,
            nextDueDate: "2026-11-22",
          },
        ],
      ]);

      await repository.receiveWebhook({
        eventId: `payment-after-provider-cancel-${paymentStatus.toLowerCase()}`,
        eventType:
          paymentStatus === "ACTIVE" ? "PAYMENT_CONFIRMED" : "PAYMENT_OVERDUE",
        resourceId: "asaas-subscription",
        externalReference: null,
        checkoutId: null,
        checkoutStatus: null,
        subscriptionId: "asaas-subscription",
        subscriptionStatus: null,
        paymentStatus,
        nextDueDate: "2026-12-22",
        paymentDueDate: null,
        providerCreatedAt: new Date("2026-10-22T12:01:00.000Z"),
        payload: {},
      });

      expect(
        writes.some(
          (write) =>
            write.operation === "update" &&
            write.table === "billing_subscriptions",
        ),
      ).toBe(false);
    },
  );

  it.each(["REFUNDED", "CHARGEBACK"] as const)(
    "never reactivates a %s subscription on a later payment event",
    async (status) => {
      const eventAt = new Date("2026-10-22T12:01:00.000Z");
      const { writes } = transactionMock([
        [
          {
            id: "sub-row",
            userId: "owner-a",
            providerSubscriptionId: "asaas-subscription",
            status,
            providerEventAt: new Date("2026-10-22T12:00:00.000Z"),
            localCancellationAt: null,
            nextDueDate: "2026-11-22",
          },
        ],
      ]);

      await repository.receiveWebhook({
        eventId: `payment-after-${status.toLowerCase()}`,
        eventType: "PAYMENT_CONFIRMED",
        resourceId: "asaas-subscription",
        externalReference: null,
        checkoutId: null,
        checkoutStatus: null,
        subscriptionId: "asaas-subscription",
        subscriptionStatus: null,
        paymentStatus: "ACTIVE",
        nextDueDate: "2026-12-22",
        paymentDueDate: null,
        providerCreatedAt: eventAt,
        payload: {},
      });

      expect(
        writes.some(
          (write) =>
            write.operation === "update" &&
            write.table === "billing_subscriptions",
        ),
      ).toBe(false);
    },
  );

  it.each(["REFUNDED", "CHARGEBACK"] as const)(
    "applies an older %s event after a newer subscription cancellation",
    async (status) => {
      const cancellationAt = new Date("2026-10-22T12:00:00.000Z");
      const olderRevocationAt = new Date("2026-10-22T11:00:00.000Z");
      const { writes } = transactionMock([
        [
          {
            id: "sub-row",
            userId: "owner-a",
            providerSubscriptionId: "asaas-subscription",
            status: "CANCELED",
            providerEventAt: cancellationAt,
            localCancellationAt: null,
            nextDueDate: "2026-11-22",
            accessUntil: new Date("2026-11-22T23:59:59.999Z"),
          },
        ],
      ]);
      database.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
        })),
      });

      await repository.receiveWebhook({
        eventId: `older-${status.toLowerCase()}-after-cancel`,
        eventType:
          status === "REFUNDED"
            ? "PAYMENT_REFUNDED"
            : "PAYMENT_CHARGEBACK_REQUESTED",
        resourceId: "asaas-subscription",
        externalReference: null,
        checkoutId: null,
        checkoutStatus: null,
        subscriptionId: "asaas-subscription",
        subscriptionStatus: null,
        paymentStatus: status,
        nextDueDate: null,
        paymentDueDate: null,
        providerCreatedAt: olderRevocationAt,
        payload: {},
      });

      expect(
        writes.find(
          (write) =>
            write.operation === "update" &&
            write.table === "billing_subscriptions",
        )?.value,
      ).toMatchObject({ status, providerEventAt: cancellationAt });
      await expect(repository.hasPaidAccess("owner-a")).resolves.toBe(false);
    },
  );

  it.each(["REFUNDED", "CHARGEBACK"] as const)(
    "applies an older deferred %s event after a newer subscription cancellation",
    async (status) => {
      const cancellationAt = new Date("2026-10-22T12:00:00.000Z");
      const olderRevocationAt = new Date("2026-10-22T11:00:00.000Z");
      const checkout = {
        id: "local-checkout",
        userId: "owner-a",
        providerCheckoutId: "asaas-checkout",
        providerSubscriptionId: "asaas-subscription",
        externalReference: "external-reference",
        providerEventAt: new Date("2026-10-22T09:00:00.000Z"),
        status: "COMPLETED",
        billingType: "CREDIT_CARD",
        amountCents: 2500,
        nextDueDate: "2026-11-22",
      };
      const canceledSubscription = {
        id: "sub-row",
        userId: "owner-a",
        providerSubscriptionId: "asaas-subscription",
        status: "CANCELED",
        providerEventAt: cancellationAt,
        localCancellationAt: null,
        nextDueDate: "2026-11-22",
        accessUntil: new Date("2026-11-22T23:59:59.999Z"),
      };
      const deferredEvent = {
        id: "deferred-event",
        payload: { paymentStatus: status, nextDueDate: null },
        providerCreatedAt: olderRevocationAt,
      };
      const { writes } = transactionMock([
        [checkout],
        [canceledSubscription],
        [deferredEvent],
      ]);
      database.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
        })),
      });

      await repository.receiveWebhook({
        eventId: `subscription-correlated-after-${status.toLowerCase()}`,
        eventType: "SUBSCRIPTION_CREATED",
        resourceId: "asaas-subscription",
        externalReference: "external-reference",
        checkoutId: "asaas-checkout",
        checkoutStatus: null,
        subscriptionId: "asaas-subscription",
        subscriptionStatus: "ACTIVE",
        paymentStatus: null,
        nextDueDate: "2026-11-22",
        paymentDueDate: null,
        providerCreatedAt: new Date("2026-10-22T10:00:00.000Z"),
        payload: {},
      });

      expect(
        writes.find(
          (write) =>
            write.operation === "update" &&
            write.table === "billing_subscriptions",
        )?.value,
      ).toMatchObject({ status, providerEventAt: cancellationAt });
      await expect(repository.hasPaidAccess("owner-a")).resolves.toBe(false);
    },
  );

  it("fails retryably when a deferred terminal update races a newer subscription event", async () => {
    const cancellationAt = new Date("2026-10-22T12:00:00.000Z");
    const concurrentEventAt = new Date("2026-10-22T12:01:00.000Z");
    const checkout = {
      id: "local-checkout",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: "asaas-subscription",
      externalReference: "external-reference",
      providerEventAt: cancellationAt,
      status: "COMPLETED",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
    };
    const subscriptionSnapshot = {
      id: "sub-row",
      userId: "owner-a",
      providerSubscriptionId: "asaas-subscription",
      status: "CANCELED",
      providerEventAt: cancellationAt,
      localCancellationAt: null,
      nextDueDate: "2026-11-22",
      accessUntil: new Date("2026-11-22T23:59:59.999Z"),
    };
    const deferredEvent = {
      id: "deferred-event",
      payload: { paymentStatus: "REFUNDED", nextDueDate: null },
      providerCreatedAt: new Date("2026-10-22T11:00:00.000Z"),
    };
    const concurrentSubscription = {
      ...subscriptionSnapshot,
      status: "ACTIVE",
      providerEventAt: concurrentEventAt,
    };
    const { conditions } = transactionMock(
      [
        [checkout],
        [subscriptionSnapshot],
        [deferredEvent],
        [concurrentSubscription],
      ],
      [{ id: "event-row" }],
      [[{ id: "checkout-row" }], []],
    );

    await expect(
      repository.receiveWebhook({
        eventId: "deferred-terminal-race",
        eventType: "SUBSCRIPTION_CREATED",
        resourceId: "asaas-subscription",
        externalReference: "external-reference",
        checkoutId: "asaas-checkout",
        checkoutStatus: null,
        subscriptionId: "asaas-subscription",
        subscriptionStatus: "ACTIVE",
        paymentStatus: null,
        nextDueDate: "2026-11-22",
        paymentDueDate: null,
        providerCreatedAt: new Date("2026-10-22T10:00:00.000Z"),
        payload: {},
      }),
    ).rejects.toThrow(
      "Subscription changed during deferred payment reconciliation.",
    );

    const terminalUpdate = conditions.find(
      ({ table, condition }) =>
        table === "billing_subscriptions" &&
        new PgDialect()
          .sqlToQuery(condition as SQL)
          .params.includes("CANCELED"),
    );
    expect(terminalUpdate).toBeDefined();
    expect(
      new PgDialect().sqlToQuery(terminalUpdate!.condition as SQL).params,
    ).toEqual(
      expect.arrayContaining(["CANCELED", cancellationAt.toISOString()]),
    );
  });

  it.each(["ACTIVE", "OVERDUE"] as const)(
    "does not reopen a provider-canceled subscription for deferred %s payment",
    async (paymentStatus) => {
      const cancellationAt = new Date("2026-10-22T12:00:00.000Z");
      const checkout = {
        id: "local-checkout",
        userId: "owner-a",
        providerCheckoutId: "asaas-checkout",
        providerSubscriptionId: "asaas-subscription",
        externalReference: "external-reference",
        providerEventAt: new Date("2026-10-22T09:00:00.000Z"),
        status: "COMPLETED",
        billingType: "CREDIT_CARD",
        amountCents: 2500,
        nextDueDate: "2026-11-22",
      };
      const canceledSubscription = {
        id: "sub-row",
        userId: "owner-a",
        providerSubscriptionId: "asaas-subscription",
        status: "CANCELED",
        providerEventAt: cancellationAt,
        localCancellationAt: null,
        nextDueDate: "2026-11-22",
        accessUntil: new Date("2026-11-22T23:59:59.999Z"),
      };
      const deferredEvent = {
        id: "deferred-event",
        payload: { paymentStatus, nextDueDate: "2026-12-22" },
        providerCreatedAt: new Date("2026-10-22T12:03:00.000Z"),
      };
      const { writes } = transactionMock([
        [checkout],
        [canceledSubscription],
        [deferredEvent],
      ]);

      await repository.receiveWebhook({
        eventId: `correlate-after-cancel-${paymentStatus.toLowerCase()}`,
        eventType: "SUBSCRIPTION_CREATED",
        resourceId: "asaas-subscription",
        externalReference: "external-reference",
        checkoutId: "asaas-checkout",
        checkoutStatus: null,
        subscriptionId: "asaas-subscription",
        subscriptionStatus: "ACTIVE",
        paymentStatus: null,
        nextDueDate: "2026-11-22",
        paymentDueDate: null,
        providerCreatedAt: new Date("2026-10-22T12:02:00.000Z"),
        payload: {},
      });

      expect(
        writes.some(
          (write) =>
            write.operation === "update" &&
            write.table === "billing_subscriptions",
        ),
      ).toBe(false);
    },
  );

  it.each([
    ["before", "2026-10-22T12:04:00.000Z", true],
    ["at", "2026-10-22T12:05:00.000Z", false],
    ["after", "2026-10-22T12:06:00.000Z", false],
  ])(
    "keeps a locally canceled subscription closed for a payment event %s the cancellation",
    async (_position, providerEventDate, preservePaidPeriod) => {
      const localCancellationAt = new Date("2026-10-22T12:05:00.000Z");
      const { writes } = transactionMock([
        [
          {
            id: "sub-row",
            userId: "owner-a",
            providerSubscriptionId: "asaas-subscription",
            status: "CANCELED",
            providerEventAt: new Date("2026-10-22T12:00:00.000Z"),
            localCancellationAt,
            nextDueDate: "2026-11-22",
            accessUntil: new Date("2026-11-22T23:59:59.999Z"),
          },
        ],
      ]);
      const accessLimit = vi.fn().mockResolvedValue([{ id: "sub-row" }]);
      database.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: accessLimit })),
        })),
      });

      await repository.receiveWebhook({
        eventId: `payment-local-cancel-${providerEventDate}`,
        eventType: "PAYMENT_CONFIRMED",
        resourceId: "asaas-subscription",
        externalReference: null,
        checkoutId: null,
        checkoutStatus: null,
        subscriptionId: "asaas-subscription",
        subscriptionStatus: null,
        paymentStatus: "ACTIVE",
        nextDueDate: "2026-12-22",
        paymentDueDate: null,
        providerCreatedAt: new Date(providerEventDate),
        payload: {},
      });

      const subscriptionUpdate = writes.find(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_subscriptions",
      );
      expect(subscriptionUpdate?.value).not.toHaveProperty("status");
      expect(subscriptionUpdate?.value).not.toHaveProperty(
        "localCancellationAt",
      );
      expect(subscriptionUpdate?.value).toEqual(
        expect.objectContaining({
          providerEventAt: new Date(providerEventDate),
          ...(preservePaidPeriod
            ? {
                nextDueDate: "2026-12-22",
                accessUntil: new Date("2026-12-22T23:59:59.999Z"),
              }
            : {}),
        }),
      );
      await expect(repository.hasPaidAccess("owner-a")).resolves.toBe(true);
    },
  );

  it("reconciles a payment if local cancellation wins the concurrent status update", async () => {
    const localCancellationAt = new Date("2026-10-22T12:05:00.000Z");
    const providerEventAt = new Date("2026-10-22T12:04:00.000Z");
    const original = {
      id: "sub-row",
      userId: "owner-a",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      providerEventAt: new Date("2026-10-22T12:00:00.000Z"),
      localCancellationAt: null,
      nextDueDate: "2026-11-22",
      accessUntil: new Date("2026-11-22T23:59:59.999Z"),
    };
    const canceled = {
      ...original,
      status: "CANCELED",
      localCancellationAt,
    };
    const { writes, transaction } = transactionMock(
      [[original], [canceled]],
      [{ id: "event-row" }],
      [[], [{ id: "subscription-row" }]],
    );

    await repository.receiveWebhook({
      eventId: "payment-cancel-race",
      eventType: "PAYMENT_CONFIRMED",
      resourceId: "asaas-subscription",
      externalReference: null,
      checkoutId: null,
      checkoutStatus: null,
      subscriptionId: "asaas-subscription",
      subscriptionStatus: null,
      paymentStatus: "ACTIVE",
      nextDueDate: "2026-12-22",
      paymentDueDate: null,
      providerCreatedAt: providerEventAt,
      payload: {},
    });

    const subscriptionUpdates = writes.filter(
      (write) =>
        write.operation === "update" && write.table === "billing_subscriptions",
    );
    expect(subscriptionUpdates).toHaveLength(2);
    expect(subscriptionUpdates[0].value).toMatchObject({ status: "ACTIVE" });
    expect(subscriptionUpdates[1].value).toMatchObject({
      nextDueDate: "2026-12-22",
      accessUntil: new Date("2026-12-22T23:59:59.999Z"),
      providerEventAt,
    });
    expect(subscriptionUpdates[1].value).not.toHaveProperty("status");
    const updateBuilders = transaction.update.mock.results;
    const lastWhere = updateBuilders[1].value.set.mock.results[0].value.where;
    const fallbackCondition = new PgDialect().sqlToQuery(
      lastWhere.mock.calls[0][0] as SQL,
    );
    expect(fallbackCondition.sql).toContain('"localCancellationAt" =');
    expect(fallbackCondition.params.map(String)).toContain(
      localCancellationAt.toISOString(),
    );
    expect(fallbackCondition.sql).toContain('"status" =');
    expect(fallbackCondition.sql).toContain('"providerEventAt" =');
    expect(fallbackCondition.params.map(String)).toContain(
      new Date("2026-10-22T12:00:00.000Z").toISOString(),
    );
  });

  it("requires an unexpired entitlement date for all paid access states", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });
    await expect(
      repository.hasPaidAccess("owner-a", new Date("2026-10-22T12:00:00.000Z")),
    ).resolves.toBe(false);
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0] as SQL);
    expect(query.sql).toContain('"accessUntil" >');
    expect(query.params).toContain("owner-a");
  });

  it("retries a terminal payment when its compare-and-set loses a concurrent update", async () => {
    const snapshot = {
      id: "sub-row",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      providerEventAt: new Date("2026-10-22T11:00:00.000Z"),
      localCancellationAt: null,
    };
    transactionMock([[snapshot]], [{ id: "event-row" }], [[]]);

    await expect(
      repository.receiveWebhook(webhookInput({ paymentStatus: "REFUNDED" })),
    ).rejects.toThrow(
      "Subscription changed during terminal payment reconciliation.",
    );
  });

  it("retries if a pre-cancellation payment cannot be reconciled after the CAS race", async () => {
    const cancellationAt = new Date("2026-10-22T12:00:00.000Z");
    const snapshot = {
      id: "sub-row",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      providerEventAt: new Date("2026-10-22T11:50:00.000Z"),
      localCancellationAt: null,
      nextDueDate: "2026-11-22",
    };
    const canceledAfterRead = {
      ...snapshot,
      status: "CANCELED",
      localCancellationAt: cancellationAt,
    };
    transactionMock(
      [[snapshot], [canceledAfterRead]],
      [{ id: "event-row" }],
      [[], []],
    );

    await expect(
      repository.receiveWebhook(
        webhookInput({
          providerCreatedAt: new Date("2026-10-22T11:55:00.000Z"),
        }),
      ),
    ).rejects.toThrow(
      "Subscription changed during local cancellation reconciliation.",
    );
  });

  it("retries when a payment CAS loses to a nonterminal subscription update", async () => {
    const snapshot = {
      id: "sub-row",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      providerEventAt: new Date("2026-10-22T11:00:00.000Z"),
      localCancellationAt: null,
    };
    const newerSubscription = {
      ...snapshot,
      providerEventAt: new Date("2026-10-22T12:01:00.000Z"),
    };
    transactionMock(
      [[snapshot], [newerSubscription]],
      [{ id: "event-row" }],
      [[], []],
    );

    await expect(repository.receiveWebhook(webhookInput())).rejects.toThrow(
      "Subscription changed during payment reconciliation.",
    );
  });

  it("does not retry an old payment when a refund won the concurrent update", async () => {
    const snapshot = {
      id: "sub-row",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      providerEventAt: new Date("2026-10-22T11:00:00.000Z"),
      localCancellationAt: null,
    };
    const refunded = {
      ...snapshot,
      status: "REFUNDED",
      providerEventAt: new Date("2026-10-22T12:01:00.000Z"),
    };
    transactionMock([[snapshot], [refunded]], [{ id: "event-row" }], [[], []]);

    await expect(
      repository.receiveWebhook(webhookInput()),
    ).resolves.toMatchObject({ matched: true });
  });

  it("acknowledges a subscription cancellation after a terminal payment without regressing it", async () => {
    const { writes } = transactionMock([
      [
        {
          id: "sub-row",
          providerSubscriptionId: "asaas-subscription",
          status: "REFUNDED",
          providerEventAt: new Date("2026-10-22T11:00:00.000Z"),
        },
      ],
    ]);

    await repository.receiveWebhook(
      webhookInput({
        eventType: "SUBSCRIPTION_DELETED",
        paymentStatus: null,
        subscriptionStatus: "CANCELED",
        providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
      }),
    );

    expect(
      writes.some(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_subscriptions",
      ),
    ).toBe(false);
  });

  it("rejects an activation event that has neither a checkout nor a subscription reference", async () => {
    transactionMock([[]], [{ id: "event-row" }]);

    await expect(
      repository.receiveWebhook(
        webhookInput({
          eventType: "SUBSCRIPTION_CREATED",
          resourceId: null,
          externalReference: null,
          checkoutId: null,
          subscriptionId: null,
          subscriptionStatus: "ACTIVE",
          paymentStatus: null,
        }),
      ),
    ).rejects.toThrow("cannot be correlated");
  });

  it("continues a paid checkout CAS when a concurrent event already paid it", async () => {
    const pendingCheckout = {
      id: "checkout-row",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      externalReference: "external-reference",
      status: "PENDING",
      providerEventAt: new Date("2026-10-22T11:00:00.000Z"),
      billingType: "CREDIT_CARD",
      amountCents: 2500,
    };
    const paidCheckout = {
      ...pendingCheckout,
      status: "PAID",
      providerEventAt: new Date("2026-10-22T12:01:00.000Z"),
    };
    transactionMock(
      [[pendingCheckout], [paidCheckout]],
      [{ id: "event-row" }],
      [[]],
    );

    await expect(
      repository.receiveWebhook(
        webhookInput({
          eventType: "CHECKOUT_PAID",
          checkoutId: "asaas-checkout",
          checkoutStatus: "PAID",
          subscriptionId: null,
          paymentStatus: null,
          nextDueDate: null,
          providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
        }),
      ),
    ).resolves.toMatchObject({ matched: true });
  });

  it("recognizes an already completed checkout after a stale paid webhook loses its CAS", async () => {
    const pendingCheckout = {
      id: "checkout-row",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      externalReference: "external-reference",
      status: "SUBSCRIPTION_CREATED",
      providerEventAt: new Date("2026-10-22T11:00:00.000Z"),
      billingType: "CREDIT_CARD",
      amountCents: 2500,
    };
    const completedCheckout = {
      ...pendingCheckout,
      status: "COMPLETED",
      providerEventAt: new Date("2026-10-22T12:01:00.000Z"),
    };
    transactionMock(
      [[pendingCheckout], [completedCheckout]],
      [{ id: "event-row" }],
      [[]],
    );

    await expect(
      repository.receiveWebhook(
        webhookInput({
          eventType: "CHECKOUT_PAID",
          checkoutId: "asaas-checkout",
          checkoutStatus: "PAID",
          subscriptionId: null,
          paymentStatus: null,
          nextDueDate: null,
          providerCreatedAt: new Date("2026-10-22T12:00:00.000Z"),
        }),
      ),
    ).resolves.toMatchObject({ matched: true });
  });

  it("does not write checkout state when a correlated update has no state or provider id", async () => {
    const checkout = {
      id: "checkout-row",
      userId: "owner-a",
      externalReference: "external-reference",
      status: "PENDING",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
    };
    const { writes } = transactionMock([[checkout]], [{ id: "event-row" }]);

    await repository.receiveWebhook(
      webhookInput({
        eventType: "CHECKOUT_UPDATED",
        resourceId: null,
        externalReference: "external-reference",
        checkoutId: null,
        checkoutStatus: null,
        subscriptionId: null,
        subscriptionStatus: null,
        paymentStatus: null,
      }),
    );

    expect(
      writes.some(
        (write) =>
          write.operation === "update" && write.table === "billing_checkouts",
      ),
    ).toBe(false);
  });

  it("marks an unsupported deferred status processed without changing entitlement", async () => {
    const checkout = {
      id: "checkout-row",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: "asaas-subscription",
      externalReference: "external-reference",
      status: "COMPLETED",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
    };
    const subscription = {
      id: "sub-row",
      userId: "owner-a",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      providerEventAt: new Date("2026-10-22T10:00:00.000Z"),
      localCancellationAt: null,
      nextDueDate: "2026-11-22",
    };
    const unsupportedDeferredEvent = {
      id: "deferred-event",
      payload: { paymentStatus: "PENDING", nextDueDate: null },
      providerCreatedAt: new Date("2026-10-22T11:00:00.000Z"),
    };
    const { writes } = transactionMock(
      [[checkout], [subscription], [unsupportedDeferredEvent]],
      [{ id: "event-row" }],
    );

    await repository.receiveWebhook(
      webhookInput({
        eventType: "SUBSCRIPTION_CREATED",
        externalReference: "external-reference",
        checkoutId: "asaas-checkout",
        checkoutStatus: null,
        subscriptionId: "asaas-subscription",
        subscriptionStatus: "ACTIVE",
        paymentStatus: null,
        nextDueDate: "2026-11-22",
      }),
    );

    expect(
      writes.filter(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_subscriptions",
      ),
    ).toHaveLength(0);
    expect(
      writes.find(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_webhook_events",
      )?.value,
    ).toHaveProperty("processedAt");
  });

  it("keeps an existing entitlement when an overdue notice refers to an earlier due date", async () => {
    const existingDueDate = "2027-01-22";
    const { writes } = transactionMock([
      [
        {
          id: "sub-row",
          userId: "owner-a",
          providerSubscriptionId: "asaas-subscription",
          status: "ACTIVE",
          providerEventAt: new Date("2026-10-22T11:00:00.000Z"),
          localCancellationAt: null,
          nextDueDate: existingDueDate,
        },
      ],
    ]);

    await repository.receiveWebhook(
      webhookInput({
        paymentStatus: "OVERDUE",
        paymentDueDate: "2026-12-22",
        nextDueDate: "2026-12-22",
      }),
    );

    expect(
      writes.find(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_subscriptions",
      )?.value,
    ).toMatchObject({
      status: "ACTIVE",
      nextDueDate: existingDueDate,
      accessUntil: new Date("2027-01-22T23:59:59.999Z"),
    });
  });

  it("stores an active payment without an access date when the provider has no confirmed due date", async () => {
    const { writes } = transactionMock([
      [
        {
          id: "sub-row",
          userId: "owner-a",
          providerSubscriptionId: "asaas-subscription",
          status: "PENDING",
          providerEventAt: null,
          localCancellationAt: null,
          nextDueDate: null,
        },
      ],
    ]);

    await repository.receiveWebhook(webhookInput({ nextDueDate: null }));

    expect(
      writes.find(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_subscriptions",
      )?.value,
    ).toMatchObject({ status: "ACTIVE" });
    expect(
      writes.find(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_subscriptions",
      )?.value,
    ).not.toHaveProperty("accessUntil");
  });

  it("guards a payment update against a subscription with no previous provider event date", async () => {
    const { conditions } = transactionMock([
      [
        {
          id: "sub-row",
          providerSubscriptionId: "asaas-subscription",
          status: "PENDING",
          providerEventAt: null,
          localCancellationAt: null,
        },
      ],
    ]);

    await repository.receiveWebhook(webhookInput());

    const subscriptionCondition = conditions.find(
      ({ table }) => table === "billing_subscriptions",
    )?.condition as SQL;
    expect(new PgDialect().sqlToQuery(subscriptionCondition).sql).toContain(
      '"providerEventAt" is null',
    );
  });

  it("ignores an older subscription cancellation event", async () => {
    const { writes } = transactionMock([
      [
        {
          id: "sub-row",
          providerSubscriptionId: "asaas-subscription",
          status: "ACTIVE",
          providerEventAt: new Date("2026-10-22T12:00:00.000Z"),
          localCancellationAt: null,
        },
      ],
    ]);

    await repository.receiveWebhook(
      webhookInput({
        eventType: "SUBSCRIPTION_DELETED",
        paymentStatus: null,
        subscriptionStatus: "CANCELED",
        providerCreatedAt: new Date("2026-10-22T11:00:00.000Z"),
      }),
    );

    expect(
      writes.some(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_subscriptions",
      ),
    ).toBe(false);
  });

  it("defers a payment when its provider subscription has not been correlated yet", async () => {
    const { writes } = transactionMock([[]], [{ id: "event-row" }]);

    const result = await repository.receiveWebhook(
      webhookInput({ subscriptionId: "unlinked-subscription" }),
    );

    expect(result).toMatchObject({ matched: false, deferred: true });
    expect(
      writes.some(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_webhook_events",
      ),
    ).toBe(false);
  });

  it("fails retryably when a payment update finds the subscription deleted", async () => {
    const snapshot = {
      id: "sub-row",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      providerEventAt: new Date("2026-10-22T11:00:00.000Z"),
      localCancellationAt: null,
    };
    transactionMock([[snapshot], []], [{ id: "event-row" }], [[]]);

    await expect(repository.receiveWebhook(webhookInput())).rejects.toThrow(
      "Subscription disappeared during payment reconciliation.",
    );
  });

  it("applies a later subscription cancellation lifecycle event", async () => {
    const { writes } = transactionMock([
      [
        {
          id: "sub-row",
          providerSubscriptionId: "asaas-subscription",
          status: "ACTIVE",
          providerEventAt: new Date("2026-10-22T11:00:00.000Z"),
          localCancellationAt: null,
        },
      ],
    ]);

    await repository.receiveWebhook(
      webhookInput({
        eventType: "SUBSCRIPTION_DELETED",
        paymentStatus: null,
        subscriptionStatus: "CANCELED",
      }),
    );

    expect(
      writes.find(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_subscriptions",
      )?.value,
    ).toMatchObject({ status: "CANCELED" });
  });

  it("recognizes an already-correlated subscription for an activation without checkout correlation", async () => {
    transactionMock([[{ id: "known-subscription" }]], [{ id: "event-row" }]);

    await expect(
      repository.receiveWebhook(
        webhookInput({
          eventType: "SUBSCRIPTION_CREATED",
          resourceId: "asaas-subscription",
          externalReference: null,
          checkoutId: null,
          subscriptionId: "asaas-subscription",
          subscriptionStatus: "ACTIVE",
          paymentStatus: null,
        }),
      ),
    ).resolves.toMatchObject({ matched: true, deferred: false });
  });

  it("completes a subscription-created milestone after a paid checkout", async () => {
    const checkout = {
      id: "checkout-row",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: null,
      externalReference: "external-reference",
      status: "PAID",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
    };
    const { writes } = transactionMock([[checkout], []], [{ id: "event-row" }]);

    await repository.receiveWebhook(
      webhookInput({
        eventType: "SUBSCRIPTION_CREATED",
        resourceId: "asaas-subscription",
        externalReference: "external-reference",
        checkoutId: "asaas-checkout",
        checkoutStatus: null,
        subscriptionId: null,
        subscriptionStatus: null,
        paymentStatus: null,
      }),
    );

    expect(
      writes.find(
        (write) =>
          write.operation === "update" && write.table === "billing_checkouts",
      )?.value,
    ).toMatchObject({ status: "COMPLETED" });
  });

  it("completes a previously created subscription when the paid milestone arrives", async () => {
    const checkout = {
      id: "checkout-row",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      externalReference: "external-reference",
      status: "SUBSCRIPTION_CREATED",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
    };
    const { writes } = transactionMock([[checkout]], [{ id: "event-row" }]);

    await repository.receiveWebhook(
      webhookInput({
        eventType: "CHECKOUT_PAID",
        externalReference: "external-reference",
        checkoutId: "asaas-checkout",
        checkoutStatus: "PAID",
        subscriptionId: null,
        subscriptionStatus: null,
        paymentStatus: null,
        nextDueDate: null,
      }),
    );

    expect(
      writes.find(
        (write) =>
          write.operation === "update" && write.table === "billing_checkouts",
      )?.value,
    ).toMatchObject({ status: "COMPLETED" });
  });

  it("retains the provider timestamp when an activation upsert loses to a row without one", async () => {
    const checkout = {
      id: "checkout-row",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: "asaas-subscription",
      externalReference: "external-reference",
      status: "COMPLETED",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
    };
    const existingSubscription = {
      id: "subscription-row",
      userId: "owner-a",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      providerEventAt: null,
      localCancellationAt: null,
      nextDueDate: "2026-11-22",
    };
    transactionMock(
      [[checkout], [existingSubscription], [existingSubscription], []],
      [{ id: "event-row" }],
      [[{ id: "checkout-row" }]],
      [[]],
    );

    await expect(
      repository.receiveWebhook(
        webhookInput({
          eventType: "SUBSCRIPTION_CREATED",
          resourceId: "asaas-subscription",
          externalReference: "external-reference",
          checkoutId: "asaas-checkout",
          checkoutStatus: null,
          subscriptionId: "asaas-subscription",
          subscriptionStatus: "ACTIVE",
          paymentStatus: null,
        }),
      ),
    ).resolves.toMatchObject({ matched: true });
  });

  it("uses a null timestamp compare-and-set for deferred events after an existing row is read", async () => {
    const checkout = {
      id: "checkout-row",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: "asaas-subscription",
      externalReference: "external-reference",
      status: "COMPLETED",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
    };
    const activeWithoutEventDate = {
      id: "subscription-row",
      userId: "owner-a",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      providerEventAt: null,
      localCancellationAt: null,
      nextDueDate: "2026-11-22",
    };
    const deferredPayment = {
      id: "deferred-payment",
      payload: { paymentStatus: "OVERDUE", nextDueDate: "2026-12-22" },
      providerCreatedAt: new Date("2026-10-22T11:30:00.000Z"),
    };
    const { conditions } = transactionMock(
      [
        [checkout],
        [activeWithoutEventDate],
        [activeWithoutEventDate],
        [deferredPayment],
      ],
      [{ id: "event-row" }],
      [[{ id: "checkout-row" }]],
      [[]],
    );

    await repository.receiveWebhook(
      webhookInput({
        eventType: "SUBSCRIPTION_CREATED",
        externalReference: "external-reference",
        checkoutId: "asaas-checkout",
        checkoutStatus: null,
        subscriptionId: "asaas-subscription",
        subscriptionStatus: "ACTIVE",
        paymentStatus: null,
      }),
    );

    const deferredCondition = conditions.find(
      ({ table, condition }) =>
        table === "billing_subscriptions" &&
        new PgDialect()
          .sqlToQuery(condition as SQL)
          .sql.includes('"providerEventAt" is null'),
    );
    expect(deferredCondition).toBeDefined();
    expect(
      new PgDialect().sqlToQuery(deferredCondition!.condition as SQL).sql,
    ).toContain('"providerEventAt" is null');
  });

  it("reconciles a deferred payment when refund state wins its compare-and-set", async () => {
    const checkout = {
      id: "checkout-row",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: "asaas-subscription",
      externalReference: "external-reference",
      status: "COMPLETED",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
    };
    const activeSnapshot = {
      id: "subscription-row",
      userId: "owner-a",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      providerEventAt: new Date("2026-10-22T10:00:00.000Z"),
      localCancellationAt: null,
      nextDueDate: "2026-11-22",
    };
    const refundedAfterRace = {
      ...activeSnapshot,
      status: "REFUNDED",
      providerEventAt: new Date("2026-10-22T12:01:00.000Z"),
    };
    const deferredRefund = {
      id: "deferred-refund",
      payload: { paymentStatus: "REFUNDED", nextDueDate: null },
      providerCreatedAt: new Date("2026-10-22T11:00:00.000Z"),
    };
    const { writes } = transactionMock(
      [
        [checkout],
        [activeSnapshot],
        [refundedAfterRace],
        [deferredRefund],
        [refundedAfterRace],
      ],
      [{ id: "event-row" }],
      [[{ id: "checkout-row" }], [], []],
      [[]],
    );

    await repository.receiveWebhook(
      webhookInput({
        eventType: "SUBSCRIPTION_CREATED",
        resourceId: "asaas-subscription",
        externalReference: "external-reference",
        checkoutId: "asaas-checkout",
        checkoutStatus: null,
        subscriptionId: "asaas-subscription",
        subscriptionStatus: "ACTIVE",
        paymentStatus: null,
      }),
    );

    expect(
      writes.find(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_webhook_events",
      )?.value,
    ).toHaveProperty("processedAt");
  });

  it("preserves a newer paid-through date when deferred payment fallback races cancellation", async () => {
    const localCancellationAt = new Date("2026-10-22T12:00:00.000Z");
    const checkout = {
      id: "checkout-row",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: "asaas-subscription",
      externalReference: "external-reference",
      status: "COMPLETED",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
    };
    const canceled = {
      id: "subscription-row",
      userId: "owner-a",
      providerSubscriptionId: "asaas-subscription",
      status: "CANCELED",
      providerEventAt: new Date("2026-10-22T11:50:00.000Z"),
      localCancellationAt,
      nextDueDate: "2027-01-22",
    };
    const deferredPayment = {
      id: "deferred-payment",
      payload: { paymentStatus: "ACTIVE", nextDueDate: "2026-12-22" },
      providerCreatedAt: new Date("2026-10-22T11:55:00.000Z"),
    };
    const { writes } = transactionMock(
      [[checkout], [canceled], [deferredPayment], [canceled]],
      [{ id: "event-row" }],
      [[{ id: "checkout-row" }], [], [{ id: "subscription-row" }]],
      [[]],
    );

    await repository.receiveWebhook(
      webhookInput({
        eventType: "SUBSCRIPTION_CREATED",
        resourceId: "asaas-subscription",
        externalReference: "external-reference",
        checkoutId: "asaas-checkout",
        checkoutStatus: null,
        subscriptionId: "asaas-subscription",
        subscriptionStatus: "ACTIVE",
        paymentStatus: null,
        nextDueDate: "2026-11-22",
        providerCreatedAt: new Date("2026-10-22T11:58:00.000Z"),
      }),
    );

    const updates = writes.filter(
      (write) =>
        write.operation === "update" && write.table === "billing_subscriptions",
    );
    expect(updates.at(-1)?.value).toMatchObject({
      nextDueDate: "2027-01-22",
      accessUntil: new Date("2027-01-22T23:59:59.999Z"),
    });
    expect(updates.at(-1)?.value).not.toHaveProperty("status");
  });

  it("fails retryably when the deferred paid-period fallback loses its compare-and-set", async () => {
    const localCancellationAt = new Date("2026-10-22T12:00:00.000Z");
    const checkout = {
      id: "checkout-row",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: "asaas-subscription",
      externalReference: "external-reference",
      status: "COMPLETED",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
    };
    const canceled = {
      id: "subscription-row",
      userId: "owner-a",
      providerSubscriptionId: "asaas-subscription",
      status: "CANCELED",
      providerEventAt: null,
      localCancellationAt,
      nextDueDate: "2026-11-22",
    };
    const deferredPayment = {
      id: "deferred-payment",
      payload: { paymentStatus: "ACTIVE", nextDueDate: "2026-12-22" },
      providerCreatedAt: new Date("2026-10-22T11:55:00.000Z"),
    };
    transactionMock(
      [[checkout], [canceled], [deferredPayment], [canceled]],
      [{ id: "event-row" }],
      [[{ id: "checkout-row" }], [], []],
    );

    await expect(
      repository.receiveWebhook(
        webhookInput({
          eventType: "SUBSCRIPTION_CREATED",
          externalReference: "external-reference",
          checkoutId: "asaas-checkout",
          checkoutStatus: null,
          subscriptionId: "asaas-subscription",
          subscriptionStatus: "ACTIVE",
          paymentStatus: null,
          nextDueDate: "2026-11-22",
          providerCreatedAt: new Date("2026-10-22T11:58:00.000Z"),
        }),
      ),
    ).rejects.toThrow(
      "Subscription changed during deferred cancellation reconciliation.",
    );
  });

  it("keeps the cancellation closed when a deferred payment was created after cancellation", async () => {
    const localCancellationAt = new Date("2026-10-22T12:00:00.000Z");
    const checkout = {
      id: "checkout-row",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: "asaas-subscription",
      externalReference: "external-reference",
      status: "COMPLETED",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
    };
    const activeSnapshot = {
      id: "subscription-row",
      userId: "owner-a",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      providerEventAt: new Date("2026-10-22T11:50:00.000Z"),
      localCancellationAt: null,
      nextDueDate: "2026-11-22",
    };
    const canceled = {
      ...activeSnapshot,
      status: "CANCELED",
      providerEventAt: new Date("2026-10-22T11:55:00.000Z"),
      localCancellationAt,
    };
    const deferredPayment = {
      id: "deferred-payment",
      payload: { paymentStatus: "ACTIVE", nextDueDate: "2026-12-22" },
      providerCreatedAt: new Date("2026-10-22T12:05:00.000Z"),
    };
    const { writes } = transactionMock(
      [[checkout], [activeSnapshot], [deferredPayment], [canceled]],
      [{ id: "event-row" }],
      [[{ id: "checkout-row" }], []],
    );

    await repository.receiveWebhook(
      webhookInput({
        eventType: "SUBSCRIPTION_CREATED",
        externalReference: "external-reference",
        checkoutId: "asaas-checkout",
        checkoutStatus: null,
        subscriptionId: "asaas-subscription",
        subscriptionStatus: "ACTIVE",
        paymentStatus: null,
        nextDueDate: "2026-11-22",
        providerCreatedAt: new Date("2026-10-22T11:58:00.000Z"),
      }),
    );

    expect(
      writes.find(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_subscriptions",
      )?.value,
    ).toMatchObject({ status: "ACTIVE" });
  });

  it("does not extend local-canceled access for a later payment that loses its CAS", async () => {
    const localCancellationAt = new Date("2026-10-22T12:00:00.000Z");
    const snapshot = {
      id: "subscription-row",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      providerEventAt: new Date("2026-10-22T11:50:00.000Z"),
      localCancellationAt: null,
      nextDueDate: "2026-11-22",
    };
    const canceled = {
      ...snapshot,
      status: "CANCELED",
      providerEventAt: null,
      localCancellationAt,
    };
    const { writes } = transactionMock(
      [[snapshot], [canceled]],
      [{ id: "event-row" }],
      [[], [{ id: "subscription-row" }]],
    );

    await repository.receiveWebhook(
      webhookInput({
        providerCreatedAt: new Date("2026-10-22T12:05:00.000Z"),
      }),
    );

    const reconciled = writes.find(
      (write) =>
        write.operation === "update" &&
        write.table === "billing_subscriptions" &&
        !(write.value as { status?: string }).status,
    );
    expect(reconciled?.value).not.toHaveProperty("nextDueDate");
    expect(reconciled?.value).toHaveProperty("providerEventAt");
  });

  it("uses a null provider-event compare-and-set when reconciling a pre-cancellation payment", async () => {
    const localCancellationAt = new Date("2026-10-22T12:00:00.000Z");
    const snapshot = {
      id: "subscription-row",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      providerEventAt: new Date("2026-10-22T11:50:00.000Z"),
      localCancellationAt: null,
      nextDueDate: "2026-11-22",
    };
    const canceled = {
      ...snapshot,
      status: "CANCELED",
      providerEventAt: null,
      localCancellationAt,
      nextDueDate: "2027-01-22",
    };
    const { conditions, writes } = transactionMock(
      [[snapshot], [canceled]],
      [{ id: "event-row" }],
      [[], [{ id: "subscription-row" }]],
    );

    await repository.receiveWebhook(
      webhookInput({
        providerCreatedAt: new Date("2026-10-22T11:55:00.000Z"),
      }),
    );

    const fallback = conditions
      .filter(({ table }) => table === "billing_subscriptions")
      .at(-1)?.condition as SQL;
    const query = new PgDialect().sqlToQuery(fallback);
    expect(query.sql).toContain('"providerEventAt" is null');
    expect(
      writes
        .filter(
          (write) =>
            write.operation === "update" &&
            write.table === "billing_subscriptions",
        )
        .at(-1)?.value,
    ).toMatchObject({
      nextDueDate: "2027-01-22",
      accessUntil: new Date("2027-01-22T23:59:59.999Z"),
    });
  });

  it("requires the direct refund update to win its compare-and-set", async () => {
    const { conditions } = transactionMock(
      [
        [
          {
            id: "subscription-row",
            providerSubscriptionId: "asaas-subscription",
            status: "ACTIVE",
            providerEventAt: null,
            localCancellationAt: null,
          },
        ],
      ],
      [{ id: "event-row" }],
      [[{ id: "subscription-row" }]],
    );

    await repository.receiveWebhook(
      webhookInput({ paymentStatus: "REFUNDED" }),
    );

    const condition = conditions.find(
      ({ table }) => table === "billing_subscriptions",
    )?.condition as SQL;
    expect(new PgDialect().sqlToQuery(condition).sql).toContain(
      '"providerEventAt" is null',
    );
  });

  it("keeps the terminal state found after a deferred payment loses its CAS", async () => {
    const checkout = {
      id: "checkout-row",
      userId: "owner-a",
      providerCheckoutId: "asaas-checkout",
      providerSubscriptionId: "asaas-subscription",
      externalReference: "external-reference",
      status: "COMPLETED",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
    };
    const activeSnapshot = {
      id: "subscription-row",
      userId: "owner-a",
      providerSubscriptionId: "asaas-subscription",
      status: "ACTIVE",
      providerEventAt: new Date("2026-10-22T10:00:00.000Z"),
      localCancellationAt: null,
      nextDueDate: "2026-11-22",
    };
    const refunded = {
      ...activeSnapshot,
      status: "CHARGEBACK",
      providerEventAt: new Date("2026-10-22T12:01:00.000Z"),
    };
    const deferredPayment = {
      id: "deferred-payment",
      payload: { paymentStatus: "REFUNDED", nextDueDate: null },
      providerCreatedAt: new Date("2026-10-22T11:30:00.000Z"),
    };
    const { writes } = transactionMock(
      [
        [checkout],
        [activeSnapshot],
        [activeSnapshot],
        [deferredPayment],
        [refunded],
      ],
      [{ id: "event-row" }],
      [[{ id: "checkout-row" }], []],
      [[]],
    );

    await repository.receiveWebhook(
      webhookInput({
        eventType: "SUBSCRIPTION_CREATED",
        externalReference: "external-reference",
        checkoutId: "asaas-checkout",
        checkoutStatus: null,
        subscriptionId: "asaas-subscription",
        subscriptionStatus: "ACTIVE",
        paymentStatus: null,
      }),
    );

    expect(
      writes.find(
        (write) =>
          write.operation === "update" &&
          write.table === "billing_webhook_events",
      )?.value,
    ).toHaveProperty("processedAt");
  });
});
