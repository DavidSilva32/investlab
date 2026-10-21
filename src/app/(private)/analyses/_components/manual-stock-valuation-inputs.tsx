"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { apiRequest } from "@/lib/api-client";

export type ManualStockValuationInput = {
  inputKey: "analysis_ltm_eps" | "analysis_bvps";
  value: number;
  source: string;
  asOf: string;
};

type InputKey = ManualStockValuationInput["inputKey"];
type Draft = { value: string; source: string; asOf: string };
type InputResponse = { inputs: ManualStockValuationInput[] };

const fields: Array<{
  inputKey: InputKey;
  label: string;
  guidance: string;
}> = [
  {
    inputKey: "analysis_ltm_eps",
    label: "Lucro por ação nos últimos 12 meses (LPA)",
    guidance:
      "Informe o LPA dos últimos 12 meses, publicado pela empresa ou por uma fonte confiável. Se for zero ou negativo, o P/L não será calculado.",
  },
  {
    inputKey: "analysis_bvps",
    label: "Valor patrimonial por ação (VPA)",
    guidance:
      "Informe o VPA por ação na data-base do balanço, sem usar o patrimônio total da empresa.",
  },
];

const emptyDraft: Draft = { value: "", source: "", asOf: "" };

export function ManualStockValuationInputs({
  ticker,
  quoteAvailable,
  onChange,
}: {
  ticker: string;
  quoteAvailable: boolean;
  onChange: (inputs: ManualStockValuationInput[]) => void;
}) {
  const [inputs, setInputs] = useState<ManualStockValuationInput[]>([]);
  const [appliedKeys, setAppliedKeys] = useState<InputKey[]>([]);
  const [drafts, setDrafts] = useState<Record<InputKey, Draft>>({
    analysis_ltm_eps: emptyDraft,
    analysis_bvps: emptyDraft,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<InputKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiRequest<InputResponse>(
      `/api/analyses/stocks/${encodeURIComponent(ticker)}/manual-inputs`,
      undefined,
      "Não foi possível carregar os valores informados.",
    )
      .then(({ inputs: loaded }) => {
        if (!active) return;
        setInputs(loaded);
        setDrafts((current) => ({
          ...current,
          ...Object.fromEntries(
            loaded.map((input) => [
              input.inputKey,
              {
                value: String(input.value),
                source: input.source,
                asOf: input.asOf,
              },
            ]),
          ),
        }));
      })
      .catch(() => {
        if (active)
          setError("Não foi possível carregar os valores informados.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ticker]);

  useEffect(
    () =>
      onChange(inputs.filter((input) => appliedKeys.includes(input.inputKey))),
    [appliedKeys, inputs, onChange],
  );

  function updateDraft(inputKey: InputKey, field: keyof Draft, value: string) {
    setDrafts((current) => ({
      ...current,
      [inputKey]: { ...current[inputKey], [field]: value },
    }));
    setMessage(null);
    setError(null);
  }

  async function saveInput(inputKey: InputKey) {
    const draft = drafts[inputKey];
    setSaving(inputKey);
    setError(null);
    setMessage(null);
    try {
      const saved = await apiRequest<ManualStockValuationInput>(
        `/api/analyses/stocks/${encodeURIComponent(ticker)}/manual-inputs/${inputKey}`,
        {
          method: "PUT",
          body: JSON.stringify({
            value: Number(draft.value.replace(",", ".")),
            source: draft.source,
            asOf: draft.asOf,
          }),
        },
        "Não foi possível salvar os valores informados.",
      );
      setInputs((current) => [
        ...current.filter((input) => input.inputKey !== inputKey),
        saved,
      ]);
      setAppliedKeys((current) =>
        current.includes(inputKey) ? current : [...current, inputKey],
      );
      setMessage(
        `${fields.find((field) => field.inputKey === inputKey)!.label} salvo.`,
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar os valores informados.",
      );
    } finally {
      setSaving(null);
    }
  }

  function applySavedInputs() {
    setAppliedKeys(inputs.map((input) => input.inputKey));
    setMessage("Valores salvos aplicados nesta análise.");
  }

  return (
    <section
      aria-labelledby="manual-stock-valuation-heading"
      className="space-y-3 rounded-lg border bg-muted/20 p-4"
    >
      <div>
        <h4 id="manual-stock-valuation-heading" className="font-medium">
          Completar P/L e P/VP
        </h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Informe os valores por ação e a fonte. Usaremos a cotação mais recente
          para calcular os indicadores; os dados ficam salvos só na sua conta.
        </p>
      </div>
      {!quoteAvailable && (
        <p role="status" className="text-sm text-status-warning">
          A cotação atual ainda não está confirmada. Você pode salvar os dados;
          os múltiplos serão calculados quando houver uma cotação recente.
        </p>
      )}
      {inputs.some((input) => !appliedKeys.includes(input.inputKey)) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-status-warning/30 bg-status-warning/5 p-3">
          <p className="text-sm text-muted-foreground">
            Confira se os valores ainda correspondem ao período informado.
          </p>
          <Button type="button" variant="outline" onClick={applySavedInputs}>
            Usar valores salvos nesta análise
          </Button>
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {fields.map(({ inputKey, label, guidance }) => {
          const draft = drafts[inputKey];
          const id = `manual-valuation-${ticker}-${inputKey}`;
          return (
            <form
              key={inputKey}
              className="space-y-3 rounded-md border bg-background p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void saveInput(inputKey);
              }}
            >
              <div>
                <Label htmlFor={`${id}-value`}>{label}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{guidance}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`${id}-value`}>Valor em reais por ação</Label>
                  <Input
                    id={`${id}-value`}
                    inputMode="decimal"
                    type="number"
                    min={
                      inputKey === "analysis_bvps" ? "0.00000001" : undefined
                    }
                    step="any"
                    required
                    value={draft.value}
                    onChange={(event) =>
                      updateDraft(inputKey, "value", event.target.value)
                    }
                    placeholder="Ex.: 3,25"
                  />
                </div>
                <DatePickerField
                  id={`${id}-date`}
                  label="Data de referência"
                  value={draft.asOf}
                  onChange={(value) => updateDraft(inputKey, "asOf", value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${id}-source`}>Fonte consultada</Label>
                <Input
                  id={`${id}-source`}
                  required
                  minLength={2}
                  maxLength={160}
                  value={draft.source}
                  onChange={(event) =>
                    updateDraft(inputKey, "source", event.target.value)
                  }
                  placeholder="Ex.: Relações com Investidores"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {inputs.some((input) => input.inputKey === inputKey)
                    ? "Valor salvo na sua conta"
                    : "Ainda não informado"}
                </p>
                <Button
                  type="submit"
                  size="sm"
                  disabled={saving !== null || loading}
                >
                  <Save className="mr-1.5 size-4" aria-hidden="true" />
                  {saving === inputKey ? "Salvando…" : "Salvar valor"}
                </Button>
              </div>
              {inputKey === "analysis_ltm_eps" &&
                (inputs.find((input) => input.inputKey === inputKey)?.value ??
                  1) <= 0 && (
                  <p role="status" className="text-xs text-muted-foreground">
                    LPA zero ou negativo: o P/L não é calculado para esse
                    resultado.
                  </p>
                )}
            </form>
          );
        })}
      </div>
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando valores salvos…
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-status-success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
