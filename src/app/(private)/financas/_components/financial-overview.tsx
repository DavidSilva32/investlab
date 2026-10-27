"use client";

import { FinancialEntryDialog as EntryDialog } from "@/app/(private)/financas/_components/financial-entry-dialog";
import { FinancialEntriesTable } from "@/app/(private)/financas/_components/financial-entries-table";
import { FinancialCategoryManager } from "@/app/(private)/financas/_components/financial-category-manager";
import { FinancialHistory } from "@/app/(private)/financas/_components/financial-history";
import { FinancialRecurrencesSheet as RecurrencesSheet } from "@/app/(private)/financas/_components/financial-recurrences-sheet";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarClock, Plus, Tags } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminSupportView } from "@/components/app-shell";

type Kind = "INCOME" | "EXPENSE";
type Category = { id: string; kind: Kind; name: string; active: boolean };
type Entry = {
  id: string;
  kind: Kind;
  description: string;
  categoryId: string;
  categoryName: string;
  expectedAmount: string | null;
  expectedDate: string | null;
  actualAmount: string | null;
  actualDate: string | null;
};
type Occurrence = {
  id: string;
  recurrenceId: string;
  kind: Kind;
  description: string;
  category: string | null;
  essential: boolean;
  dueDate: string;
  expectedAmount: string | null;
  actualAmount: string | null;
  actualDate: string | null;
  status: "planned" | "realized";
};
type Recurrence = {
  id: string;
  kind: Kind;
  description: string;
  categoryId: string | null;
  amount: string;
  frequency: string;
  firstDueDate: string;
  essential: boolean;
  active: boolean;
};
type HistoryMonth = {
  month: string;
  expectedIncome: string | null;
  realizedIncome: string | null;
  expectedExpenses: string | null;
  realizedExpenses: string | null;
  recordedBalance: string | null;
  completeness: "recorded_only";
};
type Overview = {
  summary: {
    expectedIncome: string | null;
    realizedIncome: string | null;
    expectedExpenses: string | null;
    realizedExpenses: string | null;
    expectedBalance: string | null;
    recordedBalance: string | null;
    undatedRecurringRealizations: number;
    completeness: "recorded_only" | "no_data";
  };
  entries: Entry[];
  recurringOccurrences: Occurrence[];
  history: {
    months: HistoryMonth[];
    completeness: "recorded_only";
    explanation: string;
  };
  categories: Category[];
};
type RecurrenceOverview = {
  recurrences: Recurrence[];
  recurrenceOccurrences: Occurrence[];
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
const monthLabel = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00Z`));
const monthShift = (value: string, offset: number) => {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
};
const invalidateFinances = (client: ReturnType<typeof useQueryClient>) =>
  client.invalidateQueries({ queryKey: queryKeys.finances.all });

export function FinancialOverview() {
  const client = useQueryClient();
  const searchParams = useSearchParams();
  const supportView = useAdminSupportView();
  const canEdit = supportView === false;
  const [month, setMonth] = useState(monthNow);
  const [entryOpen, setEntryOpen] = useState(false);
  const [recurrencesOpen, setRecurrencesOpen] = useState(
    searchParams.get("gerenciar") === "recorrencias",
  );
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const overview = useQuery({
    queryKey: queryKeys.finances.overview(month),
    queryFn: () =>
      apiRequest<Overview>(
        `/api/finance-overview?month=${month}`,
        undefined,
        "Não foi possível carregar o fluxo financeiro.",
      ),
  });
  const recurrences = useQuery({
    queryKey: queryKeys.finances.recurrences(month),
    enabled: recurrencesOpen || entryOpen,
    queryFn: () =>
      apiRequest<RecurrenceOverview>(
        `/api/financial-recurrences?month=${month}`,
        undefined,
        "Não foi possível carregar as recorrências.",
      ),
  });
  const data = overview.data;
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            Visão financeira
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            Fluxo do mês
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Receitas, despesas e compromissos registrados em um só lugar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border bg-card p-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mês anterior"
              onClick={() => setMonth((value) => monthShift(value, -1))}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <span className="min-w-32 px-2 text-center text-sm font-medium capitalize">
              {monthLabel(month)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Próximo mês"
              onClick={() => setMonth((value) => monthShift(value, 1))}
            >
              <ArrowRight className="size-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            disabled={!canEdit}
            onClick={() => setCategoriesOpen(true)}
          >
            <Tags className="mr-2 size-4" />
            Categorias
          </Button>
          <Button
            variant="outline"
            disabled={!canEdit}
            onClick={() => setRecurrencesOpen(true)}
          >
            <CalendarClock className="mr-2 size-4" />
            Recorrências
          </Button>
          <Button
            disabled={!canEdit}
            onClick={() => {
              setEditingEntry(null);
              setEntryOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" />
            Lançamento
          </Button>
        </div>
      </header>
      {overview.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((x) => (
            <div
              key={x}
              className="h-28 animate-pulse rounded-xl border bg-muted/40 motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : overview.isError ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p role="alert" className="text-sm text-destructive">
              {overview.error instanceof Error
                ? overview.error.message
                : "Não foi possível carregar o fluxo financeiro."}
            </p>
            <Button variant="outline" onClick={() => void overview.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              {
                label: "Entradas previstas",
                value: data?.summary.expectedIncome,
                tone: "text-status-success border-l-status-success",
              },
              {
                label: "Entradas realizadas",
                value: data?.summary.realizedIncome,
                tone: "text-status-success border-l-status-success",
              },
              {
                label: "Saídas previstas",
                value: data?.summary.expectedExpenses,
                tone: "text-status-danger border-l-status-danger",
              },
              {
                label: "Saídas realizadas",
                value: data?.summary.realizedExpenses,
                tone: "text-status-danger border-l-status-danger",
              },
              {
                label: "Saldo previsto",
                value: data?.summary.expectedBalance,
                tone:
                  Number(data?.summary.expectedBalance) < 0
                    ? "text-status-danger border-l-status-danger"
                    : "text-foreground border-l-border",
              },
              {
                label: "Saldo realizado",
                value: data?.summary.recordedBalance,
                tone:
                  Number(data?.summary.recordedBalance) < 0
                    ? "text-status-danger border-l-status-danger"
                    : "text-foreground border-l-border",
              },
            ].map(({ label, value, tone }) => (
              <Card key={label} className={`border-l-2 ${tone}`}>
                <CardContent className="p-4">
                  <p className="text-sm opacity-85">{label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {money(value as string | null)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          {data?.summary.completeness === "no_data" && (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Ainda não há registros neste mês. Cadastre uma receita, despesa ou
              compromisso recorrente para acompanhar seu fluxo.
            </p>
          )}
          {!!data?.summary.undatedRecurringRealizations && (
            <p
              role="status"
              className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
            >
              {data.summary.undatedRecurringRealizations} ocorrência(s)
              realizada(s) sem data do pagamento não entram no total mensal.
              Informe a data ao registrar a ocorrência.
            </p>
          )}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                Lançamentos e vencimentos
              </CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 overflow-x-auto pt-0">
              <FinancialEntriesTable
                entries={data?.entries ?? []}
                occurrences={data?.recurringOccurrences ?? []}
                readOnly={!canEdit}
                onSaved={() => void invalidateFinances(client)}
                onEdit={(entry) => {
                  setEditingEntry(entry);
                  setEntryOpen(true);
                }}
              />
            </CardContent>
          </Card>
          <FinancialHistory
            months={data?.history.months ?? []}
            selectedMonth={month}
          />
        </>
      )}
      <EntryDialog
        key={editingEntry?.id ?? "new-entry"}
        open={entryOpen}
        onOpenChange={(open) => {
          setEntryOpen(open);
          if (!open) setEditingEntry(null);
        }}
        categories={overview.data?.categories ?? []}
        entry={editingEntry}
        recurrences={recurrences.data?.recurrences ?? []}
        recurrencesLoading={entryOpen && recurrences.isPending}
        recurrencesError={entryOpen && recurrences.isError}
        onSaved={() => {
          void invalidateFinances(client);
        }}
      />
      <RecurrencesSheet
        open={recurrencesOpen}
        onOpenChange={setRecurrencesOpen}
        month={month}
        data={recurrences.data}
        loading={recurrences.isPending}
        error={
          recurrences.error instanceof Error ? recurrences.error.message : null
        }
        retry={() => void recurrences.refetch()}
        categories={overview.data?.categories ?? []}
        onSaved={() => {
          void invalidateFinances(client);
        }}
        readOnly={!canEdit}
      />
      <FinancialCategoryManager
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
      />
    </div>
  );
}
