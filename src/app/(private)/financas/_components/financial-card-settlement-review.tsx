"use client";

import { useState } from "react";
import { CreditCard, Link2, Unlink2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type Settlement = {
  id: string;
  description: string;
  actualDate: string | null;
  actualAmount: string | null;
};
type CardEntry = {
  id: string;
  description: string;
  actualDate: string | null;
  actualAmount: string | null;
  sourceCategory: string | null;
};
type Review = { settlements: Settlement[]; cardEntries: CardEntry[] };

function amountInCents(value: string | null) {
  if (value === null || !/^-?\d+(?:\.\d{1,2})?$/.test(value)) return 0n;
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

function centsLabel(value: bigint) {
  return formatCurrency(Number(value) / 100);
}

const dateLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : "Sem data";

export function FinancialCardSettlementReview({
  readOnly,
}: {
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedBySettlement, setSelectedBySettlement] = useState<
    Record<string, string[]>
  >({});
  const [activeSettlementId, setActiveSettlementId] = useState<string | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [candidateLimit, setCandidateLimit] = useState(50);
  const [busyId, setBusyId] = useState<string | null>(null);
  const review = useQuery({
    queryKey: queryKeys.finances.cardSettlements(),
    queryFn: () =>
      apiRequest<Review>(
        "/api/financial-card-settlements",
        undefined,
        "Não foi possível carregar pagamentos para conferência.",
      ),
  });

  const resolve = async (
    settlement: Settlement,
    resolution: "LINKED" | "NOT_RELATED",
  ) => {
    const cardEntryIds = selectedBySettlement[settlement.id] ?? [];
    setBusyId(settlement.id);
    try {
      const response = await apiRequest<{ message?: string }>(
        "/api/financial-card-settlements",
        {
          method: "POST",
          body: JSON.stringify({
            settlementEntryId: settlement.id,
            resolution,
            cardEntryIds: resolution === "LINKED" ? cardEntryIds : [],
          }),
        },
      );
      toast.success(response.message || "Conferência salva.");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.finances.cardSettlements(),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.finances.all }),
      ]);
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar a conferência.",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (review.isError && !review.data) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p role="alert" className="text-sm text-destructive">
            {review.error instanceof Error
              ? review.error.message
              : "Não foi possível carregar pagamentos para conferência."}
          </p>
          <Button variant="outline" onClick={() => void review.refetch()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (review.isPending || !review.data) {
    return (
      <Card role="status" aria-label="Carregando pagamentos de fatura">
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </CardHeader>
        <CardContent className="space-y-3">
          <span className="sr-only">Carregando pagamentos de fatura</span>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (
    !Array.isArray(review.data.settlements) ||
    !Array.isArray(review.data.cardEntries)
  ) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar pagamentos para conferência.
          </p>
          <Button variant="outline" onClick={() => void review.refetch()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (!review.data.settlements.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="size-5 text-primary" aria-hidden="true" />
          Conferir pagamentos de cartão
        </CardTitle>
        <CardDescription>
          As compras já contam na data da compra. Confirme se cada pagamento da
          conta quita essas compras. Até a confirmação, o pagamento continua
          incluído nos gastos; após um vínculo exato, ele fica apenas como saída
          da conta. A saída da conta permanece registrada nos dois casos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {review.data.settlements.map((settlement) => {
          const active = activeSettlementId === settlement.id;
          const selectedIds = selectedBySettlement[settlement.id] ?? [];
          const selectedTotalCents = review.data.cardEntries
            .filter((entry) => selectedIds.includes(entry.id))
            .reduce(
              (total, entry) => total + amountInCents(entry.actualAmount),
              0n,
            );
          const settlementCents = amountInCents(settlement.actualAmount);
          const selectedTotalMatches = selectedTotalCents === settlementCents;
          const matchingCards = review.data.cardEntries.filter((entry) =>
            `${entry.description} ${entry.sourceCategory ?? ""}`
              .toLocaleLowerCase("pt-BR")
              .includes(search.trim().toLocaleLowerCase("pt-BR")),
          );
          const visibleCards = active
            ? matchingCards.slice(0, candidateLimit)
            : [];
          return (
            <section key={settlement.id} className="rounded-lg border p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="font-medium">{settlement.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {dateLabel(settlement.actualDate)} ·{" "}
                    {formatCurrency(Number(settlement.actualAmount ?? 0))}
                  </p>
                </div>
                {!readOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busyId === settlement.id}
                    onClick={() => void resolve(settlement, "NOT_RELATED")}
                  >
                    <Unlink2 className="mr-2 size-4" aria-hidden="true" />
                    Não corresponde
                  </Button>
                )}
              </div>
              <Collapsible
                className="mt-3"
                open={active}
                onOpenChange={(open) => {
                  setActiveSettlementId(open ? settlement.id : null);
                  setSearch("");
                  setCandidateLimit(50);
                }}
              >
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" className="px-0">
                    <Link2 className="mr-2 size-4" aria-hidden="true" />
                    Selecionar compras que esta fatura quitou
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  {review.data.cardEntries.length ? (
                    <>
                      <Input
                        aria-label="Buscar compra do cartão"
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value);
                          setCandidateLimit(50);
                        }}
                        placeholder="Buscar compra ou categoria"
                        disabled={readOnly || busyId === settlement.id}
                      />
                      <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-2">
                        {visibleCards.map((entry) => {
                          const selected = selectedIds.includes(entry.id);
                          return (
                            <label
                              key={entry.id}
                              className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/50"
                            >
                              <Checkbox
                                checked={selected}
                                disabled={readOnly || busyId === settlement.id}
                                onCheckedChange={(checked) =>
                                  setSelectedBySettlement((current) => {
                                    const ids = current[settlement.id] ?? [];
                                    return {
                                      ...current,
                                      [settlement.id]:
                                        checked === true
                                          ? [...ids, entry.id]
                                          : ids.filter((id) => id !== entry.id),
                                    };
                                  })
                                }
                                aria-label={`Vincular ${entry.description} de ${dateLabel(entry.actualDate)}`}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block break-words text-sm font-medium">
                                  {entry.description}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {dateLabel(entry.actualDate)}
                                  {entry.sourceCategory
                                    ? ` · Inter: ${entry.sourceCategory}`
                                    : ""}
                                </span>
                              </span>
                              <span className="shrink-0 text-sm tabular-nums">
                                {formatCurrency(
                                  Number(entry.actualAmount ?? 0),
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {active && matchingCards.length > visibleCards.length && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setCandidateLimit((limit) => limit + 50)
                          }
                        >
                          Mostrar mais compras ({visibleCards.length} de{" "}
                          {matchingCards.length})
                        </Button>
                      )}
                      {active && matchingCards.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Nenhuma compra corresponde à busca.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Não há compras de cartão disponíveis para vincular.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      Total selecionado: {centsLabel(selectedTotalCents)}
                    </p>
                    {!readOnly && (
                      <Button
                        type="button"
                        disabled={
                          selectedIds.length === 0 ||
                          !selectedTotalMatches ||
                          busyId === settlement.id
                        }
                        onClick={() => void resolve(settlement, "LINKED")}
                      >
                        Confirmar vínculo
                      </Button>
                    )}
                  </div>
                  {selectedIds.length > 0 && !selectedTotalMatches && (
                    <p role="status" className="text-sm text-status-warning">
                      Para vincular, o total selecionado precisa ser igual ao
                      pagamento ({centsLabel(settlementCents)}).
                    </p>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
