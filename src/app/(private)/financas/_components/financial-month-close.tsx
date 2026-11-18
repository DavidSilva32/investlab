"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { apiRequest } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";

export type FinancialMonthClose = {
  status: "closed" | "needs_review";
  closedAt: string;
  totals: {
    expectedIncome: string | null;
    realizedIncome: string | null;
    expectedExpenses: string | null;
    realizedExpenses: string | null;
    expectedBalance: string | null;
    recordedBalance: string | null;
  };
  history: Array<{
    closedAt: string;
    totals: {
      expectedBalance: string | null;
      recordedBalance: string | null;
    };
  }>;
};

type Props = {
  month: string;
  close: FinancialMonthClose | null;
  readOnly: boolean;
  onClosed: () => void;
};

const monthNow = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts();
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
};

const money = (value: string | null) =>
  value === null ? "Sem registro" : formatCurrency(Number(value));

export function FinancialMonthClose({
  month,
  close,
  readOnly,
  onClosed,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const isFutureMonth = month > monthNow();
  const isReviewNeeded = close?.status === "needs_review";
  const closedDate = close
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(close.closedAt))
    : null;

  async function closeMonth() {
    setSaving(true);
    try {
      await apiRequest<{
        month: string;
        close: FinancialMonthClose;
        message: string;
      }>(
        "/api/finance-close",
        { method: "POST", body: JSON.stringify({ month }) },
        "Não foi possível fechar o mês.",
      );
      toast.success(
        isReviewNeeded
          ? "Fechamento atualizado com os dados revisados."
          : close
            ? "Mês fechado novamente com os dados atuais."
            : "Mês fechado com os dados registrados.",
      );
      setConfirmOpen(false);
      onClosed();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível fechar o mês.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card
        className={
          isReviewNeeded ? "border-status-warning/40 bg-status-warning/5" : ""
        }
      >
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-3">
            {isReviewNeeded ? (
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-status-warning"
              />
            ) : close ? (
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-status-success"
              />
            ) : (
              <CalendarCheck2
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              />
            )}
            <div className="min-w-0 space-y-1">
              <p className="font-medium">
                {isReviewNeeded
                  ? "Fechamento precisa de revisão"
                  : close
                    ? "Mês fechado"
                    : "Fechamento do mês"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isReviewNeeded
                  ? `Os dados mudaram depois do fechamento de ${closedDate}. O registro fechado foi preservado; revise e feche novamente para atualizá-lo.`
                  : close
                    ? `Fechado em ${closedDate}. O fechamento guarda os valores deste mês naquela data.`
                    : "Registre um retrato dos valores deste mês para consultar depois."}
              </p>
              {close && (
                <p className="text-sm text-muted-foreground">
                  Previsto {money(close.totals.expectedBalance)} · Realizado{" "}
                  {money(close.totals.recordedBalance)}
                </p>
              )}
              {!!close?.history.length && (
                <Collapsible className="pt-1">
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="link"
                      className="h-auto p-0 text-sm"
                      aria-label={`Ver ${close.history.length} fechamentos anteriores`}
                    >
                      {`Fechamentos anteriores (${close.history.length})`}
                      <ChevronDown aria-hidden="true" className="ml-1 size-4" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1 pt-2">
                    {close.history.map((version) => (
                      <p
                        key={version.closedAt}
                        className="text-sm text-muted-foreground"
                      >
                        {new Intl.DateTimeFormat("pt-BR", {
                          dateStyle: "short",
                          timeZone: "America/Sao_Paulo",
                        }).format(new Date(version.closedAt))}
                        : Previsto {money(version.totals.expectedBalance)} ·
                        Realizado {money(version.totals.recordedBalance)}
                      </p>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </div>
          <Button
            className="shrink-0"
            variant={isReviewNeeded || !close ? "default" : "outline"}
            disabled={readOnly || isFutureMonth || saving}
            onClick={() => setConfirmOpen(true)}
          >
            {saving
              ? "Salvando..."
              : isReviewNeeded
                ? "Revisar fechamento"
                : close
                  ? "Fechar novamente"
                  : "Fechar mês"}
          </Button>
        </CardContent>
      </Card>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {close ? "Atualizar o fechamento?" : "Fechar este mês?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {close
                ? "Será criado um novo registro com os valores atuais. Os fechamentos anteriores continuarão disponíveis nesta tela."
                : "O sistema vai guardar os valores registrados para este mês. Se você alterar ou adicionar lançamentos depois, o fechamento será marcado para revisão."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={closeMonth}>
              {saving ? "Salvando..." : "Confirmar fechamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
