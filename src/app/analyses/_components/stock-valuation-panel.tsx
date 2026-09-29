"use client";

import { useState } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const numericInputs = [
  {
    key: "baseFcff",
    label: "FCFF anual de referência (BRL)",
    unit: "currency",
  },
  {
    key: "downsideGrowth",
    label: "Crescimento anual · conservador",
    unit: "percent",
  },
  { key: "baseGrowth", label: "Crescimento anual · base", unit: "percent" },
  {
    key: "upsideGrowth",
    label: "Crescimento anual · otimista",
    unit: "percent",
  },
  { key: "riskFreeRate", label: "Taxa-base do CAPM", unit: "percent" },
  {
    key: "equityRiskPremium",
    label: "Prêmio de risco do capital próprio (ERP)",
    unit: "percent",
  },
  { key: "beta", label: "Beta usado como premissa", unit: "number" },
  {
    key: "preTaxCostOfDebt",
    label: "Custo da dívida antes de impostos",
    unit: "percent",
  },
  {
    key: "taxRate",
    label: "Alíquota efetiva para benefício fiscal",
    unit: "percent",
  },
  { key: "equityWeight", label: "Peso do capital próprio", unit: "percent" },
  { key: "debtWeight", label: "Peso da dívida", unit: "percent" },
  {
    key: "terminalGrowth",
    label: "Crescimento do estado estável",
    unit: "percent",
  },
  {
    key: "terminalWacc",
    label: "WACC explícito do estado estável",
    unit: "percent",
  },
] as const;

type InputKey = (typeof numericInputs)[number]["key"];
type InputClass = "observed" | "external_estimate" | "derived" | "premise" | "";
type InputMetadata = {
  type: InputClass;
  source: string;
  asOf: string;
  method: string;
  version: string;
};
type Result = {
  status: "calculated" | "unavailable";
  reasons: string[];
  wacc: number | null;
  scenarios: Array<{
    key: string;
    growth: number;
    enterpriseValue: number | null;
  }>;
  sensitivity: Array<{
    forecastWacc: number;
    terminalWacc: number;
    terminalGrowth: number;
    enterpriseValue: number | null;
    reason: string | null;
  }>;
  provenance?: Record<
    string,
    {
      value: number;
      type: string;
      source: string;
      asOf: string;
      currency: string;
      basis: string;
      unit: string;
      horizon: string;
      method: string;
      version: string;
    } | null
  >;
  shareValueUnavailableReason: string;
  valuationMethodVersion: string;
  sectorClassification: "financial" | "non_financial" | "ambiguous" | "unknown";
};

const scenarioLabels: Record<string, string> = {
  downside: "Conservador",
  base: "Base",
  upside: "Otimista",
};
const sectorLabels = {
  financial: "financeiro",
  non_financial: "não financeiro",
  ambiguous: "ambíguo",
  unknown: "não mapeado",
};
const inputTypeLabels: Record<string, string> = {
  observed: "Observado",
  external_estimate: "Estimativa externa",
  derived: "Derivado",
  premise: "Premissa",
};
const inputLabels: Record<string, string> = Object.fromEntries(
  numericInputs.map(({ key, label }) => [key, label]),
);
const chartConfig = {
  enterpriseValue: { label: "Valor da firma", color: "var(--chart-1)" },
};
const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
function formatInputValue(input: { value: number; unit: string }) {
  if (input.unit === "currency") return currency.format(input.value);
  if (input.unit === "percentage")
    return `${(input.value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}%`;
  return input.value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function StockValuationPanel({ ticker }: { ticker: string }) {
  const [values, setValues] = useState<Record<InputKey, string>>(
    () =>
      Object.fromEntries(numericInputs.map(({ key }) => [key, ""])) as Record<
        InputKey,
        string
      >,
  );
  const [metadata, setMetadata] = useState<Record<InputKey, InputMetadata>>(
    () =>
      Object.fromEntries(
        numericInputs.map(({ key }) => [
          key,
          { type: "", source: "", asOf: "", method: "", version: "" },
        ]),
      ) as Record<InputKey, InputMetadata>,
  );
  const [forecastYears, setForecastYears] = useState("");
  const [riskFreeRateMaturityYears, setRiskFreeRateMaturityYears] =
    useState("");
  const [continuityConfirmed, setContinuityConfirmed] = useState(false);
  const [countryRiskOverlapReviewed, setCountryRiskOverlapReviewed] =
    useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  function updateMetadata(
    key: InputKey,
    field: keyof InputMetadata,
    value: string,
  ) {
    setMetadata((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));
  }

  async function calculate() {
    setLoading(true);
    setRequestError(null);
    try {
      const horizons: Record<InputKey, string> = {
        baseFcff: "base",
        downsideGrowth: `forecast:${forecastYears}`,
        baseGrowth: `forecast:${forecastYears}`,
        upsideGrowth: `forecast:${forecastYears}`,
        riskFreeRate: riskFreeRateMaturityYears
          ? `forecast:${riskFreeRateMaturityYears}`
          : "forecast:unspecified",
        equityRiskPremium: `forecast:${forecastYears}`,
        beta: `forecast:${forecastYears}`,
        preTaxCostOfDebt: `forecast:${forecastYears}`,
        taxRate: `forecast:${forecastYears}`,
        equityWeight: `forecast:${forecastYears}`,
        debtWeight: `forecast:${forecastYears}`,
        terminalGrowth: "terminal",
        terminalWacc: "terminal",
      };
      const inputs = Object.fromEntries(
        numericInputs.map(({ key, unit }) => {
          const raw = values[key].trim();
          const componentMetadata = metadata[key];
          const parsed = raw === "" ? null : Number(raw.replace(",", "."));
          const value =
            parsed === null || !Number.isFinite(parsed)
              ? null
              : unit === "percent"
                ? parsed / 100
                : parsed;
          return [
            key,
            value === null
              ? null
              : {
                  value,
                  type: componentMetadata.type || null,
                  source: componentMetadata.source.trim(),
                  asOf: componentMetadata.asOf,
                  currency: "BRL",
                  basis: "nominal",
                  unit:
                    unit === "percent"
                      ? "percentage"
                      : unit === "number"
                        ? "ratio"
                        : "currency",
                  horizon: horizons[key],
                  method: componentMetadata.method.trim(),
                  version: componentMetadata.version.trim(),
                },
          ];
        }),
      );
      const response = await fetch(
        `/api/analyses/stocks/${encodeURIComponent(ticker)}/valuation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            forecastYears: forecastYears ? Number(forecastYears) : null,
            continuityConfirmed,
            countryRiskOverlapReviewed,
            inputs,
          }),
        },
      );
      if (!response.ok) throw new Error();
      setResult((await response.json()) as Result);
    } catch {
      setRequestError("Não foi possível calcular agora. Tente novamente.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const scenarioData = (result?.scenarios ?? []).map((scenario) => ({
    name: scenarioLabels[scenario.key] ?? scenario.key,
    enterpriseValue: scenario.enterpriseValue,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avaliação por fluxo de caixa</CardTitle>
        <CardDescription>
          Cenários FCFF/DCF para continuidade operacional. As entradas são
          premissas manuais em BRL nominal; nenhuma é preenchida
          automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="valuation-horizon">Horizonte dos fluxos</Label>
            <Select value={forecastYears} onValueChange={setForecastYears}>
              <SelectTrigger
                id="valuation-horizon"
                aria-label="Horizonte dos fluxos"
              >
                <SelectValue placeholder="Selecione o horizonte" />
              </SelectTrigger>
              <SelectContent>
                {[3, 5, 7, 10].map((years) => (
                  <SelectItem key={years} value={String(years)}>
                    {years} anos
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="valuation-risk-free-maturity">
              Prazo da taxa-base
            </Label>
            <Select
              value={riskFreeRateMaturityYears}
              onValueChange={setRiskFreeRateMaturityYears}
            >
              <SelectTrigger
                id="valuation-risk-free-maturity"
                aria-label="Prazo da taxa-base"
              >
                <SelectValue placeholder="Selecione o prazo da taxa-base" />
              </SelectTrigger>
              <SelectContent>
                {[3, 5, 7, 10].map((years) => (
                  <SelectItem key={years} value={String(years)}>
                    {years} anos
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Selecione o prazo do vértice usado na taxa-base. Ele precisa
              coincidir com o horizonte dos fluxos.
            </p>
          </div>
          {numericInputs.map(({ key, label, unit }) => (
            <div className="space-y-2" key={key}>
              <Label htmlFor={`valuation-${key}`}>{label}</Label>
              <Input
                id={`valuation-${key}`}
                type="number"
                step={unit === "currency" || unit === "number" ? "any" : "0.01"}
                inputMode="decimal"
                placeholder={unit === "percent" ? "%" : "Informe o valor"}
                value={values[key]}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
              <Collapsible>
                <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Proveniência: {label}
                  <ChevronDown
                    className="size-3 transition-transform group-data-[state=open]:rotate-180"
                    aria-hidden="true"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`valuation-${key}-type`}>
                      Tipo da entrada
                    </Label>
                    <Select
                      value={metadata[key].type}
                      onValueChange={(value) =>
                        updateMetadata(key, "type", value as InputClass)
                      }
                    >
                      <SelectTrigger id={`valuation-${key}-type`}>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="observed">Observado</SelectItem>
                        <SelectItem value="external_estimate">
                          Estimativa externa
                        </SelectItem>
                        <SelectItem value="derived">Derivado</SelectItem>
                        <SelectItem value="premise">Premissa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`valuation-${key}-source`}>Origem</Label>
                    <Input
                      id={`valuation-${key}-source`}
                      value={metadata[key].source}
                      onChange={(event) =>
                        updateMetadata(key, "source", event.target.value)
                      }
                      placeholder="Fonte ou responsável pela premissa"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`valuation-${key}-date`}>Data-base</Label>
                    <Input
                      id={`valuation-${key}-date`}
                      placeholder="AAAA-MM-DD"
                      value={metadata[key].asOf}
                      onChange={(event) =>
                        updateMetadata(key, "asOf", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`valuation-${key}-method`}>Método</Label>
                    <Input
                      id={`valuation-${key}-method`}
                      value={metadata[key].method}
                      onChange={(event) =>
                        updateMetadata(key, "method", event.target.value)
                      }
                      placeholder="Como o valor foi obtido"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`valuation-${key}-version`}>
                      Versão da fonte ou premissa
                    </Label>
                    <Input
                      id={`valuation-${key}-version`}
                      value={metadata[key].version}
                      onChange={(event) =>
                        updateMetadata(key, "version", event.target.value)
                      }
                      placeholder="Identificador da revisão"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Unidade:{" "}
                    {unit === "currency"
                      ? "BRL"
                      : unit === "percent"
                        ? "% (convertido para decimal)"
                        : "razão"}{" "}
                    · Horizonte:{" "}
                    {key === "baseFcff"
                      ? "FCFF de referência"
                      : key.startsWith("terminal")
                        ? "estado estável"
                        : key === "riskFreeRate"
                          ? riskFreeRateMaturityYears
                            ? `${riskFreeRateMaturityYears} anos selecionados para a taxa-base`
                            : "selecione o prazo da taxa-base"
                          : forecastYears
                            ? `${forecastYears} anos explícitos`
                            : "selecione o horizonte"}
                    . Classificação autodeclarada; valores digitados como
                    observados não são validados automaticamente.
                  </p>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ))}
        </div>

        <div className="flex items-start gap-3 text-sm">
          <Checkbox
            id="valuation-continuity-confirmed"
            checked={continuityConfirmed}
            onCheckedChange={(checked) =>
              setContinuityConfirmed(checked === true)
            }
          />
          <Label htmlFor="valuation-continuity-confirmed">
            Confirmo que a empresa é operacional e esta análise considera
            continuidade.
          </Label>
        </div>

        <Collapsible>
          <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Fonte, data e limitações
            <ChevronDown
              className="size-4 transition-transform group-data-[state=open]:rotate-180"
              aria-hidden="true"
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Revise a taxa-base e o ERP em conjunto e confirme que essa
              combinação não conta o risco-país duas vezes.
            </p>
            <div className="flex items-start gap-3 text-sm">
              <Checkbox
                id="valuation-country-risk-reviewed"
                checked={countryRiskOverlapReviewed}
                onCheckedChange={(checked) =>
                  setCountryRiskOverlapReviewed(checked === true)
                }
              />
              <Label htmlFor="valuation-country-risk-reviewed">
                Revisei explicitamente a combinação entre taxa-base e ERP.
              </Label>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Button
          type="button"
          onClick={() => void calculate()}
          disabled={loading}
        >
          {loading && (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          )}
          Calcular cenários
        </Button>

        {requestError && (
          <p role="alert" className="text-sm text-destructive">
            {requestError}
          </p>
        )}
        {result && (
          <section
            aria-live="polite"
            className="space-y-4 rounded-lg border p-4"
          >
            <div>
              <h3 className="font-semibold">
                {result.status === "calculated"
                  ? "Cenários de valor da firma"
                  : "Avaliação indisponível"}
              </h3>
              <p className="text-sm text-muted-foreground">
                Método {result.valuationMethodVersion} · BRL nominal · valor da
                firma antes da reconciliação de dívida líquida.
              </p>
              <p className="text-sm text-muted-foreground">
                Classificação setorial do cadastro CVM:{" "}
                {sectorLabels[result.sectorClassification]}. A data-base dessa
                classificação não é fornecida pela fonte.
              </p>
            </div>
            {result.reasons.length > 0 && (
              <ul
                className="list-disc space-y-1 pl-5 text-sm"
                aria-label="Motivos da indisponibilidade"
              >
                {result.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            {result.status === "calculated" && (
              <>
                <p className="text-sm">
                  WACC do período explícito:{" "}
                  <strong>{(result.wacc! * 100).toFixed(2)}%</strong>
                </p>
                <p className="text-sm text-muted-foreground">
                  Cálculo: WACC = peso do capital próprio × (taxa-base + beta ×
                  ERP) + peso da dívida × custo da dívida × (1 − alíquota).
                  Pesos informados devem representar a estrutura de capital em
                  valor de mercado.
                </p>
                <ChartContainer config={chartConfig} className="h-56 w-full">
                  <BarChart data={scenarioData} accessibilityLayer>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                    <YAxis
                      tickFormatter={(value: number) => currency.format(value)}
                      width={100}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="enterpriseValue"
                      fill="var(--color-enterpriseValue)"
                      radius={4}
                    />
                  </BarChart>
                </ChartContainer>
                <div className="grid gap-2 sm:grid-cols-3">
                  {result.scenarios.map((scenario) => (
                    <div
                      className="rounded-md bg-muted/50 p-3"
                      key={scenario.key}
                    >
                      <p className="text-sm text-muted-foreground">
                        {scenarioLabels[scenario.key]}
                      </p>
                      <p className="font-semibold">
                        {scenario.enterpriseValue === null
                          ? "Indisponível"
                          : currency.format(scenario.enterpriseValue)}
                      </p>
                    </div>
                  ))}
                </div>
                <Collapsible>
                  <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Dados e premissas usados
                    <ChevronDown
                      className="size-4 transition-transform group-data-[state=open]:rotate-180"
                      aria-hidden="true"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-3">
                    {Object.entries(result.provenance ?? {}).map(
                      ([key, item]) =>
                        item && (
                          <div
                            className="rounded-md bg-muted/50 p-3 text-sm"
                            key={key}
                          >
                            <p className="font-medium">
                              {inputLabels[key] ?? key}:{" "}
                              {formatInputValue(item)}
                            </p>
                            <p className="text-muted-foreground">
                              {inputTypeLabels[item.type] ?? item.type} ·{" "}
                              {item.source} · data-base {item.asOf} ·{" "}
                              {item.currency} {item.basis} · unidade {item.unit}{" "}
                              · horizonte {item.horizon} · {item.method} ·
                              versão {item.version}
                            </p>
                          </div>
                        ),
                    )}
                    <p className="text-sm text-muted-foreground">
                      Os fatos contábeis candidatos da CVM ainda não foram
                      validados como insumos de FCFF; nenhuma observação
                      automática, curva ANBIMA/B3 ou beta de companhia foi
                      usada.
                    </p>
                  </CollapsibleContent>
                </Collapsible>
                <Collapsible>
                  <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Sensibilidade do cenário-base
                    <ChevronDown
                      className="size-4 transition-transform group-data-[state=open]:rotate-180"
                      aria-hidden="true"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <p className="mb-2 text-sm text-muted-foreground">
                      Recalcula o valor ao variar o WACC projetado em ±1 ponto
                      percentual, o WACC terminal em ±1 ponto e o crescimento
                      terminal em ±0,5 ponto.
                    </p>
                    <div className="max-h-64 overflow-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr>
                            <th className="p-2">WACC período</th>
                            <th className="p-2">WACC terminal</th>
                            <th className="p-2">Crescimento terminal</th>
                            <th className="p-2">Valor da firma</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.sensitivity.map((point) => (
                            <tr
                              className="border-t"
                              key={`${point.forecastWacc}-${point.terminalWacc}-${point.terminalGrowth}`}
                            >
                              <td className="p-2">
                                {(point.forecastWacc * 100).toFixed(2)}%
                              </td>
                              <td className="p-2">
                                {(point.terminalWacc * 100).toFixed(2)}%
                              </td>
                              <td className="p-2">
                                {(point.terminalGrowth * 100).toFixed(2)}%
                              </td>
                              <td className="p-2">
                                {point.enterpriseValue === null
                                  ? point.reason
                                  : currency.format(point.enterpriseValue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              {result.shareValueUnavailableReason} Não é recomendação de compra
              ou venda. Observados: nenhum fato contábil foi promovido a FCFF.
              Estimativas externas: nenhuma fonte automatizada foi usada.
              Derivados: WACC, fluxos projetados e valores da firma calculados a
              partir das entradas. Premissas: valores informados neste
              formulário.
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
