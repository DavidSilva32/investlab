import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  authUsers,
  billingCheckouts,
  billingSubscriptions,
  billingWebhookEvents,
} from "@/infrastructure/database/schema";

function isNewerProviderEvent(
  current: Date | null,
  incoming: Date | null,
  currentStatus: string | null,
  incomingStatus: string | null,
  kind: "checkout" | "subscription",
) {
  if (!incoming) return false;
  if (!current || incoming > current) return true;
  if (incoming < current || !incomingStatus || !currentStatus) return false;

  const priorities =
    kind === "checkout"
      ? {
          PENDING: 0,
          CANCELED: 1,
          EXPIRED: 1,
          PAID: 2,
          SUBSCRIPTION_CREATED: 2,
          COMPLETED: 3,
        }
      : { ACTIVE: 1, OVERDUE: 2, CANCELED: 3, REFUNDED: 4, CHARGEBACK: 5 };
  const currentPriority =
    priorities[currentStatus as keyof typeof priorities] ?? -1;
  const incomingPriority =
    priorities[incomingStatus as keyof typeof priorities] ?? -1;
  return incomingPriority > currentPriority;
}

function latestProviderEventAt(current: Date | null, incoming: Date | null) {
  if (!incoming) return current;
  if (!current || incoming > current) return incoming;
  return current;
}

export class BillingRepository {
  private async expireStalePendingCheckouts(userId: string, now: Date) {
    const expirationCutoff = new Date(now.getTime() - 60 * 60 * 1000);
    await getDatabaseClient()
      .update(billingCheckouts)
      .set({ status: "EXPIRED", updatedAt: now })
      .where(
        and(
          eq(billingCheckouts.userId, userId),
          eq(billingCheckouts.status, "PENDING"),
          isNotNull(billingCheckouts.providerCheckoutId),
          lte(billingCheckouts.updatedAt, expirationCutoff),
        ),
      );
  }

  async getCurrentOwnerProfile() {
    const userId = requireDataOwnerId();
    const [user] = await getDatabaseClient()
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
      })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .limit(1);
    return user ?? null;
  }

  async getCurrentOwnerSubscription() {
    const userId = requireDataOwnerId();
    const [subscription] = await getDatabaseClient()
      .select()
      .from(billingSubscriptions)
      .where(
        and(
          eq(billingSubscriptions.userId, userId),
          or(
            inArray(billingSubscriptions.status, [
              "PENDING",
              "ACTIVE",
              "OVERDUE",
            ]),
            and(
              eq(billingSubscriptions.status, "CANCELED"),
              gt(billingSubscriptions.accessUntil, new Date()),
            ),
          ),
        ),
      )
      .orderBy(desc(billingSubscriptions.createdAt))
      .limit(1);
    return subscription ?? null;
  }

  async getCurrentOwnerCheckout(now = new Date()) {
    const userId = requireDataOwnerId();
    await this.expireStalePendingCheckouts(userId, now);
    const [checkout] = await getDatabaseClient()
      .select()
      .from(billingCheckouts)
      .where(
        and(
          eq(billingCheckouts.userId, userId),
          inArray(billingCheckouts.status, [
            "PENDING",
            "PAID",
            "SUBSCRIPTION_CREATED",
          ]),
        ),
      )
      .orderBy(desc(billingCheckouts.createdAt))
      .limit(1);
    return checkout ?? null;
  }

  async getCheckoutConflictForPaidWebhook(input: {
    eventId: string;
    providerCheckoutId: string | null;
    externalReference: string | null;
    providerCreatedAt: Date;
    incomingStatus: "PAID" | "SUBSCRIPTION_CREATED" | "COMPLETED";
  }) {
    const database = getDatabaseClient();
    const [existingEvent] = await database
      .select({ id: billingWebhookEvents.id })
      .from(billingWebhookEvents)
      .where(eq(billingWebhookEvents.providerEventId, input.eventId))
      .limit(1);
    if (existingEvent) return null;

    const [checkout] = await database
      .select()
      .from(billingCheckouts)
      .where(
        input.providerCheckoutId
          ? eq(billingCheckouts.providerCheckoutId, input.providerCheckoutId)
          : eq(billingCheckouts.externalReference, input.externalReference!),
      )
      .limit(1);
    if (!checkout) return null;
    const incomingStatus =
      checkout.status === "SUBSCRIPTION_CREATED" &&
      input.incomingStatus === "PAID"
        ? "COMPLETED"
        : input.incomingStatus;
    if (
      !isNewerProviderEvent(
        checkout.providerEventAt,
        input.providerCreatedAt,
        checkout.status,
        incomingStatus,
        "checkout",
      )
    )
      return null;

    const [competitor] = await database
      .select()
      .from(billingCheckouts)
      .where(
        and(
          eq(billingCheckouts.userId, checkout.userId),
          sql`${billingCheckouts.id} <> ${checkout.id}`,
          inArray(billingCheckouts.status, [
            "PENDING",
            "PAID",
            "SUBSCRIPTION_CREATED",
          ]),
        ),
      )
      .limit(1);
    return competitor ?? null;
  }

  async reserveCheckout(
    input: {
      externalReference: string;
      billingType: "CREDIT_CARD";
      amountCents: number;
    },
    now = new Date(),
  ) {
    const userId = requireDataOwnerId();
    await this.expireStalePendingCheckouts(userId, now);
    const [row] = await getDatabaseClient()
      .insert(billingCheckouts)
      .values({
        userId,
        externalReference: input.externalReference,
        billingType: input.billingType,
        amountCents: input.amountCents,
      })
      .returning();
    return row;
  }

  async attachProviderCheckout(input: {
    externalReference: string;
    providerCheckoutId: string;
    checkoutUrl: string;
  }) {
    const [row] = await getDatabaseClient()
      .update(billingCheckouts)
      .set({
        providerCheckoutId: input.providerCheckoutId,
        checkoutUrl: input.checkoutUrl,
        updatedAt: new Date(),
      })
      .where(eq(billingCheckouts.externalReference, input.externalReference))
      .returning();
    return row ?? null;
  }

  async abandonCheckout(externalReference: string) {
    const userId = requireDataOwnerId();
    await getDatabaseClient()
      .update(billingCheckouts)
      .set({ status: "CANCELED", updatedAt: new Date() })
      .where(
        and(
          eq(billingCheckouts.userId, userId),
          eq(billingCheckouts.externalReference, externalReference),
          eq(billingCheckouts.status, "PENDING"),
        ),
      );
  }

  async cancelCurrentOwnerSubscription(providerSubscriptionId: string) {
    const userId = requireDataOwnerId();
    const [row] = await getDatabaseClient()
      .select({ id: billingSubscriptions.id })
      .from(billingSubscriptions)
      .where(
        and(
          eq(billingSubscriptions.userId, userId),
          eq(
            billingSubscriptions.providerSubscriptionId,
            providerSubscriptionId,
          ),
          inArray(billingSubscriptions.status, [
            "PENDING",
            "ACTIVE",
            "OVERDUE",
          ]),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async markCanceled(providerSubscriptionId: string, canceledAt = new Date()) {
    await getDatabaseClient()
      .update(billingSubscriptions)
      .set({
        status: "CANCELED",
        localCancellationAt: canceledAt,
        updatedAt: canceledAt,
      })
      .where(
        and(
          eq(
            billingSubscriptions.providerSubscriptionId,
            providerSubscriptionId,
          ),
          inArray(billingSubscriptions.status, [
            "PENDING",
            "ACTIVE",
            "OVERDUE",
          ]),
        ),
      );
  }

  async cancelCheckout(providerCheckoutId: string) {
    const userId = requireDataOwnerId();
    await getDatabaseClient()
      .update(billingCheckouts)
      .set({ status: "CANCELED", updatedAt: new Date() })
      .where(
        and(
          eq(billingCheckouts.userId, userId),
          eq(billingCheckouts.providerCheckoutId, providerCheckoutId),
          eq(billingCheckouts.status, "PENDING"),
        ),
      );
  }

  async hasPaidAccess(userId: string, now = new Date()) {
    const [row] = await getDatabaseClient()
      .select({ id: billingSubscriptions.id })
      .from(billingSubscriptions)
      .where(
        and(
          eq(billingSubscriptions.userId, userId),
          inArray(billingSubscriptions.status, ["ACTIVE", "CANCELED"]),
          gt(billingSubscriptions.accessUntil, now),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async receiveWebhook(input: {
    eventId: string;
    eventType: string;
    resourceId: string | null;
    externalReference: string | null;
    checkoutId: string | null;
    checkoutStatus: "PAID" | "CANCELED" | "EXPIRED" | null;
    subscriptionId: string | null;
    subscriptionStatus: "ACTIVE" | "CANCELED" | null;
    paymentStatus: "ACTIVE" | "OVERDUE" | "REFUNDED" | "CHARGEBACK" | null;
    nextDueDate: string | null;
    paymentDueDate: string | null;
    providerCreatedAt: Date | null;
    payload: Record<string, unknown>;
    competingCheckoutToCancelId?: string | null;
  }) {
    const mutatesState = Boolean(
      input.checkoutStatus ||
      input.subscriptionStatus ||
      input.paymentStatus ||
      input.eventType === "SUBSCRIPTION_CREATED",
    );
    if (
      mutatesState &&
      (!input.providerCreatedAt ||
        Number.isNaN(input.providerCreatedAt.getTime()))
    ) {
      throw new Error("Asaas state event is missing a valid creation date.");
    }

    const database = getDatabaseClient();
    return database.transaction(async (transaction) => {
      const eventTime = new Date();
      const [received] = await transaction
        .insert(billingWebhookEvents)
        .values({
          providerEventId: input.eventId,
          eventType: input.eventType,
          resourceId: input.resourceId,
          payload: input.payload,
          providerCreatedAt: input.providerCreatedAt,
          receivedAt: eventTime,
          processedAt: null,
        })
        .onConflictDoNothing()
        .returning({ id: billingWebhookEvents.id });
      if (!received) return { duplicate: true, matched: true };

      let checkout = null;
      if (input.checkoutId || input.externalReference) {
        const [row] = await transaction
          .select()
          .from(billingCheckouts)
          .where(
            input.checkoutId
              ? eq(billingCheckouts.providerCheckoutId, input.checkoutId)
              : eq(
                  billingCheckouts.externalReference,
                  input.externalReference!,
                ),
          )
          .limit(1);
        checkout = row ?? null;
      }

      const activationEvent =
        input.eventType === "SUBSCRIPTION_CREATED" ||
        input.subscriptionStatus === "ACTIVE";
      if (activationEvent && !checkout) {
        const [knownSubscription] = input.subscriptionId
          ? await transaction
              .select()
              .from(billingSubscriptions)
              .where(
                eq(
                  billingSubscriptions.providerSubscriptionId,
                  input.subscriptionId,
                ),
              )
              .limit(1)
          : [];
        if (!knownSubscription)
          throw new Error(
            "Asaas activation event cannot be correlated to a known checkout or subscription.",
          );
      }

      if (checkout) {
        if (input.competingCheckoutToCancelId) {
          const [canceledCompetitor] = await transaction
            .update(billingCheckouts)
            .set({ status: "CANCELED", updatedAt: eventTime })
            .where(
              and(
                eq(billingCheckouts.id, input.competingCheckoutToCancelId),
                eq(billingCheckouts.userId, checkout.userId),
                inArray(billingCheckouts.status, [
                  "PENDING",
                  "CANCELED",
                  "EXPIRED",
                ]),
              ),
            )
            .returning({ id: billingCheckouts.id });
          if (!canceledCompetitor)
            throw new Error(
              "Competing checkout changed before payment reconciliation.",
            );
        }
        const subscriptionCreated =
          checkout.status === "SUBSCRIPTION_CREATED" ||
          input.eventType === "SUBSCRIPTION_CREATED" ||
          input.subscriptionStatus === "ACTIVE";
        const nextCheckoutStatus =
          input.checkoutStatus ??
          (input.eventType === "SUBSCRIPTION_CREATED" ||
          input.subscriptionStatus === "ACTIVE"
            ? "SUBSCRIPTION_CREATED"
            : null);
        if (nextCheckoutStatus) {
          const nextStatus =
            checkout.status === "COMPLETED"
              ? "COMPLETED"
              : input.checkoutStatus === "CANCELED" ||
                  input.checkoutStatus === "EXPIRED"
                ? input.checkoutStatus
                : input.checkoutStatus === "PAID" &&
                    checkout.status === "SUBSCRIPTION_CREATED"
                  ? "COMPLETED"
                  : input.eventType === "SUBSCRIPTION_CREATED" &&
                      checkout.status === "PAID"
                    ? "COMPLETED"
                    : nextCheckoutStatus;
          const eventIsNewer = isNewerProviderEvent(
            checkout.providerEventAt ?? null,
            input.providerCreatedAt,
            checkout.status,
            nextStatus,
            "checkout",
          );
          const status = eventIsNewer ? nextStatus : checkout.status;
          const [checkoutUpdated] = await transaction
            .update(billingCheckouts)
            .set({
              ...(eventIsNewer && input.checkoutId
                ? { providerCheckoutId: input.checkoutId }
                : {}),
              ...(eventIsNewer && input.subscriptionId
                ? { providerSubscriptionId: input.subscriptionId }
                : {}),
              ...(eventIsNewer && input.nextDueDate
                ? { nextDueDate: input.nextDueDate }
                : {}),
              ...(eventIsNewer
                ? {
                    status,
                    providerEventAt: latestProviderEventAt(
                      checkout.providerEventAt ?? null,
                      input.providerCreatedAt,
                    ),
                  }
                : {}),
              updatedAt: eventTime,
            })
            .where(
              and(
                eq(billingCheckouts.id, checkout.id),
                eq(billingCheckouts.status, checkout.status),
                checkout.providerEventAt
                  ? eq(
                      billingCheckouts.providerEventAt,
                      checkout.providerEventAt,
                    )
                  : isNull(billingCheckouts.providerEventAt),
              ),
            )
            .returning({ id: billingCheckouts.id });
          if (checkoutUpdated) {
            checkout = {
              ...checkout,
              status,
              providerEventAt: eventIsNewer
                ? latestProviderEventAt(
                    checkout.providerEventAt ?? null,
                    input.providerCreatedAt,
                  )
                : checkout.providerEventAt,
              providerCheckoutId: eventIsNewer
                ? (input.checkoutId ?? checkout.providerCheckoutId)
                : checkout.providerCheckoutId,
              providerSubscriptionId: eventIsNewer
                ? (input.subscriptionId ?? checkout.providerSubscriptionId)
                : checkout.providerSubscriptionId,
              nextDueDate: eventIsNewer
                ? (input.nextDueDate ?? checkout.nextDueDate)
                : checkout.nextDueDate,
            };
          } else {
            const [latestCheckout] = await transaction
              .select()
              .from(billingCheckouts)
              .where(eq(billingCheckouts.id, checkout.id))
              .limit(1);
            if (!latestCheckout)
              throw new Error(
                "Checkout disappeared during webhook reconciliation.",
              );
            if (
              eventIsNewer &&
              (status === "PAID" || status === "COMPLETED") &&
              latestCheckout.status !== "PAID" &&
              latestCheckout.status !== "COMPLETED"
            )
              throw new Error(
                "Checkout changed during webhook reconciliation.",
              );
            checkout = latestCheckout;
          }
        } else if (input.checkoutId) {
          await transaction
            .update(billingCheckouts)
            .set({ providerCheckoutId: input.checkoutId, updatedAt: eventTime })
            .where(eq(billingCheckouts.id, checkout.id));
          checkout = { ...checkout, providerCheckoutId: input.checkoutId };
        }

        const checkoutPaid =
          checkout.status === "PAID" || checkout.status === "COMPLETED";
        const subscriptionId =
          input.subscriptionId ?? checkout.providerSubscriptionId;
        // Reservations no longer store the synthetic first checkout date. A persisted date here
        // can only have come from a provider-confirmed webhook or API lookup.
        const nextDueDate = input.nextDueDate ?? checkout.nextDueDate;
        if (
          checkoutPaid &&
          subscriptionId &&
          nextDueDate &&
          subscriptionCreated
        ) {
          const [currentSubscription] = await transaction
            .select()
            .from(billingSubscriptions)
            .where(
              eq(billingSubscriptions.providerSubscriptionId, subscriptionId),
            )
            .limit(1);
          let lastAppliedProviderEventAt =
            currentSubscription?.providerEventAt ?? input.providerCreatedAt;
          let lastAppliedStatus = currentSubscription?.status ?? null;
          let lastAppliedNextDueDate: string | null =
            currentSubscription?.nextDueDate ?? nextDueDate;
          const canceledLocally =
            currentSubscription?.localCancellationAt != null;
          const providerCanceledSubscription =
            currentSubscription?.status === "CANCELED" && !canceledLocally;
          const terminalSubscription =
            currentSubscription?.status === "REFUNDED" ||
            currentSubscription?.status === "CHARGEBACK";
          if (
            !canceledLocally &&
            !providerCanceledSubscription &&
            !terminalSubscription &&
            isNewerProviderEvent(
              currentSubscription?.providerEventAt ?? null,
              input.providerCreatedAt,
              currentSubscription?.status ?? null,
              "ACTIVE",
              "subscription",
            )
          ) {
            const accessUntil = new Date(`${nextDueDate}T23:59:59.999Z`);
            const [upserted] = await transaction
              .insert(billingSubscriptions)
              .values({
                userId: checkout.userId,
                provider: "ASAAS",
                providerSubscriptionId: subscriptionId,
                status: "ACTIVE",
                billingType: checkout.billingType,
                amountCents: checkout.amountCents,
                nextDueDate,
                accessUntil,
                providerEventAt: input.providerCreatedAt,
              })
              .onConflictDoUpdate({
                target: [
                  billingSubscriptions.provider,
                  billingSubscriptions.providerSubscriptionId,
                ],
                set: {
                  status: "ACTIVE",
                  nextDueDate,
                  accessUntil,
                  providerEventAt: input.providerCreatedAt,
                  updatedAt: eventTime,
                },
                setWhere: and(
                  isNull(billingSubscriptions.localCancellationAt),
                  currentSubscription?.status
                    ? eq(
                        billingSubscriptions.status,
                        currentSubscription.status,
                      )
                    : isNull(billingSubscriptions.status),
                  currentSubscription?.providerEventAt
                    ? eq(
                        billingSubscriptions.providerEventAt,
                        currentSubscription.providerEventAt,
                      )
                    : isNull(billingSubscriptions.providerEventAt),
                  notInArray(billingSubscriptions.status, [
                    "CANCELED",
                    "REFUNDED",
                    "CHARGEBACK",
                  ]),
                ),
              })
              .returning({ id: billingSubscriptions.id });
            if (upserted) {
              lastAppliedProviderEventAt = latestProviderEventAt(
                currentSubscription?.providerEventAt ?? null,
                input.providerCreatedAt,
              );
              lastAppliedStatus = "ACTIVE";
              lastAppliedNextDueDate = nextDueDate;
            } else {
              const [latestSubscription] = await transaction
                .select()
                .from(billingSubscriptions)
                .where(
                  eq(
                    billingSubscriptions.providerSubscriptionId,
                    subscriptionId,
                  ),
                )
                .limit(1);
              if (!latestSubscription)
                throw new Error(
                  "Subscription disappeared during activation reconciliation.",
                );
              lastAppliedProviderEventAt =
                latestSubscription.providerEventAt ?? null;
              lastAppliedStatus = latestSubscription.status;
              lastAppliedNextDueDate = latestSubscription.nextDueDate;
            }
          }
          await transaction
            .update(billingCheckouts)
            .set({ status: "COMPLETED", updatedAt: eventTime })
            .where(eq(billingCheckouts.id, checkout.id));
          checkout = { ...checkout, status: "COMPLETED" };
          const deferredPayments = await transaction
            .select()
            .from(billingWebhookEvents)
            .where(
              and(
                eq(billingWebhookEvents.resourceId, subscriptionId),
                isNull(billingWebhookEvents.processedAt),
              ),
            )
            .orderBy(
              asc(billingWebhookEvents.providerCreatedAt),
              asc(billingWebhookEvents.receivedAt),
            );
          for (const deferred of deferredPayments) {
            const paymentStatus = deferred.payload.paymentStatus;
            if (
              paymentStatus === "ACTIVE" ||
              paymentStatus === "OVERDUE" ||
              paymentStatus === "REFUNDED" ||
              paymentStatus === "CHARGEBACK"
            ) {
              const nextStatus = paymentStatus;
              const deferredDueDate = deferred.payload.nextDueDate;
              const paidBeforeLocalCancellation =
                canceledLocally &&
                currentSubscription?.status === "CANCELED" &&
                paymentStatus === "ACTIVE" &&
                currentSubscription.localCancellationAt &&
                deferred.providerCreatedAt &&
                deferred.providerCreatedAt <
                  currentSubscription.localCancellationAt &&
                typeof deferredDueDate === "string";
              const deferredEventIsNewer =
                paidBeforeLocalCancellation ||
                (lastAppliedStatus === "CANCELED" &&
                  (paymentStatus === "REFUNDED" ||
                    paymentStatus === "CHARGEBACK")) ||
                (!(lastAppliedStatus === "CANCELED" && !canceledLocally) &&
                  !(
                    canceledLocally &&
                    (paymentStatus === "ACTIVE" || paymentStatus === "OVERDUE")
                  ) &&
                  !(
                    (lastAppliedStatus === "REFUNDED" ||
                      lastAppliedStatus === "CHARGEBACK") &&
                    (paymentStatus === "ACTIVE" || paymentStatus === "OVERDUE")
                  ) &&
                  isNewerProviderEvent(
                    lastAppliedProviderEventAt,
                    deferred.providerCreatedAt,
                    lastAppliedStatus,
                    paymentStatus,
                    "subscription",
                  ));
              if (deferredEventIsNewer) {
                const paidNextDueDate =
                  paidBeforeLocalCancellation &&
                  typeof deferredDueDate === "string" &&
                  lastAppliedNextDueDate &&
                  deferredDueDate < lastAppliedNextDueDate
                    ? lastAppliedNextDueDate
                    : deferredDueDate;
                const accessUntil =
                  (paidBeforeLocalCancellation || paymentStatus === "ACTIVE") &&
                  typeof paidNextDueDate === "string"
                    ? new Date(`${paidNextDueDate}T23:59:59.999Z`)
                    : undefined;
                const deferredConditions = [
                  eq(
                    billingSubscriptions.providerSubscriptionId,
                    subscriptionId,
                  ),
                ];
                deferredConditions.push(
                  eq(billingSubscriptions.status, lastAppliedStatus!),
                  lastAppliedProviderEventAt
                    ? eq(
                        billingSubscriptions.providerEventAt,
                        lastAppliedProviderEventAt,
                      )
                    : isNull(billingSubscriptions.providerEventAt),
                  currentSubscription?.localCancellationAt
                    ? eq(
                        billingSubscriptions.localCancellationAt,
                        currentSubscription.localCancellationAt,
                      )
                    : isNull(billingSubscriptions.localCancellationAt),
                );
                if (
                  (paymentStatus === "ACTIVE" || paymentStatus === "OVERDUE") &&
                  canceledLocally &&
                  currentSubscription?.localCancellationAt
                ) {
                  deferredConditions.push(
                    eq(
                      billingSubscriptions.localCancellationAt,
                      currentSubscription.localCancellationAt,
                    ),
                    eq(billingSubscriptions.status, "CANCELED"),
                  );
                } else if (
                  paymentStatus === "ACTIVE" ||
                  paymentStatus === "OVERDUE"
                ) {
                  deferredConditions.push(
                    isNull(billingSubscriptions.localCancellationAt),
                    notInArray(billingSubscriptions.status, [
                      "CANCELED",
                      "REFUNDED",
                      "CHARGEBACK",
                    ]),
                  );
                }
                const [updated] = await transaction
                  .update(billingSubscriptions)
                  .set({
                    status: paidBeforeLocalCancellation
                      ? "CANCELED"
                      : nextStatus,
                    ...(typeof paidNextDueDate === "string"
                      ? { nextDueDate: paidNextDueDate }
                      : {}),
                    ...(accessUntil ? { accessUntil } : {}),
                    providerEventAt: latestProviderEventAt(
                      lastAppliedProviderEventAt,
                      deferred.providerCreatedAt,
                    ),
                    updatedAt: eventTime,
                  })
                  .where(and(...deferredConditions))
                  .returning({ id: billingSubscriptions.id });
                let deferredAppliedStatus = paidBeforeLocalCancellation
                  ? "CANCELED"
                  : nextStatus;
                if (!updated) {
                  const [latest] = await transaction
                    .select()
                    .from(billingSubscriptions)
                    .where(
                      eq(
                        billingSubscriptions.providerSubscriptionId,
                        subscriptionId,
                      ),
                    )
                    .limit(1);
                  if (
                    latest?.localCancellationAt &&
                    latest.status === "CANCELED"
                  ) {
                    if (
                      paymentStatus === "REFUNDED" ||
                      paymentStatus === "CHARGEBACK"
                    ) {
                      const [revoked] = await transaction
                        .update(billingSubscriptions)
                        .set({
                          status: paymentStatus,
                          providerEventAt: latestProviderEventAt(
                            latest.providerEventAt ?? null,
                            deferred.providerCreatedAt,
                          ),
                          updatedAt: eventTime,
                        })
                        .where(
                          and(
                            eq(
                              billingSubscriptions.providerSubscriptionId,
                              subscriptionId,
                            ),
                            eq(billingSubscriptions.status, "CANCELED"),
                            eq(
                              billingSubscriptions.localCancellationAt,
                              latest.localCancellationAt,
                            ),
                            latest.providerEventAt
                              ? eq(
                                  billingSubscriptions.providerEventAt,
                                  latest.providerEventAt,
                                )
                              : isNull(billingSubscriptions.providerEventAt),
                          ),
                        )
                        .returning({ id: billingSubscriptions.id });
                      if (!revoked)
                        throw new Error(
                          "Subscription changed during deferred terminal reconciliation.",
                        );
                      deferredAppliedStatus = paymentStatus;
                    } else {
                      const deferredPaidBeforeCancel =
                        paymentStatus === "ACTIVE" &&
                        deferred.providerCreatedAt &&
                        deferred.providerCreatedAt <
                          latest.localCancellationAt &&
                        typeof deferredDueDate === "string";
                      if (deferredPaidBeforeCancel) {
                        const preservedDueDate =
                          latest.nextDueDate &&
                          latest.nextDueDate > deferredDueDate
                            ? latest.nextDueDate
                            : deferredDueDate;
                        const [preserved] = await transaction
                          .update(billingSubscriptions)
                          .set({
                            nextDueDate: preservedDueDate,
                            accessUntil: new Date(
                              `${preservedDueDate}T23:59:59.999Z`,
                            ),
                            providerEventAt: latestProviderEventAt(
                              latest.providerEventAt ?? null,
                              deferred.providerCreatedAt,
                            ),
                            updatedAt: eventTime,
                          })
                          .where(
                            and(
                              eq(
                                billingSubscriptions.providerSubscriptionId,
                                subscriptionId,
                              ),
                              eq(
                                billingSubscriptions.localCancellationAt,
                                latest.localCancellationAt,
                              ),
                              eq(billingSubscriptions.status, "CANCELED"),
                              latest.providerEventAt
                                ? eq(
                                    billingSubscriptions.providerEventAt,
                                    latest.providerEventAt,
                                  )
                                : isNull(billingSubscriptions.providerEventAt),
                            ),
                          )
                          .returning({ id: billingSubscriptions.id });
                        if (!preserved)
                          throw new Error(
                            "Subscription changed during deferred cancellation reconciliation.",
                          );
                      }
                      deferredAppliedStatus = "CANCELED";
                    }
                  } else if (
                    latest?.status === "REFUNDED" ||
                    latest?.status === "CHARGEBACK"
                  ) {
                    deferredAppliedStatus = latest.status;
                  } else {
                    throw new Error(
                      "Subscription changed during deferred payment reconciliation.",
                    );
                  }
                }
                lastAppliedProviderEventAt = latestProviderEventAt(
                  lastAppliedProviderEventAt,
                  deferred.providerCreatedAt,
                );
                lastAppliedStatus = deferredAppliedStatus;
                if (typeof paidNextDueDate === "string")
                  lastAppliedNextDueDate = paidNextDueDate;
              }
              await transaction
                .update(billingWebhookEvents)
                .set({ processedAt: eventTime })
                .where(eq(billingWebhookEvents.id, deferred.id));
            }
          }
        }
      }

      let subscriptionMatched = false;
      if (input.subscriptionId && input.paymentStatus) {
        const [current] = await transaction
          .select()
          .from(billingSubscriptions)
          .where(
            eq(
              billingSubscriptions.providerSubscriptionId,
              input.subscriptionId,
            ),
          )
          .limit(1);
        if (current) {
          subscriptionMatched = true;
          const terminalRevocationOverridesCancel =
            current.status === "CANCELED" &&
            (input.paymentStatus === "REFUNDED" ||
              input.paymentStatus === "CHARGEBACK");
          const providerCancellationBlocksReactivation =
            current.status === "CANCELED" &&
            current.localCancellationAt == null &&
            (input.paymentStatus === "ACTIVE" ||
              input.paymentStatus === "OVERDUE");
          const eventIsNewer =
            terminalRevocationOverridesCancel ||
            (!providerCancellationBlocksReactivation &&
              isNewerProviderEvent(
                current.providerEventAt,
                input.providerCreatedAt,
                current.status,
                input.paymentStatus,
                "subscription",
              ) &&
              !(
                (current.status === "REFUNDED" ||
                  current.status === "CHARGEBACK") &&
                (input.paymentStatus === "ACTIVE" ||
                  input.paymentStatus === "OVERDUE")
              ));
          if (eventIsNewer) {
            const canceledLocally = current.localCancellationAt != null;
            let status = input.paymentStatus;
            if (status === "ACTIVE" || status === "OVERDUE") {
              if (
                status === "OVERDUE" &&
                current.status === "ACTIVE" &&
                current.nextDueDate &&
                input.paymentDueDate &&
                input.paymentDueDate < current.nextDueDate
              )
                status = "ACTIVE";
              const nextDueDate =
                current.nextDueDate &&
                input.nextDueDate &&
                input.nextDueDate < current.nextDueDate
                  ? current.nextDueDate
                  : input.nextDueDate;
              const accessUntil =
                status === "ACTIVE" && nextDueDate
                  ? new Date(`${nextDueDate}T23:59:59.999Z`)
                  : undefined;
              const paidBeforeCancellation =
                canceledLocally &&
                status === "ACTIVE" &&
                current.localCancellationAt &&
                input.providerCreatedAt &&
                input.providerCreatedAt < current.localCancellationAt &&
                nextDueDate;
              const updateValue = canceledLocally
                ? {
                    ...(paidBeforeCancellation && nextDueDate
                      ? { nextDueDate, accessUntil }
                      : {}),
                    providerEventAt: latestProviderEventAt(
                      current.providerEventAt,
                      input.providerCreatedAt,
                    ),
                    updatedAt: eventTime,
                  }
                : {
                    status,
                    ...(nextDueDate ? { nextDueDate } : {}),
                    ...(accessUntil ? { accessUntil } : {}),
                    providerEventAt: input.providerCreatedAt!,
                    updatedAt: eventTime,
                  };
              const guardedConditions = [
                eq(
                  billingSubscriptions.providerSubscriptionId,
                  input.subscriptionId,
                ),
                canceledLocally && current.localCancellationAt
                  ? eq(
                      billingSubscriptions.localCancellationAt,
                      current.localCancellationAt,
                    )
                  : isNull(billingSubscriptions.localCancellationAt),
                current.providerEventAt
                  ? eq(
                      billingSubscriptions.providerEventAt,
                      current.providerEventAt,
                    )
                  : isNull(billingSubscriptions.providerEventAt),
              ];
              if (canceledLocally)
                guardedConditions.push(
                  eq(billingSubscriptions.status, "CANCELED"),
                );
              if (!canceledLocally)
                guardedConditions.push(
                  notInArray(billingSubscriptions.status, [
                    "REFUNDED",
                    "CHARGEBACK",
                  ]),
                );
              const [updated] = await transaction
                .update(billingSubscriptions)
                .set(updateValue)
                .where(and(...guardedConditions))
                .returning({ id: billingSubscriptions.id });
              if (!updated) {
                const [latest] = await transaction
                  .select()
                  .from(billingSubscriptions)
                  .where(
                    eq(
                      billingSubscriptions.providerSubscriptionId,
                      input.subscriptionId,
                    ),
                  )
                  .limit(1);
                if (
                  latest?.localCancellationAt &&
                  latest.status === "CANCELED"
                ) {
                  const paidBeforeCancellation =
                    status === "ACTIVE" &&
                    input.providerCreatedAt &&
                    input.providerCreatedAt < latest.localCancellationAt &&
                    input.nextDueDate;
                  const reconciledDueDate = paidBeforeCancellation
                    ? latest.nextDueDate &&
                      latest.nextDueDate > input.nextDueDate!
                      ? latest.nextDueDate
                      : input.nextDueDate!
                    : undefined;
                  const [reconciled] = await transaction
                    .update(billingSubscriptions)
                    .set({
                      ...(reconciledDueDate
                        ? {
                            nextDueDate: reconciledDueDate,
                            accessUntil: new Date(
                              `${reconciledDueDate}T23:59:59.999Z`,
                            ),
                          }
                        : {}),
                      providerEventAt: latestProviderEventAt(
                        latest.providerEventAt ?? null,
                        input.providerCreatedAt,
                      ),
                      updatedAt: eventTime,
                    })
                    .where(
                      and(
                        eq(
                          billingSubscriptions.providerSubscriptionId,
                          input.subscriptionId,
                        ),
                        eq(
                          billingSubscriptions.localCancellationAt,
                          latest.localCancellationAt,
                        ),
                        eq(billingSubscriptions.status, "CANCELED"),
                        latest.providerEventAt
                          ? eq(
                              billingSubscriptions.providerEventAt,
                              latest.providerEventAt,
                            )
                          : isNull(billingSubscriptions.providerEventAt),
                      ),
                    )
                    .returning({ id: billingSubscriptions.id });
                  if (!reconciled)
                    throw new Error(
                      "Subscription changed during local cancellation reconciliation.",
                    );
                } else if (!latest) {
                  throw new Error(
                    "Subscription disappeared during payment reconciliation.",
                  );
                } else if (
                  latest.status !== "REFUNDED" &&
                  latest.status !== "CHARGEBACK"
                ) {
                  throw new Error(
                    "Subscription changed during payment reconciliation.",
                  );
                }
              }
            } else {
              const eventConditions = [
                eq(
                  billingSubscriptions.providerSubscriptionId,
                  input.subscriptionId,
                ),
                eq(billingSubscriptions.status, current.status),
                current.providerEventAt
                  ? eq(
                      billingSubscriptions.providerEventAt,
                      current.providerEventAt,
                    )
                  : isNull(billingSubscriptions.providerEventAt),
              ];
              const [updated] = await transaction
                .update(billingSubscriptions)
                .set({
                  status,
                  providerEventAt: latestProviderEventAt(
                    current.providerEventAt,
                    input.providerCreatedAt,
                  ),
                  updatedAt: eventTime,
                })
                .where(and(...eventConditions))
                .returning({ id: billingSubscriptions.id });
              if (!updated)
                throw new Error(
                  "Subscription changed during terminal payment reconciliation.",
                );
            }
          }
        }
      }
      if (input.subscriptionId && input.subscriptionStatus === "CANCELED") {
        const [current] = await transaction
          .select()
          .from(billingSubscriptions)
          .where(
            eq(
              billingSubscriptions.providerSubscriptionId,
              input.subscriptionId,
            ),
          )
          .limit(1);
        const eventIsNewer = isNewerProviderEvent(
          current?.providerEventAt ?? null,
          input.providerCreatedAt,
          current?.status ?? null,
          "CANCELED",
          "subscription",
        );
        if (
          current &&
          current.status !== "REFUNDED" &&
          current.status !== "CHARGEBACK" &&
          eventIsNewer
        ) {
          await transaction
            .update(billingSubscriptions)
            .set({
              status: "CANCELED",
              providerEventAt: input.providerCreatedAt!,
              updatedAt: eventTime,
            })
            .where(
              and(
                eq(
                  billingSubscriptions.providerSubscriptionId,
                  input.subscriptionId,
                ),
                notInArray(billingSubscriptions.status, [
                  "REFUNDED",
                  "CHARGEBACK",
                ]),
              ),
            );
        }
      }

      const pendingPayment = Boolean(
        input.subscriptionId && input.paymentStatus && !subscriptionMatched,
      );
      // A subscription lifecycle event without a locally correlated checkout is
      // inapplicable to this account and is acknowledged. Payment events may
      // precede subscription creation, so keep those for correlation later.
      const shouldRetryOnNextEvent = pendingPayment;
      if (!shouldRetryOnNextEvent) {
        await transaction
          .update(billingWebhookEvents)
          .set({ processedAt: eventTime })
          .where(eq(billingWebhookEvents.id, received.id));
      }
      return {
        duplicate: false,
        matched: !shouldRetryOnNextEvent,
        deferred: shouldRetryOnNextEvent,
      };
    });
  }
}

export const billingRepository = new BillingRepository();
