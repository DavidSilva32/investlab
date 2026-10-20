"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, CircleHelp, Save, Search } from "lucide-react";
import { AssetLogo } from "@/components/asset-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type PortfolioOpportunity = {
  ticker: string;
  logoUrl?: string | null;
  name: string;
  quantity: number;
  positionDate: string | null;
  price: number | null;
  priceAsOf: string | null;
  fundamentalsAsOf: string | null;
  automaticDividend: {
    value: number | null;
    windowStart: string;
    windowEnd: string;
    observedPayments: number;
    source: "BRAPI";
    unavailableReason: string | null;
  } | null;
  financialPeriods: Array<{
    referenceDate: string;
    sourceDocument: "DFP" | "ITR";
  }>;
  inputs: Array<{
    inputKey:
      "graham_eps" | "graham_book_value_per_share" | "bazin_dividend_per_share";
    value: number | null;
    source: string | null;
    asOf: string | null;
  }>;
  methods: {
    graham: {
      value: number | null;
      differencePercent: number | null;
      asOf: string | null;
      source: string | null;
      unavailableReason: string | null;
    };
    bazin: {
      value: number | null;
      differencePercent: number | null;
      asOf: string | null;
      source: string | null;
      unavailableReason: string | null;
    };
  };
};

export type OpportunityInputKey =
  PortfolioOpportunity["inputs"][number]["inputKey"];
export type OpportunityDraft = { value: string; source: string; asOf: string };
export type OpportunityDraftField = keyof OpportunityDraft;

const fields: Array<{ key: OpportunityInputKey; label: string; hint: string }> =
  [
    {
      key: "graham_eps",
      label: "Lucro por ação (LPA)",
      hint: "Use o LPA publicado pela empresa.",
    },
    {
      key: "graham_book_value_per_share",
      label: "Valor patrimonial por ação (VPA)",
      hint: "Use o VPA da mesma data-base do LPA.",
    },
    {
      key: "bazin_dividend_per_share",
      label: "Proventos por ação em 12 meses",
      hint: "Some dividendos e JCP em dinheiro por ação.",
    },
  ];
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: string | null) {
  if (!value) return "Data não informada";
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(date.getTime())
    ? dateFormat.format(date)
    : "Data não informada";
}

export function getOpportunityDraftKey(
  ticker: string,
  inputKey: OpportunityInputKey,
) {
  return `${ticker}:${inputKey}`;
}

function Help({ label, children }: { label: string; children: string }) {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CircleHelp className="size-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Reference({
  title,
  value,
  difference,
  unavailable,
  explanation,
  source,
  asOf,
}: {
  title: string;
  value: number | null;
  difference: number | null;
  unavailable: string | null;
  explanation: string;
  source: string | null;
  asOf: string | null;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{title}</h3>
        <Help label={`Sobre ${title}`}>{explanation}</Help>
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        {value === null ? "Indisponível" : money.format(value)}
      </p>
      {difference === null ? (
        <p className="text-sm text-muted-foreground">
          {unavailable ?? "Comparação indisponível"}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {difference === 0
            ? "Na referência calculada"
            : `${Math.abs(difference).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% ${difference > 0 ? "abaixo" : "acima"} da referência`}
        </p>
      )}
      {(source || asOf) && (
        <p className="text-xs text-muted-foreground">
          {source ? `${source} · ` : ""}
          {formatDate(asOf)}
        </p>
      )}
      {unavailable && difference !== null && (
        <p className="text-xs text-muted-foreground">{unavailable}</p>
      )}
    </div>
  );
}

export function PortfolioOpportunityDetails({
  opportunity,
  openInputsInitially = false,
  drafts,
  saving,
  onUpdateDraft,
  onSaveInput,
}: {
  opportunity: PortfolioOpportunity;
  openInputsInitially?: boolean;
  drafts: Readonly<Record<string, OpportunityDraft>>;
  saving: string | null;
  onUpdateDraft: (
    key: OpportunityInputKey,
    field: OpportunityDraftField,
    value: string,
  ) => void;
  onSaveInput: (key: OpportunityInputKey) => void;
}) {
  const [inputsOpen, setInputsOpen] = useState(openInputsInitially);
  const ticker = opportunity.ticker;
  const grahamDifference = opportunity.methods.graham.differencePercent;
  const bazinDifference = opportunity.methods.bazin.differencePercent;
  const referencesDiverge =
    grahamDifference !== null &&
    bazinDifference !== null &&
    Math.sign(grahamDifference) !== Math.sign(bazinDifference);
  const manualFields = openInputsInitially
    ? fields.filter((field) =>
        field.key === "bazin_dividend_per_share"
          ? opportunity.methods.bazin.value === null
          : opportunity.methods.graham.value === null,
      )
    : fields;
  const manualInputFields = (
    <div className="grid gap-3 pt-2 lg:grid-cols-2">
      <p className="text-xs text-muted-foreground lg:col-span-2">
        Informe valor por ação, origem e data: LPA e VPA para Graham; proventos
        em 12 meses para Bazin.
      </p>
      {manualFields.map((field) => {
        const guidanceId = `${ticker}-${field.key}-guidance`;
        const guidance =
          field.key === "graham_eps"
            ? "Transcreva o LPA publicado pela empresa na mesma data-base do VPA."
            : field.key === "graham_book_value_per_share"
              ? "Transcreva o VPA por ação publicado pela empresa na mesma data-base do LPA. Não use o patrimônio total nem divida valores sem conferir a quantidade e a classe das ações."
              : "No histórico de proventos de Relações com Investidores, some dividendos e JCP em dinheiro pagos por ação nos 12 meses anteriores à data informada. Não use o total creditado na sua conta.";
        const draft = drafts[getOpportunityDraftKey(ticker, field.key)] ?? {
          value: "",
          source: "",
          asOf: "",
        };
        const isSaving = saving === getOpportunityDraftKey(ticker, field.key);
        return (
          <form
            key={field.key}
            className="space-y-2 rounded-md bg-muted/30 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveInput(field.key);
            }}
          >
            <label
              htmlFor={`${ticker}-${field.key}-value`}
              className="text-sm font-medium"
            >
              {field.label}
            </label>
            <p className="text-xs text-muted-foreground">{field.hint}</p>
            <p id={guidanceId} className="text-xs text-muted-foreground">
              {guidance}
            </p>
            <Input
              id={`${ticker}-${field.key}-value`}
              aria-label={`${field.label}, valor`}
              aria-describedby={guidanceId}
              type="number"
              min="0"
              step="any"
              required
              value={draft.value}
              onChange={(event) =>
                onUpdateDraft(field.key, "value", event.target.value)
              }
              placeholder="Valor"
            />
            <DatePickerField
              id={`${ticker}-${field.key}-as-of`}
              label={`${field.label}, data de referência`}
              value={draft.asOf}
              describedBy={guidanceId}
              required
              onChange={(value) => onUpdateDraft(field.key, "asOf", value)}
            />
            <div className="flex gap-2">
              <Input
                aria-label={`${field.label}, origem`}
                aria-describedby={guidanceId}
                placeholder="Origem do dado"
                minLength={2}
                maxLength={160}
                required
                value={draft.source}
                onChange={(event) =>
                  onUpdateDraft(field.key, "source", event.target.value)
                }
              />
              <Button type="submit" size="sm" disabled={isSaving}>
                <Save className="mr-2 size-4" aria-hidden="true" />
                {isSaving ? "Salvando" : "Salvar"}
              </Button>
            </div>
            {draft.source && (
              <p className="text-xs text-muted-foreground">
                Origem manual: {draft.source} ·{" "}
                {draft.asOf || "data não informada"}.
              </p>
            )}
          </form>
        );
      })}
    </div>
  );
  return (
    <Card className="border-0 shadow-none">
      <CardContent className="space-y-3 p-0">
        <div className="flex items-center gap-2">
          <AssetLogo
            ticker={ticker}
            name={opportunity.name}
            logoUrl={opportunity.logoUrl}
            size="sm"
          />
          <span className="font-medium">
            {ticker} · {opportunity.name}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {opportunity.quantity.toLocaleString("pt-BR")} ações · cotação{" "}
          {opportunity.price === null
            ? "indisponível"
            : money.format(opportunity.price)}{" "}
          · {opportunity.priceAsOf?.slice(0, 10) ?? "data não informada"} ·
          posição importada em {formatDate(opportunity.positionDate)}
        </p>
        {(!inputsOpen || openInputsInitially) && (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {(!openInputsInitially ||
                opportunity.methods.graham.value !== null) && (
                <Reference
                  title="Número de Graham"
                  value={opportunity.methods.graham.value}
                  difference={opportunity.methods.graham.differencePercent}
                  unavailable={opportunity.methods.graham.unavailableReason}
                  source={opportunity.methods.graham.source}
                  asOf={opportunity.methods.graham.asOf}
                  explanation="Usa LPA e VPA para estimar uma referência de valor. A fórmula é a raiz quadrada de 22,5 × LPA × VPA. Precisa de valores positivos da mesma data-base e não determina uma decisão."
                />
              )}
              {(!openInputsInitially ||
                opportunity.methods.bazin.value !== null) && (
                <Reference
                  title="Preço-teto de Bazin"
                  value={opportunity.methods.bazin.value}
                  difference={opportunity.methods.bazin.differencePercent}
                  unavailable={opportunity.methods.bazin.unavailableReason}
                  source={opportunity.methods.bazin.source}
                  asOf={opportunity.methods.bazin.asOf}
                  explanation="Divide proventos anuais por ação pela taxa-alvo. O resultado depende dos dados informados e não confirma que os proventos sejam recorrentes."
                />
              )}
            </div>
            {referencesDiverge && (
              <p className="text-xs text-muted-foreground">
                As referências ficam em lados diferentes da cotação atual.
              </p>
            )}
          </>
        )}
        {openInputsInitially ? (
          manualInputFields
        ) : (
          <Collapsible open={inputsOpen} onOpenChange={setInputsOpen}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full justify-between px-1 py-2 text-left text-sm"
              >
                Inserir dados para calcular Graham e Bazin
                <ChevronDown
                  className="size-4 transition-transform [[data-state=open]_&]:rotate-180"
                  aria-hidden="true"
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>{manualInputFields}</CollapsibleContent>
          </Collapsible>
        )}
        <Button asChild type="button" variant="outline" size="sm">
          <Link href={`/analises?ticker=${encodeURIComponent(ticker)}`}>
            <Search className="mr-2 size-4" aria-hidden="true" /> Ver critérios
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
