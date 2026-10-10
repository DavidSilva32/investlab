"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleHelp,
  CircleX,
  MinusCircle,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  defaultStockCriteriaPreferences,
  stockCriteriaPreferencesStorageKey,
  stockCriteriaPreferencesUpdatedEvent,
  stockCriteriaPresets,
  useStockCriteriaPreferences,
} from "@/lib/stock-criteria-preferences";
import {
  evaluateStockCriteria,
  type StockCriteriaPreferences,
  type StockCriteriaPreset,
  type StockCriteriaStatus,
  type StockCriterionResult,
} from "@/lib/stock-criteria-evaluation";
import type { StockAnalysis } from "./stock-analysis-types";

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

const statePresentation: Record<
  StockCriteriaStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  meets: {
    label: "Dentro do limite",
    className:
      "border-status-success/30 bg-status-success/10 text-status-success",
    Icon: CheckCircle2,
  },
  fails: {
    label: "Fora do limite",
    className:
      "border-status-warning/30 bg-status-warning/10 text-status-warning",
    Icon: CircleX,
  },
  unavailable: {
    label: "Sem base confiável",
    className: "border-border bg-muted/60 text-muted-foreground",
    Icon: CircleHelp,
  },
  not_applicable: {
    label: "Não se aplica",
    className: "border-border bg-muted/60 text-muted-foreground",
    Icon: MinusCircle,
  },
};

function findRoeEquity(analysis: StockAnalysis) {
  const roe = analysis.indicators.find((indicator) => indicator.key === "roe");
  if (!roe?.referenceDate || !roe.sourceDocument) return null;
  const period = analysis.fundamentals.find(
    (item) =>
      item.referenceDate === roe.referenceDate &&
      item.sourceDocument === roe.sourceDocument &&
      item.equity !== null,
  );
  if (!period?.equity) return null;
  const equity = Number(period.equity);
  return Number.isFinite(equity)
    ? { value: equity, referenceDate: period.referenceDate }
    : null;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeZone: "UTC",
      }).format(timestamp)
    : null;
}

function dateTimeLabel(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(timestamp)
    : null;
}

function statusLabel(result: StockCriterionResult, key: "pe" | "pb" | "roe") {
  if (result.reason === "threshold_not_configured" && result.value !== null)
    return `${numberFormatter.format(result.value)}x · sem limite`;
  if (result.status !== "meets" && result.status !== "fails")
    return statePresentation[result.status].label;
  if (key === "roe")
    return `${numberFormatter.format(result.value!)}% · mín. ${numberFormatter.format(result.threshold!)}%`;
  return `${numberFormatter.format(result.value!)}x · máx. ${numberFormatter.format(result.threshold!)}x`;
}

function reasonText(result: StockCriterionResult) {
  switch (result.reason) {
    case "industrial_indicator_not_in_contract":
      return "A fonte atual ainda não fornece este indicador reconciliado.";
    case "financial_sector_methodology_required":
      return "Este indicador não usa a mesma metodologia para este setor.";
    case "financial_roe_requires_ltm":
      return "Para bancos, o ROE só é comparado com lucro dos últimos 12 meses.";
    case "positive_equity_required":
      return "É necessário patrimônio líquido positivo para avaliar o ROE.";
    case "instrument_type_unconfirmed":
      return "A classe do ativo ainda não foi confirmada pela fonte.";
    case "sector_not_supported":
      return "O setor não está confirmado para aplicar estes critérios.";
    case "market_data_date_required":
      return "A data da cotação usada no múltiplo não está disponível.";
    case "threshold_not_configured":
      return "O P/VP tem dado válido, mas não há limite definido para este múltiplo.";
    case "positive_multiple_required":
      return "O múltiplo precisa ser positivo para comparação; prejuízo ou patrimônio negativo não gera sinal de preço.";
    case "not_a_supported_equity_instrument":
      return "Este critério se aplica a ações individuais confirmadas.";
    default:
      return "Não há dados atuais e compatíveis para avaliar este critério.";
  }
}

function SignalTile({
  label,
  result,
  value,
  referenceDate,
  marketDataDate,
  help,
  direction,
}: {
  label: string;
  result: StockCriterionResult;
  value: string;
  referenceDate?: string | null;
  marketDataDate?: string | null;
  help: string;
  direction: "quality" | "valuation";
}) {
  const baseState = statePresentation[result.status];
  const state =
    result.reason === "threshold_not_configured"
      ? { ...baseState, label: "Sem limite configurado" }
      : baseState;
  const Icon = state.Icon;
  return (
    <li
      aria-label={`${label}: ${value}, ${state.label}`}
      className={`min-w-0 rounded-lg border p-3 ${state.className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="font-semibold text-foreground">{label}</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-muted-foreground"
                aria-label={`Ajuda sobre ${label}`}
              >
                <CircleHelp className="size-3.5" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="max-w-xs space-y-2 text-sm"
              align="start"
            >
              <p>{help}</p>
              <p className="text-muted-foreground">{reasonText(result)}</p>
              <p className="text-xs text-muted-foreground">
                {referenceDate
                  ? `Demonstrações: ${dateLabel(referenceDate) ?? "data indisponível"}.`
                  : "Data-base das demonstrações indisponível."}
                {direction === "valuation" &&
                  (dateTimeLabel(marketDataDate)
                    ? ` Cotação: ${dateTimeLabel(marketDataDate)}.`
                    : " Data da cotação indisponível.")}
              </p>
            </PopoverContent>
          </Popover>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {value}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        <span>{state.label}</span>
        <span className="text-muted-foreground">
          {result.status === "meets" || result.status === "fails"
            ? direction === "quality"
              ? "Qualidade"
              : "Valoração"
            : ""}
        </span>
      </div>
    </li>
  );
}

function PresetButton({
  id,
  selected,
  onClick,
  children,
}: {
  id: Exclude<StockCriteriaPreset, "custom">;
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={selected ? "secondary" : "outline"}
      aria-pressed={selected}
      onClick={onClick}
    >
      {children}
      <span className="sr-only">{id}</span>
    </Button>
  );
}

export function StockCriteriaSummary({
  analysis,
}: {
  analysis: StockAnalysis;
}) {
  const storedPreferences = useStockCriteriaPreferences();
  const [temporaryPreferences, setTemporaryPreferences] =
    useState<StockCriteriaPreferences | null>(null);
  const preferences = temporaryPreferences ?? storedPreferences;
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [presetDraft, setPresetDraft] =
    useState<StockCriteriaPreset>("balanced");
  const [maximumPeDraft, setMaximumPeDraft] = useState("15");
  const [maximumPbDraft, setMaximumPbDraft] = useState("");
  const [minimumRoeDraft, setMinimumRoeDraft] = useState("15");
  const [storageMessage, setStorageMessage] = useState<string | null>(null);

  const roeEquity = useMemo(() => findRoeEquity(analysis), [analysis]);
  const criteria = useMemo(() => {
    const indicators = analysis.indicators.map((indicator) => {
      const isStale =
        analysis.fundamentalsIsStale ||
        ((indicator.key === "pe" || indicator.key === "pb") &&
          analysis.priceIsStale === true);
      return {
        ...indicator,
        value: isStale ? null : indicator.value,
        unavailableReason: isStale
          ? "Os dados estão desatualizados para avaliação."
          : indicator.unavailableReason,
      };
    });
    return evaluateStockCriteria({
      instrument: analysis.instrumentType ?? "unknown",
      sector: analysis.issuerSector ?? null,
      indicators,
      equity: analysis.fundamentalsIsStale ? null : (roeEquity?.value ?? null),
      equityReferenceDate: roeEquity?.referenceDate ?? null,
      price: analysis.priceIsStale ? null : analysis.price,
      preferences,
    });
  }, [analysis, preferences, roeEquity]);

  const evaluated = [
    ...Object.values(criteria.qualityCriteria),
    ...Object.values(criteria.valuationCriteria),
  ].filter(({ status }) => status === "meets" || status === "fails");
  const issuerMetadataDate = dateLabel(analysis.issuerMetadataUpdatedAt);

  function applyPreset(preset: Exclude<StockCriteriaPreset, "custom">) {
    const values = stockCriteriaPresets[preset];
    setPresetDraft(preset);
    setMaximumPeDraft(String(values.maximumPe));
    setMaximumPbDraft("");
    setMinimumRoeDraft(String(values.minimumRoePercent));
  }

  function savePreferences() {
    const maximumPe = Number(maximumPeDraft.replace(",", "."));
    const maximumPb = maximumPbDraft.trim()
      ? Number(maximumPbDraft.replace(",", "."))
      : null;
    const minimumRoePercent = Number(minimumRoeDraft.replace(",", "."));
    if (
      !Number.isFinite(maximumPe) ||
      maximumPe <= 0 ||
      (maximumPb !== null && (!Number.isFinite(maximumPb) || maximumPb <= 0)) ||
      !Number.isFinite(minimumRoePercent) ||
      minimumRoePercent <= 0
    ) {
      setStorageMessage("Informe limites maiores que zero.");
      return;
    }
    const next = {
      preset: presetDraft,
      maximumPe,
      maximumPb,
      minimumRoePercent,
    };
    try {
      window.localStorage.setItem(
        stockCriteriaPreferencesStorageKey,
        JSON.stringify(next),
      );
      setTemporaryPreferences(null);
      window.dispatchEvent(new Event(stockCriteriaPreferencesUpdatedEvent));
      setStorageMessage("Critérios salvos neste navegador.");
    } catch {
      setTemporaryPreferences(next);
      setStorageMessage("Critérios aplicados até fechar esta página.");
    }
    setPreferencesOpen(false);
  }

  function restoreDefaults() {
    setPresetDraft(defaultStockCriteriaPreferences.preset);
    setMaximumPeDraft(String(defaultStockCriteriaPreferences.maximumPe));
    setMaximumPbDraft("");
    setMinimumRoeDraft(
      String(defaultStockCriteriaPreferences.minimumRoePercent),
    );
    try {
      window.localStorage.removeItem(stockCriteriaPreferencesStorageKey);
      setTemporaryPreferences(null);
      window.dispatchEvent(new Event(stockCriteriaPreferencesUpdatedEvent));
      setStorageMessage("Padrões restaurados neste navegador.");
    } catch {
      setTemporaryPreferences(defaultStockCriteriaPreferences);
      setStorageMessage("Padrões restaurados até fechar esta página.");
    }
  }

  const indicator = (key: "pe" | "pb" | "roe") =>
    analysis.indicators.find((item) => item.key === key);
  const rows = [
    {
      key: "roe",
      label: "ROE",
      result: criteria.qualityCriteria.roe,
      value: statusLabel(criteria.qualityCriteria.roe, "roe"),
      referenceDate: indicator("roe")?.referenceDate,
      help: "Relaciona o lucro líquido ao patrimônio líquido médio. Ganhos fora do comum ou patrimônio reduzido podem distorcer a leitura.",
      direction: "quality" as const,
    },
    {
      key: "netDebtToEbitda",
      label: "Dív. Líq./EBITDA",
      result: criteria.qualityCriteria.netDebtToEbitda,
      value: "—",
      referenceDate: null,
      help: "Indica quanto a dívida líquida representa em relação à geração operacional de caixa. O contrato atual não fornece EBITDA reconciliado.",
      direction: "quality" as const,
    },
    {
      key: "roic",
      label: "ROIC",
      result: criteria.qualityCriteria.roic,
      value: "—",
      referenceDate: null,
      help: "Mede o retorno sobre o capital investido. Ainda faltam EBIT após impostos e capital médio compatíveis.",
      direction: "quality" as const,
    },
    {
      key: "pe",
      label: "P/L",
      result: criteria.valuationCriteria.pe,
      value: statusLabel(criteria.valuationCriteria.pe, "pe"),
      referenceDate: indicator("pe")?.referenceDate,
      marketDataDate: indicator("pe")?.marketDataDate,
      help: "Compara valor de mercado e lucro positivo. Para bancos e seguradoras, este critério fica fora da metodologia atual.",
      direction: "valuation" as const,
    },
    {
      key: "pb",
      label: "P/VP",
      result: criteria.valuationCriteria.pb,
      value: statusLabel(criteria.valuationCriteria.pb, "pb"),
      referenceDate: indicator("pb")?.referenceDate,
      marketDataDate: indicator("pb")?.marketDataDate,
      help: "Compara valor de mercado com patrimônio líquido positivo. É um múltiplo de preço, separado da qualidade operacional.",
      direction: "valuation" as const,
    },
  ];

  return (
    <section
      className="space-y-3 border-t pt-4"
      aria-labelledby="stock-criteria-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <h3 id="stock-criteria-heading" className="font-medium">
              Critérios de análise
            </h3>
            <p className="text-xs text-muted-foreground">
              {`Setor CVM: ${analysis.issuerSector ?? "não confirmado"}`}
              {analysis.issuerMetadataUpdatedAt &&
                ` · CVM ${issuerMetadataDate ?? "data indisponível"}`}
              {` · ${evaluated.length} ${evaluated.length === 1 ? "sinal avaliável" : "sinais avaliáveis"}`}
            </p>
          </div>
        </div>
        <Dialog
          open={preferencesOpen}
          onOpenChange={(open) => {
            setPreferencesOpen(open);
            if (open) {
              setPresetDraft(preferences.preset);
              setMaximumPeDraft(String(preferences.maximumPe));
              setMaximumPbDraft(
                preferences.maximumPb === null
                  ? ""
                  : String(preferences.maximumPb),
              );
              setMinimumRoeDraft(String(preferences.minimumRoePercent));
              setStorageMessage(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Settings2 className="mr-2 size-4" aria-hidden="true" />
              Critérios
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Seus limites de referência</DialogTitle>
              <DialogDescription>
                Ajuste múltiplos de preço e qualidade financeira para estudo. Os
                limites não recomendam compra nem movimentam a carteira.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Escolha uma referência inicial
                </legend>
                <div className="flex flex-wrap gap-2">
                  <PresetButton
                    id="conservative"
                    selected={presetDraft === "conservative"}
                    onClick={() => applyPreset("conservative")}
                  >
                    Conservador
                  </PresetButton>
                  <PresetButton
                    id="balanced"
                    selected={presetDraft === "balanced"}
                    onClick={() => applyPreset("balanced")}
                  >
                    Equilibrado
                  </PresetButton>
                  <Button
                    type="button"
                    size="sm"
                    variant={presetDraft === "custom" ? "secondary" : "outline"}
                    aria-pressed={presetDraft === "custom"}
                    onClick={() => setPresetDraft("custom")}
                  >
                    Personalizado
                  </Button>
                </div>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="stock-criteria-maximum-pe">P/L máximo</Label>
                  <Input
                    id="stock-criteria-maximum-pe"
                    type="number"
                    min="0.01"
                    step="0.1"
                    value={maximumPeDraft}
                    onChange={(event) => {
                      setMaximumPeDraft(event.target.value);
                      setPresetDraft("custom");
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="stock-criteria-maximum-pb">P/VP máximo</Label>
                  <Input
                    id="stock-criteria-maximum-pb"
                    type="number"
                    min="0.01"
                    step="0.1"
                    value={maximumPbDraft}
                    placeholder="Sem limite padrão"
                    aria-describedby="stock-criteria-maximum-pb-help"
                    onChange={(event) => {
                      setMaximumPbDraft(event.target.value);
                      setPresetDraft("custom");
                    }}
                  />
                  <p
                    id="stock-criteria-maximum-pb-help"
                    className="text-xs text-muted-foreground"
                  >
                    Sem um limite próprio, o múltiplo aparece sem sinal.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="stock-criteria-minimum-roe">
                    ROE mínimo (%)
                  </Label>
                  <Input
                    id="stock-criteria-minimum-roe"
                    type="number"
                    min="0.01"
                    step="0.1"
                    value={minimumRoeDraft}
                    onChange={(event) => {
                      setMinimumRoeDraft(event.target.value);
                      setPresetDraft("custom");
                    }}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Padrão equilibrado: P/L até 15x, P/VP até 2,5x e ROE a partir de
                15%. Salvo neste navegador.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={restoreDefaults}>
                Restaurar padrões
              </Button>
              <Button type="button" onClick={savePreferences}>
                Salvar limites
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {storageMessage && (
        <p role="status" className="text-xs text-muted-foreground">
          {storageMessage}
        </p>
      )}
      {analysis.fundamentalsIsStale && (
        <p role="status" className="text-xs text-status-warning">
          Demonstrações antigas; sinais financeiros temporariamente
          indisponíveis.
        </p>
      )}

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Qualidade financeira
        </p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {rows
            .filter((row) => row.direction === "quality")
            .map(({ key, ...row }) => (
              <SignalTile key={key} {...row} />
            ))}
        </ul>
      </div>
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Valoração e preço
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows
            .filter((row) => row.direction === "valuation")
            .map(({ key, ...row }) => (
              <SignalTile key={key} {...row} />
            ))}
        </ul>
      </div>
      {analysis.instrumentType === "stock" && (
        <p className="text-xs text-muted-foreground">
          DY não é exibido sem cobertura recorrente completa. Graham e Bazin
          ficam como referências manuais em Oportunidades, sem compor estes
          sinais.
        </p>
      )}
    </section>
  );
}
