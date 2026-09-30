"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PortfolioObjective } from "@/app/portfolio/_components/portfolio-objective-card";
import {
  formatAmountInput,
  formatBrazilianAmountValue,
  parseBrazilianAmount,
} from "@/lib/currency-input";

type Values = {
  name: string;
  targetAmount: number | null;
  monthlyPlannedAmount: number | null;
};

type Props = {
  objective?: PortfolioObjective;
  hideTitle?: boolean;
  saving: boolean;
  onSave: (values: Values) => Promise<void>;
  onCancel?: () => void;
};

export function PortfolioObjectiveForm({
  objective,
  hideTitle = false,
  saving,
  onSave,
  onCancel,
}: Props) {
  const [name, setName] = useState(objective?.name ?? "");
  const [targetAmount, setTargetAmount] = useState(
    objective?.targetAmount === null || objective?.targetAmount === undefined
      ? ""
      : formatBrazilianAmountValue(String(objective.targetAmount)),
  );
  const [monthlyAmount, setMonthlyAmount] = useState(
    objective?.monthlyPlannedAmount === null ||
      objective?.monthlyPlannedAmount === undefined
      ? ""
      : formatBrazilianAmountValue(String(objective.monthlyPlannedAmount)),
  );
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = targetAmount ? parseBrazilianAmount(targetAmount) : null;
    const monthly = monthlyAmount ? parseBrazilianAmount(monthlyAmount) : null;
    if (
      !name.trim() ||
      (target !== null && (!Number.isFinite(target) || target <= 0))
    ) {
      setError("Informe um nome e revise a meta em reais, se preenchida.");
      return;
    }
    if (monthlyAmount && (!Number.isFinite(monthly) || monthly! < 0)) {
      setError("Revise o valor do aporte mensal planejado.");
      return;
    }
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        targetAmount: target,
        monthlyPlannedAmount: monthly,
      });
      if (!objective) {
        setName("");
        setTargetAmount("");
        setMonthlyAmount("");
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar o objetivo.",
      );
    }
  }

  return (
    <section aria-labelledby="objective-form-title" className="space-y-3">
      {!hideTitle && (
        <h3 id="objective-form-title" className="text-sm font-semibold">
          {objective ? "Editar objetivo" : "Criar objetivo"}
        </h3>
      )}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="objective-name">Nome</Label>
          <Input
            id="objective-name"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Viagem"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="objective-target">Meta em reais (opcional)</Label>
          <Input
            id="objective-target"
            value={targetAmount}
            onChange={(event) =>
              setTargetAmount(formatAmountInput(event.target.value))
            }
            inputMode="decimal"
            placeholder="R$ 0,00"
          />
          <p className="text-xs text-muted-foreground">
            Sem meta, o objetivo acompanha o valor destinado sem calcular
            progresso ou valor restante.
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="objective-monthly">
            Aporte mensal planejado (opcional)
          </Label>
          <Input
            id="objective-monthly"
            value={monthlyAmount}
            onChange={(event) =>
              setMonthlyAmount(formatAmountInput(event.target.value))
            }
            inputMode="decimal"
            placeholder="R$ 0,00"
            aria-describedby="objective-monthly-help"
          />
          <p
            id="objective-monthly-help"
            className="text-xs text-muted-foreground"
          >
            É apenas uma intenção pessoal; não é obrigação nem será descontado
            automaticamente dos aportes.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">
            {error}
          </p>
        )}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={saving}>
            {saving
              ? "Salvando…"
              : objective
                ? "Salvar alterações"
                : "Criar objetivo"}
          </Button>
          {objective && onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={saving}
            >
              Cancelar edição
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
