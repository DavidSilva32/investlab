"use client";

import { useState } from "react";
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

type TransferCandidate = {
  entryId: string;
  relatedEntryId: string;
  entryDescription: string;
  relatedDescription: string;
  entryAccount: string;
  relatedAccount: string;
  actualAmount: string;
  entryDate: string;
  relatedDate: string;
};
type ReversalReview = {
  entryId: string;
  description: string;
  actualAmount: string | null;
  actualDate: string | null;
  candidates: Array<{
    entryId: string;
    description: string;
    actualDate: string;
    remainingAmount: string;
  }>;
  expenses: Array<{
    entryId: string;
    description: string;
    actualDate: string;
    remainingAmount: string;
  }>;
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

export function FinancialEntryReviews({
  transfers,
  reversals,
  readOnly,
  onChanged,
}: {
  transfers: TransferCandidate[];
  reversals: ReversalReview[];
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<
    Record<string, string>
  >({});
  const [expenseSearch, setExpenseSearch] = useState<Record<string, string>>(
    {},
  );
  if (!transfers.length && !reversals.length) return null;
  const count = transfers.length + reversals.length;

  const relate = async (
    kind: "TRANSFER" | "REVERSAL" | "REVERSAL_DISMISSED",
    entryId: string,
    relatedEntryId?: string,
  ) => {
    const key = `${kind}:${entryId}`;
    setPendingId(key);
    try {
      const result = await apiRequest<{ message?: string }>(
        "/api/financial-entry-relations",
        {
          method: "POST",
          body: JSON.stringify(
            kind === "REVERSAL_DISMISSED"
              ? { kind, entryId }
              : { kind, entryId, relatedEntryId },
          ),
        },
      );
      toast.success(
        typeof result.message === "string" && result.message.trim()
          ? result.message
          : "Relação confirmada.",
      );
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível confirmar a relação.",
      );
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Collapsible className="rounded-xl border bg-card">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="group flex h-auto w-full justify-between rounded-xl px-4 py-3 text-left"
          aria-label={`Revisar movimentações: ${count} pendentes`}
        >
          <span className="text-sm font-medium">
            Revisar movimentações ({count})
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t px-4 py-3">
        {transfers.map((candidate) => {
          const key = `TRANSFER:${candidate.entryId}`;
          return (
            <article
              key={key}
              className="flex flex-col justify-between gap-3 rounded-md border p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  Possível transferência entre suas contas
                </p>
                <p className="text-muted-foreground">
                  {candidate.entryAccount}: {candidate.entryDescription} ·{" "}
                  {candidate.relatedAccount}: {candidate.relatedDescription}
                </p>
                <p className="text-muted-foreground">
                  {dateLabel(candidate.entryDate)} /{" "}
                  {dateLabel(candidate.relatedDate)} ·{" "}
                  {formatCurrency(Number(candidate.actualAmount))}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={readOnly || pendingId !== null}
                onClick={() =>
                  void relate(
                    "TRANSFER",
                    candidate.entryId,
                    candidate.relatedEntryId,
                  )
                }
              >
                {pendingId === key ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : (
                  <Check className="mr-2 size-4" />
                )}
                Confirmar
              </Button>
            </article>
          );
        })}
        {reversals.map((review) => {
          const key = `REVERSAL:${review.entryId}`;
          return (
            <article key={key} className="space-y-2 rounded-md border p-3">
              <div className="text-sm">
                <p className="font-medium">Estorno ou reembolso para revisar</p>
                <p className="text-muted-foreground">
                  {review.description}
                  {review.actualDate && ` · ${dateLabel(review.actualDate)}`}
                  {review.actualAmount &&
                    ` · ${formatCurrency(Number(review.actualAmount))}`}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={readOnly || pendingId !== null}
                onClick={() =>
                  void relate("REVERSAL_DISMISSED", review.entryId)
                }
              >
                {pendingId === `REVERSAL_DISMISSED:${review.entryId}` ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : null}
                Não é estorno
              </Button>
              {review.expenses.length ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="min-w-0 flex-1 space-y-2">
                    {!review.candidates.length && (
                      <p className="text-xs text-muted-foreground">
                        Sem correspondência sugerida. O valor segue fora das
                        entradas até o vínculo.
                      </p>
                    )}
                    <Input
                      value={expenseSearch[review.entryId] ?? ""}
                      onChange={(event) =>
                        setExpenseSearch((current) => ({
                          ...current,
                          [review.entryId]: event.target.value,
                        }))
                      }
                      aria-label={`Buscar despesa para o estorno ${review.description}`}
                      placeholder="Buscar despesa original"
                    />
                    <Select
                      value={selectedExpense[review.entryId] ?? ""}
                      onValueChange={(value) =>
                        setSelectedExpense((current) => ({
                          ...current,
                          [review.entryId]: value,
                        }))
                      }
                    >
                      <SelectTrigger
                        aria-label={`Despesa correspondente ao estorno ${review.description}`}
                        className="w-full"
                      >
                        <SelectValue placeholder="Selecione a despesa" />
                      </SelectTrigger>
                      <SelectContent>
                        {review.expenses
                          .filter((expense) => {
                            const query = (expenseSearch[review.entryId] ?? "")
                              .trim()
                              .toLocaleLowerCase("pt-BR");
                            return (
                              !query ||
                              `${expense.description} ${expense.actualDate} ${expense.remainingAmount}`
                                .toLocaleLowerCase("pt-BR")
                                .includes(query)
                            );
                          })
                          .map((candidate) => (
                            <SelectItem
                              key={candidate.entryId}
                              value={candidate.entryId}
                            >
                              {review.candidates.some(
                                (suggested) =>
                                  suggested.entryId === candidate.entryId,
                              ) && "Possível correspondência · "}
                              {candidate.description} ·{" "}
                              {dateLabel(candidate.actualDate)} · até{" "}
                              {formatCurrency(
                                Number(candidate.remainingAmount),
                              )}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      readOnly ||
                      !selectedExpense[review.entryId] ||
                      pendingId !== null
                    }
                    onClick={() =>
                      void relate(
                        "REVERSAL",
                        review.entryId,
                        selectedExpense[review.entryId],
                      )
                    }
                  >
                    {pendingId === key ? (
                      <LoaderCircle className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 size-4" />
                    )}
                    Vincular estorno
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma despesa realizada anterior está disponível. O valor
                  permanece fora das entradas até você revisar.
                </p>
              )}
            </article>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
