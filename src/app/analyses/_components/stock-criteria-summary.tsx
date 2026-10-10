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
  evaluateStockCriteria,
  type StockCriteriaPreferences,
  type StockCriteriaStatus,
  type StockCriterionResult,
} from "@/lib/stock-criteria-evaluation";
import {
  defaultStockCriteriaPreferences,
  stockCriteriaPreferencesStorageKey,
  stockCriteriaPreferencesUpdatedEvent,
  useStockCriteriaPreferences,
} from "@/lib/stock-criteria-preferences";
import type { StockAnalysis } from "./stock-analysis-types";

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

const statusPresentation: Record<
  StockCriteriaStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  meets: {
    label: "Atende",
    className: "text-status-success",
    Icon: CheckCircle2,
  },
  fails: {
    label: "Não atende",
    className: "text-status-danger",
    Icon: CircleX,
  },
  unavailable: {
    label: "Sem dado confiável",
    className: "text-muted-foreground",
    Icon: CircleHelp,
  },
  not_applicable: {
    label: "Não aplicável",
    className: "text-muted-foreground",
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

function dateLabel(value: string) {
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

function metricLabel(key: "pe" | "roe", result: StockCriterionResult) {
  if (result.status !== "meets" && result.status !== "fails")
    return statusPresentation[result.status].label;
  const suffix = key === "pe" ? "x" : "%";
  const valueText = `${numberFormatter.format(result.value!)}${suffix}`;
  if (key === "pe")
    return `${valueText} · limite ${numberFormatter.format(result.threshold!)}x`;
  return `${valueText} · mínimo ${numberFormatter.format(result.threshold!)}%`;
}

function CriterionRow({
  label,
  result,
  valueText,
  referenceDate,
  marketDataDate,
  help,
}: {
  label: string;
  result: StockCriterionResult;
  valueText: string;
  referenceDate: string | null;
  marketDataDate?: string | null;
  help: string;
}) {
  const presentation = statusPresentation[result.status];
  const Icon = presentation.Icon;
  return (
    <li className="flex min-w-0 items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Icon
          className={`size-4 shrink-0 ${presentation.className}`}
          aria-hidden="true"
        />
        <span className="font-medium">{label}</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              aria-label={`Ajuda sobre ${label}`}
            >
              <CircleHelp className="size-3.5" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="max-w-xs space-y-2 text-sm" align="start">
            <p>{help}</p>
            <p className="text-muted-foreground">
              {referenceDate
                ? `Demonstrações: ${dateLabel(referenceDate) ?? "data indisponível"}.`
                : "Data-base das demonstrações indisponível."}
            </p>
            <p className="text-muted-foreground">
              {dateTimeLabel(marketDataDate)
                ? `Cotação: ${dateTimeLabel(marketDataDate)}.`
                : "Data da cotação indisponível."}
            </p>
            <p className="text-muted-foreground">
              {result.reason === "industrial_indicator_not_in_contract"
                ? "A fonte atual não fornece este indicador de forma confiável."
                : result.reason === "financial_sector_methodology_required"
                  ? "A metodologia setorial atual não valida este critério."
                  : result.reason === "sector_not_supported"
                    ? "Não foi possível confirmar o setor para aplicar a metodologia."
                    : null}
            </p>
          </PopoverContent>
        </Popover>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums">{valueText}</p>
        <p className={`text-xs ${presentation.className}`}>
          {presentation.label}
        </p>
      </div>
    </li>
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
  const [maximumPeDraft, setMaximumPeDraft] = useState("15");
  const [minimumRoeDraft, setMinimumRoeDraft] = useState("15");
  const [storageMessage, setStorageMessage] = useState<string | null>(null);

  const roeEquity = useMemo(() => findRoeEquity(analysis), [analysis]);
  const criteria = useMemo(() => {
    const indicators = analysis.indicators.map((indicator) => {
      const isStale =
        analysis.fundamentalsIsStale ||
        (indicator.key === "pe" && analysis.priceIsStale === true);
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

  const assessed = Object.values(criteria.qualityCriteria).filter(
    ({ status }) => status === "meets" || status === "fails",
  );
  const metCount = assessed.filter(({ status }) => status === "meets").length;
  const unavailableCount = Object.values(criteria.qualityCriteria).filter(
    ({ status }) => status === "unavailable",
  ).length;

  function savePreferences() {
    const maximumPe = Number(maximumPeDraft.replace(",", "."));
    const minimumRoePercent = Number(minimumRoeDraft.replace(",", "."));
    if (
      !Number.isFinite(maximumPe) ||
      maximumPe <= 0 ||
      !Number.isFinite(minimumRoePercent) ||
      minimumRoePercent <= 0
    ) {
      setStorageMessage("Informe limites maiores que zero.");
      return;
    }
    const next = { maximumPe, minimumRoePercent };
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
    setMaximumPeDraft(String(defaultStockCriteriaPreferences.maximumPe));
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

  const pe = analysis.indicators.find((indicator) => indicator.key === "pe");
  const roe = analysis.indicators.find((indicator) => indicator.key === "roe");
  const pb = analysis.indicators.find((indicator) => indicator.key === "pb");
  const criteriaRows = [
    {
      key: "pe",
      label: "P/L",
      result: criteria.qualityCriteria.pe,
      valueText: metricLabel("pe", criteria.qualityCriteria.pe),
      referenceDate: pe?.referenceDate ?? null,
      marketDataDate: pe?.marketDataDate ?? null,
      help: "Compara o valor de mercado com o lucro positivo. Um P/L negativo não é tratado como oportunidade.",
    },
    {
      key: "roe",
      label: "ROE",
      result: criteria.qualityCriteria.roe,
      valueText: metricLabel("roe", criteria.qualityCriteria.roe),
      referenceDate: roe?.referenceDate ?? null,
      marketDataDate: null,
      help: "Compara o lucro com o patrimônio médio. Dívida, ganhos fora do comum e patrimônio reduzido podem distorcer a leitura.",
    },
    {
      key: "netDebtToEbitda",
      label: "Dív. Líq./EBITDA",
      result: criteria.qualityCriteria.netDebtToEbitda,
      valueText: "Sem dado",
      referenceDate: null,
      help: "A análise ainda não possui dívida líquida e EBITDA reconciliados de forma compatível.",
    },
    {
      key: "roic",
      label: "ROIC",
      result: criteria.qualityCriteria.roic,
      valueText: "Sem dado",
      referenceDate: null,
      help: "A análise ainda não calcula retorno sobre capital investido com dados compatíveis.",
    },
  ];
  const assessedLabel = assessed.length === 1 ? "avaliável" : "avaliáveis";

  return (
    <section
      className="space-y-3 border-t pt-4"
      aria-labelledby="stock-criteria-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="stock-criteria-heading" className="font-medium">
            Critérios de análise
          </h3>
          <p className="text-xs text-muted-foreground">
            Setor CVM: {analysis.issuerSector ?? "não confirmado"}
            {analysis.issuerMetadataUpdatedAt &&
              ` · cadastro atualizado em ${dateLabel(analysis.issuerMetadataUpdatedAt) ?? "data indisponível"}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {metCount} atendido{metCount === 1 ? "" : "s"} · {assessed.length}{" "}
            {assessedLabel}
            {unavailableCount > 0
              ? ` · ${unavailableCount} sem base confiável`
              : ""}
          </p>
        </div>
        <Dialog
          open={preferencesOpen}
          onOpenChange={(open) => {
            setPreferencesOpen(open);
            if (open) {
              setMaximumPeDraft(String(preferences.maximumPe));
              setMinimumRoeDraft(String(preferences.minimumRoePercent));
              setStorageMessage(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Settings2 className="mr-2 size-4" aria-hidden="true" />
              Ajustar critérios
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Critérios de referência</DialogTitle>
              <DialogDescription>
                Edite limites iniciais para P/L e ROE. Eles servem para estudo,
                não como recomendação ou ordem de compra.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="stock-criteria-maximum-pe">P/L máximo</Label>
                <Input
                  id="stock-criteria-maximum-pe"
                  type="number"
                  min="0.01"
                  step="0.1"
                  value={maximumPeDraft}
                  onChange={(event) => setMaximumPeDraft(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock-criteria-minimum-roe">
                  ROE mínimo (%)
                </Label>
                <Input
                  id="stock-criteria-minimum-roe"
                  type="number"
                  min="0.01"
                  step="0.1"
                  value={minimumRoeDraft}
                  onChange={(event) => setMinimumRoeDraft(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Predefinições</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setMaximumPeDraft("10");
                      setMinimumRoeDraft("20");
                    }}
                  >
                    Mais restrito
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setMaximumPeDraft("15");
                      setMinimumRoeDraft("15");
                    }}
                  >
                    Padrão
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setMaximumPeDraft("20");
                      setMinimumRoeDraft("10");
                    }}
                  >
                    Mais amplo
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Padrão inicial: P/L até 15 e ROE a partir de 15%. Preferências
                armazenadas neste navegador.
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
          Dados financeiros antigos; os critérios ficam indisponíveis até nova
          atualização.
        </p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {criteriaRows.map(({ key, ...row }) => (
          <CriterionRow key={key} {...row} />
        ))}
      </ul>
      {analysis.instrumentType === "stock" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Preço e renda</span>
          <span>
            P/VP{" "}
            {analysis.fundamentalsIsStale ||
            analysis.priceIsStale ||
            pb?.value === null ||
            pb?.value === undefined
              ? "—"
              : `${numberFormatter.format(pb.value)}x`}
          </span>
          <span>DY — · sem série recorrente completa</span>
          <span>
            Bazin{" "}
            {statusPresentation[
              criteria.priceReferences.bazin.status
            ].label.toLocaleLowerCase("pt-BR")}
          </span>
          <span>Graham indisponível nesta análise</span>
        </div>
      )}
    </section>
  );
}
