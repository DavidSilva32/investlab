"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { EmergencyReservePositionSuggestionsCard } from "@/app/portfolio/_components/emergency-reserve-position-suggestions";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";
import { formatCurrency } from "@/lib/utils";

type Holding = {
  assetKey: string;
  product: string;
  assetCode: string | null;
  institution: string | null;
  issuer: string | null;
  indexer: string | null;
  maturityAt: string | null;
  positionCount: number;
  unvaluedPositions: number;
  value: number | null;
  selected: boolean;
};

type EditorData = {
  monthlyExpenses: number | null;
  targetMonths: number | null;
  selectedAssetKeys: string[];
  configured: boolean;
  holdings: Holding[];
  selectedPositionCount: number;
  missingSelectionCount: number;
  calculation: EmergencyReserveCalculation;
};

const loadErrorMessage = "Não foi possível carregar a configuração da reserva.";

export function EmergencyReserveEditor() {
  const [data, setData] = useState<EditorData | null>(null);
  const [monthlyExpenses, setMonthlyExpenses] = useState("");
  const [targetMonths, setTargetMonths] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(() => {
    fetch("/api/emergency-reserve")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        return body as EditorData;
      })
      .then((body) => {
        setData(body);
        setMonthlyExpenses(body.monthlyExpenses?.toString() ?? "");
        setTargetMonths(body.targetMonths?.toString() ?? "");
        setSelectedKeys(new Set(body.selectedAssetKeys));
        setError(null);
      })
      .catch(() => {
        setError(loadErrorMessage);
        toast.error(loadErrorMessage);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
    window.addEventListener("portfolio:updated", loadData);
    return () => window.removeEventListener("portfolio:updated", loadData);
  }, [loadData]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const expenses = Number(monthlyExpenses);
    const months = Number(targetMonths);
    if (
      !monthlyExpenses ||
      !Number.isFinite(expenses) ||
      expenses <= 0 ||
      expenses > 1_000_000_000_000
    ) {
      setFormError(
        "Informe um custo mensal maior que zero e de até R$ 1.000.000.000.000,00.",
      );
      return;
    }
    if (
      !targetMonths ||
      !Number.isInteger(months) ||
      months < 1 ||
      months > 1200
    ) {
      setFormError(
        "Informe sua meta pessoal como um número inteiro de 1 a 1200 meses.",
      );
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch("/api/emergency-reserve", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          monthlyExpenses: expenses,
          targetMonths: months,
          selectedAssetKeys: [...selectedKeys],
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setData(body as EditorData);
      setMonthlyExpenses(body.monthlyExpenses?.toString() ?? "");
      setTargetMonths(body.targetMonths?.toString() ?? "");
      setSelectedKeys(new Set(body.selectedAssetKeys));
      toast.success("Reserva atualizada com sucesso.");
      window.dispatchEvent(new Event("portfolio:updated"));
    } catch {
      setFormError("Não foi possível salvar a configuração. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  function toggleHolding(assetKey: string) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(assetKey)) next.delete(assetKey);
      else next.add(assetKey);
      return next;
    });
  }

  return (
    <section className="space-y-5" data-testid="reserve-editor">
      <p
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
        aria-live="polite"
        role={error && !data ? "alert" : "status"}
      >
        {loading
          ? "Carregando configuração..."
          : error && !data
            ? loadErrorMessage
            : data?.configured
              ? `Meta pessoal de ${data.targetMonths} meses`
              : "Configuração pessoal ainda não definida"}
        {data && (
          <>
            {" · "}
            {selectedKeys.size}{" "}
            {selectedKeys.size === 1
              ? "grupo selecionado"
              : "grupos selecionados"}
          </>
        )}
      </p>
      {loading && (
        <div
          className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
          data-testid="reserve-editor-loading-layout"
          aria-hidden="true"
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="h-16 animate-pulse rounded-md bg-muted" />
              <div className="h-16 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="h-48 animate-pulse rounded-xl bg-muted" />
          </div>
          <div className="h-72 animate-pulse rounded-xl bg-muted" />
        </div>
      )}
      {error && !data && (
        <div role="alert" className="space-y-3 text-sm text-destructive">
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLoading(true);
              loadData();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {data && (
        <form className="space-y-5" onSubmit={save}>
          <div
            className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
            data-testid="reserve-editor-layout"
          >
            <div className="space-y-5">
              <section
                aria-labelledby="reserve-target-title"
                className="space-y-4"
              >
                <h3 id="reserve-target-title" className="text-sm font-semibold">
                  Sua meta pessoal
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="monthly-expenses">Custo mensal</Label>
                    <Input
                      id="monthly-expenses"
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      value={monthlyExpenses}
                      onChange={(event) =>
                        setMonthlyExpenses(event.target.value)
                      }
                      aria-describedby="reserve-cost-help"
                      required
                    />
                    <p
                      id="reserve-cost-help"
                      className="text-xs text-muted-foreground"
                    >
                      Use o valor que melhor representa suas despesas mensais.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="target-months">Meta pessoal em meses</Label>
                    <Input
                      id="target-months"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="1200"
                      step="1"
                      value={targetMonths}
                      onChange={(event) => setTargetMonths(event.target.value)}
                      aria-describedby="reserve-months-help"
                      required
                    />
                    <p
                      id="reserve-months-help"
                      className="text-xs text-muted-foreground"
                    >
                      A meta em reais é calculada pelo custo mensal multiplicado
                      pelos meses que você definiu.
                    </p>
                  </div>
                </div>
              </section>

              <EmergencyReservePositionSuggestionsCard
                holdings={data.holdings}
                onApply={(assetKeys) => setSelectedKeys(new Set(assetKeys))}
              />
            </div>

            <fieldset className="min-w-0 space-y-3 rounded-xl border p-4">
              <legend className="px-1 text-sm font-semibold">
                Posições consideradas na reserva
              </legend>
              <p className="text-xs text-muted-foreground">
                {selectedKeys.size} selecionado(s) · {data.holdings.length}{" "}
                disponíveis
              </p>
              <fieldset className="space-y-3">
                <legend className="sr-only">
                  Investimentos que você quer considerar na reserva
                </legend>
                <p className="text-sm text-muted-foreground">
                  Somente grupos classificados como renda fixa aparecem aqui. A
                  classe não confirma prazo nem condições de resgate.
                </p>
                {data.missingSelectionCount > 0 && (
                  <div
                    role="status"
                    className="space-y-3 rounded-md border p-3 text-sm"
                  >
                    <p>
                      {data.missingSelectionCount} grupo(s) selecionado(s) não
                      tem correspondência inequívoca com a importação mais
                      recente e fica(m) fora do cálculo até ser(em)
                      selecionado(s) novamente.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const visibleKeys = new Set(
                          data.holdings.map((holding) => holding.assetKey),
                        );
                        setSelectedKeys(
                          (current) =>
                            new Set(
                              [...current].filter((key) =>
                                visibleKeys.has(key),
                              ),
                            ),
                        );
                      }}
                    >
                      Remover grupos sem correspondência
                    </Button>
                  </div>
                )}
                {data.holdings.length === 0 ? (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Importe uma posição da carteira para escolher os
                    investimentos da reserva.
                  </p>
                ) : (
                  <ul className="grid max-h-[min(28rem,45dvh)] gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-1">
                    {data.holdings.map((holding) => (
                      <li
                        key={holding.assetKey}
                        className="min-w-0 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/30"
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={`reserve-holding-${holding.assetKey}`}
                            className="mt-1"
                            checked={selectedKeys.has(holding.assetKey)}
                            onCheckedChange={() =>
                              toggleHolding(holding.assetKey)
                            }
                          />
                          <label
                            htmlFor={`reserve-holding-${holding.assetKey}`}
                            className="min-w-0 flex-1 cursor-pointer"
                          >
                            <span className="block font-medium">
                              {holding.product}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {[
                                holding.assetCode,
                                holding.institution,
                                holding.issuer,
                              ]
                                .filter(Boolean)
                                .join(" · ") ||
                                "Sem código ou instituição informados"}
                              {holding.positionCount > 1 &&
                                ` · ${holding.positionCount} posições agrupadas`}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {holding.value === null
                                ? "Sem valor informado"
                                : formatCurrency(holding.value)}
                              {holding.unvaluedPositions > 0 &&
                                ` · ${holding.unvaluedPositions} posição(ões) sem valor`}
                            </span>
                          </label>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
            </fieldset>
          </div>

          <div className="space-y-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              O cálculo usa o valor estimado para CDB DI/CDI quando disponível;
              nos demais casos, usa o valor informado na importação. Confirme
              com a instituição o prazo e as condições de resgate.
            </p>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar configuração"}
              </Button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
