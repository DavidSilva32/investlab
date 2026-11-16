"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api-client";
import { getApiMessage } from "@/lib/api-message";
import { queryKeys } from "@/lib/query-keys";
import { formatAmountInput, parseBrazilianAmount } from "@/lib/currency-input";
import { formatCurrency } from "@/lib/utils";

type ReserveSettings = {
  monthlyExpenses: number | string | null;
  targetMonths: number | null;
};

const loadErrorMessage = "Não foi possível carregar a configuração da reserva.";

export function EmergencyReserveEditor() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.portfolio.emergencyReserve(),
    queryFn: () =>
      apiRequest<ReserveSettings>(
        "/api/emergency-reserve",
        undefined,
        loadErrorMessage,
      ),
  });
  const data = query.data;
  const [monthlyExpenses, setMonthlyExpenses] = useState("");
  const [targetMonths, setTargetMonths] = useState("");
  const [hasEditedExpenses, setHasEditedExpenses] = useState(false);
  const [hasEditedTarget, setHasEditedTarget] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configuredExpenses = Number(data?.monthlyExpenses);
  const displayedMonthlyExpenses = hasEditedExpenses
    ? monthlyExpenses
    : Number.isFinite(configuredExpenses) && configuredExpenses > 0
      ? formatAmountInput(configuredExpenses.toFixed(2))
      : "";
  const displayedTargetMonths = hasEditedTarget
    ? targetMonths
    : data?.targetMonths === null || data?.targetMonths === undefined
      ? ""
      : String(data.targetMonths);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const expenses = parseBrazilianAmount(displayedMonthlyExpenses);
    const months = Number(displayedTargetMonths);
    if (!Number.isFinite(expenses) || expenses <= 0) {
      setError("Informe as despesas mensais em reais.");
      return;
    }
    if (!Number.isInteger(months) || months < 1 || months > 1200) {
      setError("Informe uma meta entre 1 e 1.200 meses.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/emergency-reserve", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          monthlyExpenses: expenses,
          targetMonths: months,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(
          getApiMessage(
            body,
            "Não foi possível salvar a configuração da reserva.",
          ),
        );
        return;
      }
      toast.success(getApiMessage(body, "Configuração da reserva atualizada."));
      await queryClient.invalidateQueries({
        queryKey: queryKeys.portfolio.emergencyReserve(),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.portfolio.objectives(),
      });
    } catch {
      toast.error("Não foi possível salvar a configuração da reserva.");
    } finally {
      setSaving(false);
    }
  }

  const expenses = parseBrazilianAmount(displayedMonthlyExpenses);
  const months = Number(displayedTargetMonths);
  const target =
    Number.isFinite(expenses) && Number.isInteger(months) && months > 0
      ? expenses * months
      : null;

  if (query.isPending)
    return (
      <div
        role="status"
        aria-label="Carregando configuração da reserva"
        className="rounded-xl border p-5"
      >
        Carregando…
      </div>
    );
  if (query.error)
    return (
      <div
        role="alert"
        className="space-y-3 rounded-xl border p-5 text-sm text-destructive"
      >
        <p>{query.error.message}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void query.refetch()}
        >
          Tentar novamente
        </Button>
      </div>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Meta da Reserva de emergência
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Defina suas despesas mensais e quantos meses quer cobrir. O saldo da
          Reserva é atualizado separadamente pelo valor informado no banco.
        </p>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => void save(event)}
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="reserve-monthly-expenses">
              Despesas mensais (R$)
            </Label>
            <Input
              id="reserve-monthly-expenses"
              value={displayedMonthlyExpenses}
              inputMode="numeric"
              onChange={(event) => {
                setHasEditedExpenses(true);
                setMonthlyExpenses(formatAmountInput(event.target.value));
                setError(null);
              }}
              aria-invalid={Boolean(error)}
              placeholder="0,00"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reserve-target-months">Meta (meses)</Label>
            <Input
              id="reserve-target-months"
              value={displayedTargetMonths}
              inputMode="numeric"
              onChange={(event) => {
                setHasEditedTarget(true);
                setTargetMonths(event.target.value.replace(/\D/g, ""));
                setError(null);
              }}
              placeholder="12"
              required
            />
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground">
              Valor da meta calculado
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {target === null
                ? "Informe despesas e meses"
                : formatCurrency(target)}
            </p>
            <p className="text-xs text-muted-foreground">
              Despesas mensais × meses escolhidos.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {error}
            </p>
          )}
          <div className="sm:col-span-2 sm:flex sm:justify-end">
            <Button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto"
            >
              {saving ? "Salvando…" : "Salvar configuração"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
