import { addDays, format } from "date-fns";
import { randomUUID } from "node:crypto";
import { ApplicationError } from "@/backend/errors/application-error";
import { billingRepository } from "@/backend/repositories/billing.repository";
import { asaasProvider } from "@/backend/providers/asaas.provider";

const billingTypes = ["CREDIT_CARD"] as const;
type BillingType = (typeof billingTypes)[number];

function getAmountCents() {
  const raw = process.env.ASAAS_SUBSCRIPTION_AMOUNT_CENTS;
  if (!raw || !/^\d+$/.test(raw)) return null;
  const amount = Number(raw);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function isConfigured() {
  const enabled = process.env.ASAAS_BILLING_ENABLED === "true";
  const keyConfigured = Boolean(process.env.ASAAS_API_KEY);
  const amountConfigured = getAmountCents() !== null;
  const productionApproved =
    process.env.ASAAS_ENVIRONMENT !== "production" ||
    process.env.ASAAS_LIVE_BILLING_APPROVED === "true";
  return enabled && keyConfigured && amountConfigured && productionApproved;
}

export function parseAsaasDateCreated(value?: string) {
  if (!value) return null;
  const asaasFormat = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    value,
  );
  if (asaasFormat) {
    const [, year, month, day, hour, minute, second] = asaasFormat;
    const parts = [year, month, day, hour, minute, second].map(Number);
    // Asaas examples omit a timezone; interpret this documented wire format as
    // UTC so event ordering is deterministic on every server/runtime.
    const parsed = new Date(
      Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]),
    );
    if (
      parsed.getUTCFullYear() !== parts[0] ||
      parsed.getUTCMonth() + 1 !== parts[1] ||
      parsed.getUTCDate() !== parts[2] ||
      parsed.getUTCHours() !== parts[3] ||
      parsed.getUTCMinutes() !== parts[4] ||
      parsed.getUTCSeconds() !== parts[5]
    )
      return null;
    return parsed;
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(year, month - 1, day);
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() + 1 !== month ||
    calendarDate.getUTCDate() !== day
  )
    return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export class BillingService {
  async getCurrentOwnerBilling() {
    const [profile, subscription, checkout] = await Promise.all([
      billingRepository.getCurrentOwnerProfile(),
      billingRepository.getCurrentOwnerSubscription(),
      billingRepository.getCurrentOwnerCheckout(),
    ]);
    if (!profile) throw new ApplicationError("Conta não encontrada.", 404);
    return {
      enabled: isConfigured(),
      amountCents: getAmountCents(),
      billingTypes,
      subscription: subscription
        ? {
            status: subscription.status,
            billingType: subscription.billingType,
            amountCents: subscription.amountCents,
            nextDueDate: subscription.nextDueDate,
            accessUntil: subscription.accessUntil?.toISOString() ?? null,
          }
        : null,
      checkout: checkout
        ? {
            status: checkout.status,
            billingType: checkout.billingType,
            amountCents: checkout.amountCents,
            checkoutUrl: checkout.checkoutUrl,
          }
        : null,
    };
  }

  async subscribeCurrentOwner(billingType: BillingType) {
    if (!isConfigured())
      throw new ApplicationError(
        "A contratação ainda não está disponível. As condições comerciais estão em validação.",
        503,
      );
    const [profile, existingSubscription, existingCheckout] = await Promise.all(
      [
        billingRepository.getCurrentOwnerProfile(),
        billingRepository.getCurrentOwnerSubscription(),
        billingRepository.getCurrentOwnerCheckout(),
      ],
    );
    if (!profile) throw new ApplicationError("Conta não encontrada.", 404);
    if (existingSubscription || existingCheckout)
      throw new ApplicationError(
        "Sua conta já possui uma assinatura ou checkout em andamento.",
        409,
      );

    const amountCents = getAmountCents();
    if (!amountCents) throw new ApplicationError("Plano indisponível.", 503);
    const nextDueDate = format(addDays(new Date(), 1), "yyyy-MM-dd");
    const externalReference = randomUUID();
    const baseUrl = process.env.BETTER_AUTH_URL;
    if (!baseUrl)
      throw new ApplicationError(
        "A URL de retorno da assinatura não está configurada.",
        503,
      );
    await billingRepository.reserveCheckout({
      externalReference,
      billingType,
      amountCents,
    });
    const callbackUrl = new URL("/assinatura", baseUrl);
    callbackUrl.searchParams.set("checkout", "return");
    let checkout;
    try {
      checkout = await asaasProvider.createCheckout({
        billingType,
        value: amountCents / 100,
        nextDueDate,
        externalReference,
        successUrl: callbackUrl.toString(),
        cancelUrl: callbackUrl.toString(),
        expiredUrl: callbackUrl.toString(),
      });
    } catch (error) {
      await billingRepository.abandonCheckout(externalReference);
      throw error;
    }
    const checkoutUrl =
      checkout.url ??
      `https://asaas.com/checkoutSession/show?id=${encodeURIComponent(checkout.id)}`;
    const attached = await billingRepository.attachProviderCheckout({
      externalReference,
      providerCheckoutId: checkout.id,
      checkoutUrl,
    });
    if (!attached) {
      await asaasProvider.cancelCheckout(checkout.id).catch(() => null);
      await billingRepository.abandonCheckout(externalReference);
      throw new ApplicationError("Não foi possível registrar o checkout.", 500);
    }
    return { status: "PENDING", checkoutUrl };
  }

  async cancelCurrentOwnerSubscription() {
    const subscription = await billingRepository.getCurrentOwnerSubscription();
    if (subscription) {
      const owned = await billingRepository.cancelCurrentOwnerSubscription(
        subscription.providerSubscriptionId,
      );
      if (!owned) throw new ApplicationError("Assinatura não encontrada.", 404);
      await asaasProvider.cancelSubscription(
        subscription.providerSubscriptionId,
      );
      await billingRepository.markCanceled(subscription.providerSubscriptionId);
      return { status: "CANCELED" };
    }
    const checkout = await billingRepository.getCurrentOwnerCheckout();
    if (checkout?.providerCheckoutId) {
      await asaasProvider.cancelCheckout(checkout.providerCheckoutId);
      await billingRepository.cancelCheckout(checkout.providerCheckoutId);
      return { status: "CANCELED" };
    }
    throw new ApplicationError(
      "Não há assinatura ou checkout em andamento para cancelar.",
      404,
    );
  }

  async receiveAsaasWebhook(input: {
    eventId: string;
    event: string;
    checkout?: {
      id?: string;
      status?: string;
      externalReference?: string;
    } | null;
    payment?: { subscription?: string; dueDate?: string } | null;
    subscription?: {
      id?: string;
      status?: string;
      nextDueDate?: string;
      externalReference?: string | null;
    } | null;
    dateCreated?: string;
  }) {
    const event = input.event;
    const subscriptionStatus =
      event === "SUBSCRIPTION_CREATED" ||
      input.subscription?.status === "ACTIVE"
        ? ("ACTIVE" as const)
        : event === "SUBSCRIPTION_DELETED" ||
            event === "SUBSCRIPTION_INACTIVATED" ||
            input.subscription?.status === "INACTIVE"
          ? ("CANCELED" as const)
          : null;
    const paymentStatus =
      event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED"
        ? ("ACTIVE" as const)
        : event === "PAYMENT_OVERDUE"
          ? ("OVERDUE" as const)
          : event === "PAYMENT_REFUNDED"
            ? ("REFUNDED" as const)
            : event === "PAYMENT_CHARGEBACK_REQUESTED" ||
                event === "PAYMENT_CHARGEBACK_DISPUTE"
              ? ("CHARGEBACK" as const)
              : null;
    const checkoutStatus =
      event === "CHECKOUT_PAID"
        ? ("PAID" as const)
        : event === "CHECKOUT_CANCELED"
          ? ("CANCELED" as const)
          : event === "CHECKOUT_EXPIRED"
            ? ("EXPIRED" as const)
            : null;
    const subscriptionId =
      input.subscription?.id ?? input.payment?.subscription ?? null;
    let nextDueDate = input.subscription?.nextDueDate ?? null;
    const needsConfirmedSubscriptionDate =
      (event === "SUBSCRIPTION_CREATED" || paymentStatus === "ACTIVE") &&
      subscriptionId &&
      !nextDueDate;
    if (needsConfirmedSubscriptionDate) {
      const providerSubscription =
        await asaasProvider.getSubscription(subscriptionId);
      nextDueDate = providerSubscription.nextDueDate ?? null;
      if (!nextDueDate)
        throw new ApplicationError(
          "A próxima data de cobrança não foi confirmada pelo provedor.",
          502,
        );
    }
    const externalReference =
      input.checkout?.externalReference ??
      input.subscription?.externalReference ??
      null;
    const providerCreatedAt = parseAsaasDateCreated(input.dateCreated);
    let competingCheckoutToCancelId: string | null = null;
    const confirmsCheckoutPayment = Boolean(
      checkoutStatus === "PAID" ||
      event === "SUBSCRIPTION_CREATED" ||
      subscriptionStatus === "ACTIVE" ||
      paymentStatus === "ACTIVE",
    );
    if (
      confirmsCheckoutPayment &&
      !input.checkout?.id &&
      !externalReference &&
      !(subscriptionId && paymentStatus)
    )
      throw new ApplicationError(
        "O evento de assinatura não trouxe uma referência para conciliação segura.",
        502,
      );
    if (
      confirmsCheckoutPayment &&
      (input.checkout?.id || externalReference) &&
      providerCreatedAt
    ) {
      const incomingCheckoutStatus =
        checkoutStatus === "PAID"
          ? "PAID"
          : event === "SUBSCRIPTION_CREATED" || subscriptionStatus === "ACTIVE"
            ? "SUBSCRIPTION_CREATED"
            : "COMPLETED";
      const competingCheckout =
        await billingRepository.getCheckoutConflictForPaidWebhook({
          eventId: input.eventId,
          providerCheckoutId: input.checkout?.id ?? null,
          externalReference,
          providerCreatedAt,
          incomingStatus: incomingCheckoutStatus,
        });
      if (competingCheckout) {
        if (
          competingCheckout.status !== "PENDING" ||
          !competingCheckout.providerCheckoutId
        )
          throw new ApplicationError(
            "Há outro checkout com pagamento em andamento; a conciliação precisa ser revisada.",
            503,
          );
        try {
          await asaasProvider.cancelCheckout(
            competingCheckout.providerCheckoutId,
          );
        } catch {
          throw new ApplicationError(
            "O checkout em andamento ainda não foi conciliado. O evento será reprocessado.",
            502,
          );
        }
        competingCheckoutToCancelId = competingCheckout.id;
      }
    }
    return billingRepository.receiveWebhook({
      eventId: input.eventId,
      eventType: event,
      resourceId: subscriptionId ?? input.checkout?.id ?? null,
      externalReference,
      checkoutId: input.checkout?.id ?? null,
      checkoutStatus,
      subscriptionId,
      subscriptionStatus,
      paymentStatus,
      nextDueDate,
      paymentDueDate: input.payment?.dueDate ?? null,
      providerCreatedAt,
      competingCheckoutToCancelId,
      payload: {
        eventId: input.eventId,
        event,
        checkoutId: input.checkout?.id ?? null,
        externalReference,
        subscriptionId,
        subscriptionStatus,
        paymentStatus,
        nextDueDate,
        paymentDueDate: input.payment?.dueDate ?? null,
      },
    });
  }

  hasPaidAccess(userId: string) {
    return billingRepository.hasPaidAccess(userId);
  }
}

export const billingService = new BillingService();
