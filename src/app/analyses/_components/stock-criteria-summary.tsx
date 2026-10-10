"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "@/lib/stock-criteria-evaluation";
import { classifyCvmSector } from "@/lib/cvm-sector-classification";
import type { StockAnalysis } from "./stock-analysis-types";
import { FundamentalIndicatorCard } from "./fundamental-indicator-card";

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

function PresetButton({
  selected,
  onClick,
  title,
  summary,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  summary: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-20 cursor-pointer rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-transform motion-safe:hover:-translate-y-0.5 ${selected ? "border-primary bg-primary/10" : "bg-card hover:border-primary/30 hover:bg-muted/60"}`}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-1 block text-xs text-muted-foreground">
        {summary}
      </span>
    </button>
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
  const [maximumPbDraft, setMaximumPbDraft] = useState("2.5");
  const [hasMaximumPbDraft, setHasMaximumPbDraft] = useState(true);
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

  function applyPreset(preset: Exclude<StockCriteriaPreset, "custom">) {
    const values = stockCriteriaPresets[preset];
    setPresetDraft(preset);
    setMaximumPeDraft(String(values.maximumPe));
    setMaximumPbDraft(String(values.maximumPb));
    setHasMaximumPbDraft(values.maximumPb !== null);
    setMinimumRoeDraft(String(values.minimumRoePercent));
  }

  function savePreferences() {
    const maximumPe = Number(maximumPeDraft.replace(",", "."));
    const maximumPb = hasMaximumPbDraft
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
      setStorageMessage("Use limites maiores que zero.");
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
      setStorageMessage("Limites salvos neste navegador.");
    } catch {
      setTemporaryPreferences(next);
      setStorageMessage("Limites ativos até fechar esta página.");
    }
    setPreferencesOpen(false);
  }

  function restoreDefaults() {
    setPresetDraft(defaultStockCriteriaPreferences.preset);
    setMaximumPeDraft(String(defaultStockCriteriaPreferences.maximumPe));
    setMaximumPbDraft(String(defaultStockCriteriaPreferences.maximumPb));
    setHasMaximumPbDraft(defaultStockCriteriaPreferences.maximumPb !== null);
    setMinimumRoeDraft(
      String(defaultStockCriteriaPreferences.minimumRoePercent),
    );
    try {
      window.localStorage.removeItem(stockCriteriaPreferencesStorageKey);
      setTemporaryPreferences(null);
      window.dispatchEvent(new Event(stockCriteriaPreferencesUpdatedEvent));
      setStorageMessage("Padrões restaurados.");
    } catch {
      setTemporaryPreferences(defaultStockCriteriaPreferences);
      setStorageMessage("Padrões restaurados até fechar esta página.");
    }
  }

  const sectorClass = classifyCvmSector(analysis.issuerSector);
  const resultFor = (key: "pe" | "pb" | "roe") =>
    key === "roe"
      ? criteria.qualityCriteria.roe
      : criteria.valuationCriteria[key];
  const netMarginNotApplicable =
    sectorClass === "financial" ||
    sectorClass === "ambiguous" ||
    sectorClass === "unknown"
      ? sectorClass === "financial"
        ? "A margem baseada em receita não é comparável com segurança neste setor."
        : "A margem não é avaliada sem classificação setorial confirmada."
      : null;

  return (
    <section
      className="space-y-3"
      aria-labelledby="financial-indicators-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 id="financial-indicators-heading" className="font-semibold">
            Indicadores financeiros
          </h3>
          {analysis.issuerSector && (
            <span className="hidden rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground sm:inline-flex">
              {analysis.issuerSector}
            </span>
          )}
        </div>
        <Dialog
          open={preferencesOpen}
          onOpenChange={(open) => {
            setPreferencesOpen(open);
            if (open) {
              setPresetDraft(preferences.preset);
              setMaximumPeDraft(String(preferences.maximumPe));
              setMaximumPbDraft(String(preferences.maximumPb ?? ""));
              setHasMaximumPbDraft(preferences.maximumPb !== null);
              setMinimumRoeDraft(String(preferences.minimumRoePercent));
              setStorageMessage(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Settings2 className="mr-1.5 size-4" aria-hidden="true" />
              Limites
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Limites de referência</DialogTitle>
              <DialogDescription>
                Parâmetros ajustáveis para estudo; não são recomendações.
              </DialogDescription>
            </DialogHeader>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                Escolha uma referência
              </legend>
              <div className="grid gap-2 sm:grid-cols-3">
                <PresetButton
                  title="Conservador"
                  summary="P/L 10x · P/VP 1,5x · ROE 20%"
                  selected={presetDraft === "conservative"}
                  onClick={() => applyPreset("conservative")}
                />
                <PresetButton
                  title="Equilibrado"
                  summary="P/L 15x · P/VP 2,5x · ROE 15%"
                  selected={presetDraft === "balanced"}
                  onClick={() => applyPreset("balanced")}
                />
                <PresetButton
                  title="Personalizado"
                  summary="Defina seus próprios limites"
                  selected={presetDraft === "custom"}
                  onClick={() => setPresetDraft("custom")}
                />
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
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
                <div className="flex min-h-6 items-center justify-between gap-2">
                  <Label htmlFor="stock-criteria-maximum-pb">P/VP máximo</Label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      id="stock-criteria-enable-pb"
                      checked={hasMaximumPbDraft}
                      onCheckedChange={(checked) => {
                        setHasMaximumPbDraft(checked === true);
                        setPresetDraft("custom");
                      }}
                    />
                    Ativo
                  </label>
                </div>
                <Input
                  id="stock-criteria-maximum-pb"
                  type="number"
                  min="0.01"
                  step="0.1"
                  disabled={!hasMaximumPbDraft}
                  value={maximumPbDraft}
                  placeholder="Desativado"
                  onChange={(event) => {
                    setMaximumPbDraft(event.target.value);
                    setPresetDraft("custom");
                  }}
                />
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
              Referências configuráveis, que variam conforme setor e empresa.
              Salvas neste navegador.
            </p>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={restoreDefaults}>
                <RotateCcw className="mr-1.5 size-4" aria-hidden="true" />
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
      <div
        role="list"
        aria-label="Indicadores e avaliação"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {analysis.indicators.map((indicator) => {
          const key = indicator.key;
          const criterion =
            key === "pe" || key === "pb" || key === "roe"
              ? resultFor(key)
              : undefined;
          const stale =
            Boolean(analysis.fundamentalsIsStale) ||
            ((key === "pe" || key === "pb") && Boolean(analysis.priceIsStale));
          return (
            <FundamentalIndicatorCard
              key={key}
              indicator={indicator}
              criterion={criterion}
              stale={stale}
              notApplicableReason={
                key === "netMargin" ? netMarginNotApplicable : null
              }
            />
          );
        })}
      </div>
      {analysis.fundamentalsIsStale && (
        <p role="status" className="text-xs text-status-warning">
          {`Valores financeiros desatualizados${analysis.fundamentalsFetchedAt && Number.isFinite(Date.parse(analysis.fundamentalsFetchedAt)) ? ` · conferidos em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(analysis.fundamentalsFetchedAt))}` : ""}. Limites suspensos.`}
        </p>
      )}
    </section>
  );
}
