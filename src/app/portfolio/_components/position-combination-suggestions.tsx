"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getApiMessage } from "@/lib/api-message";
import { formatCurrency } from "@/lib/utils";
import {
  formatCurrencyCents,
  portfolioMoneySourceLabels,
} from "@/lib/portfolio-money";
import {
  formatAmountInput,
  getCurrencyInputSelection,
  parseBrazilianAmount,
  resolveCurrencyInputSelection,
  type CurrencyInputSelection,
} from "@/lib/currency-input";

export type PositionCombinationSuggestionHolding = {
  assetKey: string;
  product: string;
  institution: string | null;
  value: number | null;
  valueCents?: string | null;
  valueSource?: string;
  canonicalValueSource?: string;
  estimationBaseDate?: string | null;
  estimatedThrough?: string | null;
  cdbEstimateStatus?: "complete" | "provisional" | "unavailable" | null;
  cdbEstimateLimitation?: string | null;
};

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

type SuggestionCandidate = {
  assetKeys: string[];
  total: number;
  difference: number;
  positions?: PositionCombinationSuggestionHolding[];
  transfers?: {
    assetKey: string;
    product: string;
    value: number;
    fromObjectiveId: string;
    fromObjectiveName: string;
    toObjectiveId: string;
  }[];
  impacts?: {
    objectiveId: string;
    objectiveName: string;
    currentValue: number | null;
    knownValue: number;
    targetAmount: number | null;
    progressPercent: number | null;
    transferredValue: number;
    transferredPositionCount: number;
  }[];
};

type EmergencyReservePositionSuggestions =
  | { status: "invalid_target" }
  | { status: "no_valued_positions" }
  | { status: "too_many_positions"; maximum: number }
  | {
      status: "suggestions";
      kind: "exact" | "nearest";
      candidates: SuggestionCandidate[];
      searchLimited: boolean;
      alternativesLimited: boolean;
    };

type Props = {
  holdings: PositionCombinationSuggestionHolding[];
  onApply: (
    assetKeys: string[],
    candidate?: Extract<
      EmergencyReservePositionSuggestions,
      { status: "suggestions" }
    >["candidates"][number],
  ) => void | false;
  endpoint: string;
  amountLabel: string;
  title: string;
  description: string;
  requestFilter?: {
    label: string;
    key: string;
    options: { value: string; label: string }[];
    defaultValue: string;
  };
  selectionActionLabel?: (index: number) => string;
  applyButtonLabel?: string;
  comparisonDetails?: string;
  requestBody?: Record<string, number | null>;
};

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "result"; result: EmergencyReservePositionSuggestions };

export function PositionCombinationSuggestions({
  holdings,
  onApply,
  endpoint,
  amountLabel,
  title,
  description,
  requestFilter,
  selectionActionLabel,
  applyButtonLabel = "Usar esta combinação",
  comparisonDetails,
  requestBody,
}: Props) {
  const [amount, setAmount] = useState("");
  const amountInputRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<CurrencyInputSelection | null>(null);
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState(requestFilter?.defaultValue ?? "");
  const [draftSelected, setDraftSelected] = useState(false);

  useLayoutEffect(() => {
    const input = amountInputRef.current;
    const selection = selectionRef.current;
    if (!input || !selection) return;

    const resolved = resolveCurrencyInputSelection(input.value, selection);
    input.setSelectionRange(resolved.start, resolved.end, resolved.direction);
    selectionRef.current = null;
  }, [amount]);

  async function findSuggestions() {
    const target = parseBrazilianAmount(amount);
    if (!Number.isFinite(target) || target <= 0) {
      setError("Informe um valor maior que zero para comparar as posições.");
      setSearch({ status: "idle" });
      return;
    }

    setError(null);
    setSearch({ status: "loading" });
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetAmount: target,
          ...requestBody,
          ...(requestFilter ? { [requestFilter.key]: filter } : {}),
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(
          getApiMessage(
            body,
            "Não foi possível buscar combinações agora. Tente novamente.",
          ),
        );
        setSearch({ status: "idle" });
        return;
      }
      setSearch({
        status: "result",
        result: body as EmergencyReservePositionSuggestions,
      });
    } catch {
      setSearch({ status: "idle" });
      toast.error(
        "Não foi possível buscar combinações agora. Tente novamente.",
      );
    }
  }

  return (
    <section className="rounded-xl border bg-muted/20 p-4 sm:p-5">
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="group h-auto w-full justify-between p-0 text-left hover:bg-transparent"
          >
            <span className="space-y-1">
              <span className="block font-semibold">{title}</span>
              <span className="block text-sm font-normal text-muted-foreground">
                Buscar uma combinação pelo valor
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          <p className="text-sm text-muted-foreground">{description}</p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="position-combination-target">{amountLabel}</Label>
              <Input
                id="position-combination-target"
                ref={amountInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                disabled={search.status === "loading"}
                placeholder="R$ 0,00"
                value={amount}
                onChange={(event) => {
                  const value = event.target.value;
                  const nextAmount = formatAmountInput(value);
                  const start = event.target.selectionStart ?? value.length;
                  const end = event.target.selectionEnd ?? start;
                  selectionRef.current = getCurrencyInputSelection(
                    value,
                    nextAmount,
                    start,
                    end,
                    event.target.selectionDirection ?? "none",
                  );
                  setAmount(nextAmount);
                  setError(null);
                  setSearch({ status: "idle" });
                  setDraftSelected(false);
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={
                  error ? "position-combination-error" : undefined
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void findSuggestions();
                  }
                }}
              />
            </div>
            {requestFilter && (
              <div className="min-w-0 space-y-2 sm:w-56">
                <Label htmlFor="position-combination-filter">
                  {requestFilter.label}
                </Label>
                <Select
                  value={filter}
                  onValueChange={(value) => {
                    setFilter(value);
                    setSearch({ status: "idle" });
                  }}
                >
                  <SelectTrigger id="position-combination-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {requestFilter.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              type="button"
              onClick={() => void findSuggestions()}
              disabled={search.status === "loading"}
            >
              {search.status === "loading"
                ? "Comparando…"
                : "Buscar combinações"}
            </Button>
          </div>
          {comparisonDetails && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-0 [&[data-state=open]>svg]:rotate-180"
                >
                  Como funciona a comparação
                  <ChevronDown
                    aria-hidden="true"
                    className="ml-1 size-4 transition-transform group-data-[state=open]:rotate-180"
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="max-w-3xl text-xs text-muted-foreground">
                  {comparisonDetails}
                </p>
              </CollapsibleContent>
            </Collapsible>
          )}

          {error && (
            <p
              id="position-combination-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {search.status === "loading" && (
            <p role="status" className="text-sm text-muted-foreground">
              Comparando combinações de valores…
            </p>
          )}
          {search.status === "result" && (
            <SuggestionResults
              result={search.result}
              target={parseBrazilianAmount(amount)}
              holdings={holdings}
              onApply={(assetKeys, candidate) => {
                if (onApply(assetKeys, candidate) !== false) {
                  setDraftSelected(true);
                }
              }}
              selectionActionLabel={selectionActionLabel}
              applyButtonLabel={applyButtonLabel}
            />
          )}
        </CollapsibleContent>
      </Collapsible>
      {draftSelected && (
        <p
          role="status"
          className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"
        >
          Combinação selecionada como rascunho. Salve a configuração para
          confirmar.
        </p>
      )}
    </section>
  );
}

function SuggestionResults({
  result,
  target,
  holdings,
  onApply,
  selectionActionLabel,
  applyButtonLabel,
}: {
  result: EmergencyReservePositionSuggestions;
  target: number;
  holdings: PositionCombinationSuggestionHolding[];
  onApply: Props["onApply"];
  selectionActionLabel: Props["selectionActionLabel"];
  applyButtonLabel: string;
}) {
  if (result.status === "invalid_target") {
    return (
      <p role="status">Informe um valor válido para fazer a comparação.</p>
    );
  }
  if (result.status === "no_valued_positions") {
    return (
      <p role="status" className="rounded-lg border border-dashed p-4 text-sm">
        Ainda não há grupos com valor atual para comparar. Importe posições
        valorizadas e tente novamente.
      </p>
    );
  }
  if (result.status === "too_many_positions") {
    return (
      <p role="status" className="rounded-lg border p-4 text-sm">
        Esta busca comporta até {result.maximum} grupos valorizados por vez.
        Reduza os grupos da importação para comparar com segurança.
      </p>
    );
  }
  if (result.candidates.length === 0) {
    return (
      <p role="status" className="rounded-lg border border-dashed p-4 text-sm">
        Não foi possível encontrar uma combinação revisável. Você ainda pode
        selecionar os grupos manualmente abaixo.
        {result.searchLimited && (
          <span> A busca foi limitada; outros resultados podem existir.</span>
        )}
      </p>
    );
  }

  const exact = result.kind === "exact";
  const title = exact
    ? result.candidates.length > 1
      ? "Mais de uma combinação corresponde ao valor"
      : "Combinação exata encontrada"
    : result.searchLimited
      ? "Busca parcial: alternativa encontrada"
      : "Nenhuma combinação exata encontrada";

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="space-y-1">
        <h4 className="font-medium">{title}</h4>
        <p className="text-sm text-muted-foreground">
          {exact
            ? "Abra cada opção para revisar os grupos antes de aplicar."
            : result.searchLimited
              ? "Alternativa mais próxima entre as combinações avaliadas."
              : `Não encontramos combinação exata. Compare a diferença para ${formatCurrency(target)}.`}
          {result.alternativesLimited &&
            " Há outras alternativas com resultado equivalente."}
          {result.searchLimited &&
            " A busca atingiu o limite de combinações avaliadas."}
        </p>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {result.candidates.map((candidate, index) => {
          const included = candidate.positions?.length
            ? candidate.positions
            : candidate.assetKeys
                .map((assetKey) =>
                  holdings.find((holding) => holding.assetKey === assetKey),
                )
                .filter(
                  (holding): holding is PositionCombinationSuggestionHolding =>
                    Boolean(holding),
                );

          return (
            <CandidateSummary
              key={candidate.assetKeys.join("|")}
              candidate={candidate}
              index={index}
              exact={exact}
              included={included}
              onApply={onApply}
              selectionActionLabel={selectionActionLabel}
              applyButtonLabel={applyButtonLabel}
            />
          );
        })}
      </ol>
    </div>
  );
}

function CandidateSummary({
  candidate,
  index,
  exact,
  included,
  onApply,
  selectionActionLabel,
  applyButtonLabel,
}: {
  candidate: SuggestionCandidate;
  index: number;
  exact: boolean;
  included: PositionCombinationSuggestionHolding[];
  onApply: Props["onApply"];
  selectionActionLabel: Props["selectionActionLabel"];
  applyButtonLabel: string;
}) {
  return (
    <li className="rounded-xl border bg-background p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h5 className="font-medium">
            {exact ? `Combinação ${index + 1}` : `Alternativa ${index + 1}`}
          </h5>
          <p className="text-xs text-muted-foreground">
            {included.length} {included.length === 1 ? "grupo" : "grupos"}
          </p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
          {exact ? "Exata" : "Mais próxima"}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Total</dt>
          <dd className="font-semibold tabular-nums">
            {formatCurrency(candidate.total)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Diferença</dt>
          <dd className="font-semibold tabular-nums">
            {formatCurrency(candidate.difference)}
          </dd>
        </div>
      </dl>
      <Collapsible className="mt-3 border-t pt-2">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="group w-full justify-between px-1"
          >
            Ver {included.length} posições
            <ChevronDown
              aria-hidden="true"
              className="ml-1 size-4 transition-transform group-data-[state=open]:rotate-180"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <ul className="space-y-2">
            {included.map((holding) => {
              const transfer = candidate.transfers?.find(
                (item) => item.assetKey === holding.assetKey,
              );
              return (
                <li
                  key={holding.assetKey}
                  className="min-w-0 rounded-lg border bg-muted/30 p-3"
                >
                  <span className="block truncate text-sm font-medium">
                    {holding.product}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {holding.institution ?? "Instituição não informada"}
                  </span>
                  {transfer && (
                    <span className="mt-1 block text-xs text-amber-700">
                      Será transferida de {transfer.fromObjectiveName} para
                      Reserva
                    </span>
                  )}
                  <span className="mt-2 block text-sm tabular-nums">
                    {holding.value === null
                      ? "Sem valor informado"
                      : holding.valueCents
                        ? formatCurrencyCents(holding.valueCents)
                        : formatCurrency(holding.value)}
                  </span>
                  {(holding.canonicalValueSource ?? holding.valueSource) && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Origem:{" "}
                      {portfolioMoneySourceLabels[
                        (holding.canonicalValueSource ??
                          holding.valueSource) as keyof typeof portfolioMoneySourceLabels
                      ] ??
                        holding.canonicalValueSource ??
                        holding.valueSource}
                    </span>
                  )}
                  {holding.estimationBaseDate && (
                    <span className="block text-xs text-muted-foreground">
                      Data-base CURVA:{" "}
                      {date.format(
                        new Date(`${holding.estimationBaseDate}T00:00:00Z`),
                      )}
                    </span>
                  )}
                  {holding.estimatedThrough && (
                    <span className="block text-xs text-muted-foreground">
                      Estimativa{" "}
                      {holding.cdbEstimateStatus === "provisional"
                        ? "parcial "
                        : ""}
                      até{" "}
                      {date.format(
                        new Date(`${holding.estimatedThrough}T00:00:00Z`),
                      )}
                    </span>
                  )}
                  {holding.cdbEstimateLimitation && (
                    <span className="block text-xs text-muted-foreground">
                      {holding.cdbEstimateLimitation}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {candidate.impacts && candidate.transfers?.length ? (
            <ul className="space-y-1 rounded-md bg-muted/40 p-3 text-xs">
              {candidate.impacts.map((impact) => (
                <li key={impact.objectiveId}>
                  {impact.objectiveName}:{" "}
                  {impact.currentValue === null
                    ? `total indisponível · ${formatCurrency(impact.knownValue)} conhecidos`
                    : formatCurrency(impact.currentValue)}
                  {impact.targetAmount === null
                    ? ""
                    : ` de ${formatCurrency(impact.targetAmount)}${impact.progressPercent === null ? "" : ` · ${impact.progressPercent.toFixed(1)}%`}`}
                </li>
              ))}
            </ul>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
      <Button
        type="button"
        variant="outline"
        className="mt-3 w-full"
        onClick={() => onApply(candidate.assetKeys, candidate)}
      >
        {candidate.transfers?.length
          ? "Usar e transferir"
          : (selectionActionLabel?.(index) ?? applyButtonLabel)}
      </Button>
    </li>
  );
}
