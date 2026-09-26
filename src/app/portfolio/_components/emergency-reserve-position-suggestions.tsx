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
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";

type ReserveSuggestionHolding = {
  assetKey: string;
  product: string;
  institution: string | null;
  value: number | null;
};

type EmergencyReservePositionSuggestions =
  | { status: "invalid_target" }
  | { status: "no_valued_positions" }
  | { status: "too_many_positions"; maximum: number }
  | {
      status: "suggestions";
      kind: "exact" | "nearest";
      candidates: { assetKeys: string[]; total: number; difference: number }[];
      searchLimited: boolean;
      alternativesLimited: boolean;
    };

type Props = {
  holdings: ReserveSuggestionHolding[];
  onApply: (assetKeys: string[]) => void;
};

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "result"; result: EmergencyReservePositionSuggestions };

function parseBrazilianAmount(value: string) {
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/^R\$/i, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return normalized ? Number(normalized) : Number.NaN;
}

function formatAmountInput(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  const cents = digits.padStart(3, "0");
  const integer = cents.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${integer},${cents.slice(-2)}`;
}

function countDigitsBefore(value: string, position: number) {
  return (value.slice(0, position).match(/\d/g) ?? []).length;
}

function caretPositionForDigitCount(value: string, digitsBefore: number) {
  if (digitsBefore === 0) {
    const firstDigit = value.search(/\d/);
    return firstDigit < 0 ? value.length : firstDigit;
  }

  let digitCount = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index]) && ++digitCount === digitsBefore) {
      return index + 1;
    }
  }
  return value.length;
}

export function EmergencyReservePositionSuggestionsCard({
  holdings,
  onApply,
}: Props) {
  const [amount, setAmount] = useState("");
  const amountInputRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<{
    start: number;
    end: number;
    direction: "forward" | "backward" | "none";
    endOfInput: boolean;
  } | null>(null);
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const input = amountInputRef.current;
    const selection = selectionRef.current;
    if (!input || !selection) return;

    const start = selection.endOfInput
      ? input.value.length
      : caretPositionForDigitCount(input.value, selection.start);
    const end = selection.endOfInput
      ? input.value.length
      : caretPositionForDigitCount(input.value, selection.end);
    input.setSelectionRange(start, end, selection.direction);
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
      const response = await fetch("/api/emergency-reserve/suggestions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetAmount: target }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setSearch({
        status: "result",
        result: body as EmergencyReservePositionSuggestions,
      });
    } catch (cause) {
      setSearch({ status: "idle" });
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Não foi possível buscar combinações agora. Tente novamente.",
      );
    }
  }

  return (
    <section
      aria-labelledby="reserve-suggestion-title"
      className="space-y-4 rounded-xl border bg-muted/20 p-4 sm:p-5"
    >
      <div className="space-y-1">
        <h3 id="reserve-suggestion-title" className="font-semibold">
          Encontrar grupos pelo valor
        </h3>
        <p className="text-sm text-muted-foreground">
          Digite os números do saldo conhecido; os centavos são preenchidos
          automaticamente.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="reserve-known-total">
            Valor conhecido da reserva
          </Label>
          <Input
            id="reserve-known-total"
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
              selectionRef.current =
                nextAmount === amount
                  ? null
                  : {
                      start: countDigitsBefore(value, start),
                      end: countDigitsBefore(value, end),
                      direction: event.target.selectionDirection ?? "none",
                      endOfInput:
                        start === value.length && end === value.length,
                    };
              setAmount(nextAmount);
              setError(null);
              setSearch({ status: "idle" });
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "reserve-suggestion-error" : undefined}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void findSuggestions();
              }
            }}
          />
        </div>
        <Button
          type="button"
          onClick={() => void findSuggestions()}
          disabled={search.status === "loading"}
        >
          {search.status === "loading" ? "Comparando…" : "Buscar combinações"}
        </Button>
      </div>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="px-0">
            Como funciona a comparação
            <ChevronDown aria-hidden="true" className="ml-1 size-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="max-w-3xl text-xs text-muted-foreground">
            Compara o total com valores atuais: estimativa de CDB DI/CDI quando
            disponível ou valor importado. Não identifica finalidade,
            titularidade, liquidez ou condições de resgate.
          </p>
        </CollapsibleContent>
      </Collapsible>

      {error && (
        <p
          id="reserve-suggestion-error"
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
          onApply={onApply}
        />
      )}
    </section>
  );
}

function SuggestionResults({
  result,
  target,
  holdings,
  onApply,
}: {
  result: EmergencyReservePositionSuggestions;
  target: number;
  holdings: ReserveSuggestionHolding[];
  onApply: Props["onApply"];
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
          const included = candidate.assetKeys
            .map((assetKey) =>
              holdings.find((holding) => holding.assetKey === assetKey),
            )
            .filter((holding): holding is ReserveSuggestionHolding =>
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
}: {
  candidate: { assetKeys: string[]; total: number; difference: number };
  index: number;
  exact: boolean;
  included: ReserveSuggestionHolding[];
  onApply: Props["onApply"];
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
            className="w-full justify-between px-1"
          >
            Revisar {included.length}{" "}
            {included.length === 1 ? "grupo" : "grupos"}
            <ChevronDown aria-hidden="true" className="ml-1 size-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <ul className="space-y-2">
            {included.map((holding) => (
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
                <span className="mt-2 block text-sm tabular-nums">
                  {holding.value === null
                    ? "Sem valor informado"
                    : formatCurrency(holding.value)}
                </span>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => onApply(candidate.assetKeys)}
          >
            Usar esta combinação
          </Button>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
