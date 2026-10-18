"use client";

import { useState } from "react";
import { toast } from "sonner";
import { getApiMessage } from "@/lib/api-message";
import { formatCurrencyCents } from "@/lib/portfolio-money";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export type ReconciliationTrade = {
  sourceRow: number;
  date: string;
  side: "BUY" | "SELL";
  ticker: string | null;
  originalTicker: string | null;
  product: string;
  institution: string | null;
  quantity: string;
  unitPrice: string | null;
  value: string | null;
};

export type ReconciliationMovement = {
  sourceRow: number;
  date: string;
  direction: string;
  movementType: string;
  ticker: string | null;
  product: string;
  institution: string | null;
  quantity: string;
  unitPrice: string | null;
  value: string | null;
};

export type ReconciliationPair = {
  tradeId: string;
  movementId: string;
  trade: ReconciliationTrade;
  movement: ReconciliationMovement;
  valueDifferenceCents?: string | null;
  valueComparison?: "equal" | "different" | "unavailable";
};

export type B3ReconciliationSummary = {
  candidates: ReconciliationPair[];
  confirmed: ReconciliationPair[];
  ambiguous: Array<{
    tradeId: string;
    movementIds: string[];
    pairs: ReconciliationPair[];
    status: "ambiguous";
  }>;
  separated: ReconciliationPair[];
  unmatched: Array<{
    tradeId: string;
    trade: ReconciliationTrade;
    reason: string;
  }>;
  duplicateCandidates: Array<{
    occurrenceCount: number;
    sourceRows: number[];
    importCount: number;
    status: "ambiguous";
  }>;
  movementDuplicateCandidates: Array<{
    occurrenceCount: number;
    sourceRows: number[];
    importCount: number;
    status: "ambiguous";
  }>;
  history: { complete: boolean; reasons: string[] };
};

type DecisionGroup = { tradeId: string; pairs: ReconciliationPair[] };

function getDecisionGroups(summary: B3ReconciliationSummary): DecisionGroup[] {
  const groups = new Map<string, DecisionGroup>();
  for (const pair of [
    ...summary.candidates,
    ...summary.ambiguous.flatMap(({ pairs }) => pairs),
  ]) {
    const group = groups.get(pair.tradeId) ?? {
      tradeId: pair.tradeId,
      pairs: [],
    };
    if (!group.pairs.some((entry) => entry.movementId === pair.movementId))
      group.pairs.push(pair);
    groups.set(pair.tradeId, group);
  }
  return [...groups.values()];
}

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 });
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function displayDate(value: string) {
  return date.format(new Date(`${value}T00:00:00Z`));
}

function displayMoney(value: string | null) {
  return value === null ? "valor não informado" : money.format(Number(value));
}

function pairLabel(pair: ReconciliationPair) {
  const { movement } = pair;
  const identity = movement.ticker ?? movement.product;
  return `${movement.movementType} em ${displayDate(movement.date)} · ${identity} · ${number.format(Number(movement.quantity))} · ${displayMoney(movement.value)}`;
}

export function TradingReconciliationReview({
  summary,
  onSummaryChange,
}: {
  summary: B3ReconciliationSummary;
  onSummaryChange: (summary: B3ReconciliationSummary) => void;
}) {
  const [choices, setChoices] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const groups = getDecisionGroups(summary);
  const allDecisionsMade =
    groups.length > 0 && groups.every((group) => group.tradeId in choices);

  async function saveDecisions() {
    setSaving(true);
    try {
      const decisions = groups.flatMap((group) =>
        group.pairs.map((pair) => ({
          tradeId: pair.tradeId,
          movementId: pair.movementId,
          action:
            choices[group.tradeId] === pair.movementId
              ? ("LINK" as const)
              : ("KEEP_SEPARATE" as const),
        })),
      );
      const response = await fetch("/api/imports/reconciliation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decisions }),
      });
      const body = (await response.json()) as B3ReconciliationSummary & {
        message?: string;
      };
      if (!response.ok)
        throw new Error(
          getApiMessage(body, "Não foi possível salvar a revisão."),
        );
      onSummaryChange(body);
      setChoices({});
      toast.success(getApiMessage(body, "Revisão de conciliação salva."));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível comunicar com o servidor.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="gap-3 border-b bg-muted/20 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Revisão entre negociações e movimentações
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Confira os dados dos dois arquivos. Uma sugestão só vira vínculo
            depois da sua decisão.
          </p>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <p>
            {summary.candidates.length + summary.ambiguous.length} revisão(ões)
            pendente(s)
          </p>
          <p>{summary.confirmed.length} vínculo(s) confirmado(s)</p>
          <p>{summary.separated.length} par(es) mantido(s) separado(s)</p>
          <p>
            {summary.unmatched.length} negociação(ões) sem movimento compatível
          </p>
        </div>
        {!summary.history.complete && (
          <Alert>
            <AlertTitle>Histórico parcial</AlertTitle>
            <AlertDescription>
              A correspondência entre arquivos não comprova o histórico integral
              de operações, custo médio, saldo ou resultado. Esses cálculos não
              são derivados desta importação.
              {summary.history.reasons.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {summary.history.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}
        {(summary.duplicateCandidates.length > 0 ||
          summary.movementDuplicateCandidates.length > 0) && (
          <Alert>
            <AlertTitle>Linhas repetidas preservadas</AlertTitle>
            <AlertDescription>
              {summary.duplicateCandidates.length} grupo(s) em Negociação e{" "}
              {summary.movementDuplicateCandidates.length} grupo(s) em
              Movimentação contêm linhas possivelmente repetidas. Todas as
              ocorrências foram mantidas para revisão.
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {[
                  ...summary.duplicateCandidates.map((group) => ({
                    ...group,
                    document: "Negociação",
                  })),
                  ...summary.movementDuplicateCandidates.map((group) => ({
                    ...group,
                    document: "Movimentação",
                  })),
                ].map((group, index) => (
                  <li
                    key={`${group.document}-${group.sourceRows.join("-")}-${index}`}
                  >
                    {group.document}: linhas {group.sourceRows.join(", ")} (
                    {group.occurrenceCount} ocorrências)
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardHeader>
      {groups.length > 0 && (
        <CardContent className="space-y-4 p-4 sm:p-5">
          <ol className="space-y-3">
            {groups.map((group) => {
              const firstPair = group.pairs[0];
              const { trade } = firstPair;
              const tradeIdentity = trade.ticker ?? trade.product;
              return (
                <li key={group.tradeId}>
                  <Card>
                    <CardHeader className="p-4 pb-2">
                      <h3 className="text-sm font-semibold tracking-tight">
                        {trade.side === "BUY" ? "Compra" : "Venda"} de{" "}
                        {tradeIdentity} em {displayDate(trade.date)}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Negociação: {number.format(Number(trade.quantity))} ·{" "}
                        {displayMoney(trade.value)} ·{" "}
                        {trade.institution ?? "instituição não informada"}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-2 p-4 pt-2">
                      {group.pairs.map((pair) => (
                        <Button
                          key={pair.movementId}
                          type="button"
                          variant={
                            choices[group.tradeId] === pair.movementId
                              ? "default"
                              : "outline"
                          }
                          className="h-auto w-full justify-start whitespace-normal py-2 text-left"
                          aria-pressed={
                            choices[group.tradeId] === pair.movementId
                          }
                          disabled={saving}
                          onClick={() =>
                            setChoices((current) => ({
                              ...current,
                              [group.tradeId]: pair.movementId,
                            }))
                          }
                        >
                          <span className="block">
                            Vincular a: {pairLabel(pair)}
                          </span>
                          {pair.valueComparison === "different" &&
                            pair.valueDifferenceCents !== null &&
                            pair.valueDifferenceCents !== undefined && (
                              <span className="mt-1 block text-xs text-destructive">
                                Valores diferem em{" "}
                                {formatCurrencyCents(
                                  BigInt(pair.valueDifferenceCents) < 0n
                                    ? -BigInt(pair.valueDifferenceCents)
                                    : BigInt(pair.valueDifferenceCents),
                                )}
                              </span>
                            )}
                          {pair.valueComparison === "unavailable" && (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              Valores não comparáveis
                            </span>
                          )}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        variant={
                          choices[group.tradeId] === null
                            ? "secondary"
                            : "outline"
                        }
                        className="h-auto w-full justify-start whitespace-normal py-2 text-left"
                        aria-pressed={choices[group.tradeId] === null}
                        disabled={saving}
                        onClick={() =>
                          setChoices((current) => ({
                            ...current,
                            [group.tradeId]: null,
                          }))
                        }
                      >
                        Manter sem vínculo
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ol>
          <Button
            type="button"
            disabled={!allDecisionsMade || saving}
            onClick={() => void saveDecisions()}
          >
            {saving ? "Salvando revisão..." : "Salvar decisões de conciliação"}
          </Button>
        </CardContent>
      )}
      {groups.length === 0 && summary.confirmed.length === 0 && (
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            Não há correspondências para revisar. Os registros importados
            continuam preservados separadamente.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
