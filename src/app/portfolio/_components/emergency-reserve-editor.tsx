"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Reserva de emergência</CardTitle>
        <p className="text-sm text-muted-foreground">
          Defina seu custo mensal e sua meta pessoal em meses. A meta é uma
          configuração sua, não uma regra universal.
        </p>
      </CardHeader>
      <CardContent>
        {loading && <p role="status">Carregando configuração da reserva…</p>}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="monthly-expenses">Custo mensal</Label>
                <Input
                  id="monthly-expenses"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={monthlyExpenses}
                  onChange={(event) => setMonthlyExpenses(event.target.value)}
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

            <fieldset className="space-y-3">
              <legend className="font-medium">
                Investimentos que você quer considerar na reserva
              </legend>
              <p className="text-sm text-muted-foreground">
                Selecione os grupos que deseja acompanhar. A seleção usa os
                atributos disponíveis na importação e não confirma prazo ou
                condições de resgate.
              </p>
              {data.missingSelectionCount > 0 && (
                <div
                  role="status"
                  className="space-y-3 rounded-md border p-3 text-sm"
                >
                  <p>
                    {data.missingSelectionCount} grupo(s) selecionado(s) não tem
                    correspondência inequívoca com a importação mais recente e
                    fica(m) fora do cálculo até ser(em) selecionado(s)
                    novamente.
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
                            [...current].filter((key) => visibleKeys.has(key)),
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
                  Importe uma posição da carteira para escolher os investimentos
                  da reserva.
                </p>
              ) : (
                <ul className="max-h-80 space-y-2 overflow-y-auto rounded-lg border p-3">
                  {data.holdings.map((holding) => (
                    <li key={holding.assetKey}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/60">
                        <input
                          type="checkbox"
                          className="mt-1 size-4 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          checked={selectedKeys.has(holding.assetKey)}
                          onChange={() => toggleHolding(holding.assetKey)}
                        />
                        <span className="min-w-0 flex-1">
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
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>

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
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar configuração"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
