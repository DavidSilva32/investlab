"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  CreditCard,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type BillingType = "CREDIT_CARD" | "PIX" | "BOLETO";
type BillingState = {
  enabled: boolean;
  amountCents: number | null;
  billingTypes: Array<"CREDIT_CARD">;
  subscription: null | {
    status: string;
    billingType: BillingType;
    amountCents: number;
    nextDueDate: string | null;
    accessUntil: string | null;
  };
  checkout: null | {
    status: string;
    billingType: BillingType;
    amountCents: number;
    checkoutUrl: string | null;
  };
};

const billingTypeLabels: Record<BillingType, string> = {
  CREDIT_CARD: "Cartão de crédito",
  PIX: "Pix",
  BOLETO: "Boleto",
};

function formatAmount(amountCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amountCents / 100);
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(date);
}

function safePaymentUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)asaas\.com$/.test(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function getSubscriptionLabel(status: string) {
  switch (status) {
    case "ACTIVE":
      return "Ativa";
    case "OVERDUE":
      return "Pagamento pendente";
    case "PENDING":
      return "Aguardando pagamento";
    case "CANCELED":
      return "Cancelada";
    case "REFUNDED":
      return "Estornada";
    case "CHARGEBACK":
      return "Em contestação";
    default:
      return "Em processamento";
  }
}

export function BillingManagement() {
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const fetchBilling = useCallback(
    () => apiRequest<BillingState>("/api/billing"),
    [],
  );

  const loadBilling = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setBilling(await fetchBilling());
    } catch (error) {
      setLoadError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível carregar os dados da assinatura.",
      );
    } finally {
      setLoading(false);
    }
  }, [fetchBilling]);

  useEffect(() => {
    let active = true;
    fetchBilling()
      .then((result) => {
        if (active) setBilling(result);
      })
      .catch((error: unknown) => {
        if (active)
          setLoadError(
            error instanceof ApiError
              ? error.message
              : "Não foi possível carregar os dados da assinatura.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchBilling]);

  async function subscribe() {
    setProcessing(true);
    try {
      const result = await apiRequest<{ status: string; checkoutUrl: string }>(
        "/api/billing",
        {
          method: "POST",
          body: JSON.stringify({ billingType: "CREDIT_CARD" }),
        },
      );
      toast.success(
        "Assinatura iniciada. Conclua o pagamento para ativar o acesso.",
      );
      await loadBilling();
      const checkoutUrl = safePaymentUrl(result.checkoutUrl);
      if (checkoutUrl) window.location.assign(checkoutUrl);
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível iniciar a assinatura.",
      );
    } finally {
      setProcessing(false);
    }
  }

  async function cancel() {
    setProcessing(true);
    try {
      await apiRequest<{ status: string }>("/api/billing", {
        method: "DELETE",
      });
      toast.success("Solicitação de cancelamento concluída.");
      await loadBilling();
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível cancelar a assinatura.",
      );
    } finally {
      setProcessing(false);
    }
  }

  if (loading)
    return (
      <div
        role="status"
        className="flex min-h-48 items-center justify-center text-muted-foreground"
      >
        <LoaderCircle aria-hidden="true" className="mr-2 size-5 animate-spin" />
        Carregando assinatura…
      </div>
    );

  if (loadError || !billing)
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-4 p-6">
          <p role="alert">
            {loadError ?? "Não foi possível carregar os dados."}
          </p>
          <Button variant="outline" onClick={() => void loadBilling()}>
            <RefreshCw aria-hidden="true" className="size-4" /> Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );

  const subscription = billing.subscription;
  const checkout = billing.checkout;
  const checkoutUrl = safePaymentUrl(checkout?.checkoutUrl ?? null);
  const isActive = subscription?.status === "ACTIVE";
  const accessUntil =
    isActive && subscription ? formatDate(subscription.accessUntil) : null;
  const canCancel =
    (subscription &&
      ["PENDING", "ACTIVE", "OVERDUE"].includes(subscription.status)) ||
    checkout?.status === "PENDING";

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <Card className="overflow-hidden border-primary/20 shadow-sm">
        <div
          aria-hidden="true"
          className="h-1.5 bg-gradient-to-r from-primary via-primary/70 to-primary/20"
        />
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">InvestLab Pro</p>
            <CardTitle className="mt-1 text-2xl">Sua assinatura</CardTitle>
            <CardDescription className="mt-2 max-w-xl leading-6">
              Consulte o status do plano e gerencie o pagamento da sua conta.
            </CardDescription>
          </div>
          {subscription && (
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-sm font-medium">
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${isActive ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              {getSubscriptionLabel(subscription.status)}
            </span>
          )}
        </CardHeader>
        <CardContent className="grid gap-5">
          {subscription ? (
            <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Plano
                </p>
                <p className="mt-1 font-semibold">InvestLab Pro</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Valor mensal
                </p>
                <p className="mt-1 font-semibold">
                  {formatAmount(subscription.amountCents)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Forma de pagamento
                </p>
                <p className="mt-1 font-semibold">
                  {billingTypeLabels[subscription.billingType]}
                </p>
              </div>
            </div>
          ) : null}

          {!subscription && !billing.enabled && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
              <div className="flex gap-3">
                <ShieldCheck
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-primary"
                />
                <div>
                  <h2 className="font-semibold">Contratação em preparação</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Estamos validando os planos e as condições comerciais.
                    Nenhuma cobrança está ativa neste momento.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!subscription && checkout?.status === "PENDING" && checkoutUrl && (
            <Button asChild className="w-fit">
              <a href={checkoutUrl} rel="noreferrer" target="_blank">
                <ExternalLink aria-hidden="true" className="size-4" /> Continuar
                no checkout seguro
              </a>
            </Button>
          )}

          {!subscription && checkout && checkout.status !== "PENDING" && (
            <p
              role="status"
              className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground"
            >
              O pagamento foi recebido. Estamos confirmando a assinatura com o
              Asaas.
            </p>
          )}

          {!subscription &&
            !checkout &&
            billing.enabled &&
            billing.amountCents !== null && (
              <div className="grid gap-5">
                <div>
                  <p className="text-3xl font-bold tracking-tight">
                    {formatAmount(billing.amountCents)}
                    <span className="ml-1 text-base font-normal text-muted-foreground">
                      / mês
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cobrança mensal. Acesso ativado após confirmação do
                    pagamento.
                  </p>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
                  <CreditCard
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  <span>
                    {billingTypeLabels.CREDIT_CARD} · pagamento seguro no Asaas
                  </span>
                </div>
                <Button
                  onClick={() => void subscribe()}
                  disabled={
                    processing || !billing.billingTypes.includes("CREDIT_CARD")
                  }
                  className="w-full sm:w-fit"
                >
                  {processing ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <BadgeCheck aria-hidden="true" className="size-4" />
                  )}
                  Continuar para pagamento
                </Button>
                <p className="text-xs leading-5 text-muted-foreground">
                  O InvestLab não recebe nem armazena os dados do cartão. O
                  pagamento é processado pelo Asaas.
                </p>
              </div>
            )}

          {isActive && subscription && (
            <p className="text-sm text-muted-foreground">
              {accessUntil
                ? `Acesso confirmado até ${accessUntil}.`
                : "Assinatura ativa. A data de término do acesso ainda não foi confirmada."}
            </p>
          )}

          {canCancel && (
            <div className="border-t pt-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={processing}>
                    Cancelar assinatura
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancelar assinatura?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {subscription
                        ? "A solicitação será enviada ao Asaas. Se houver período pago, o acesso permanece até o fim desse período."
                        : "O checkout pendente será cancelado no Asaas e você poderá iniciar uma nova tentativa depois."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void cancel()}>
                      Confirmar cancelamento
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
