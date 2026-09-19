"use client";
import { useEffect, useMemo, useState } from "react";
import { CircleHelp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
type Period = {
  referenceDate: string;
  sourceDocument: "DFP" | "ITR";
  revenue: string | null;
  netIncome: string | null;
  equity: string | null;
};
type Indicator = {
  key: "pe" | "pb" | "roe" | "netMargin";
  value: number | null;
  unavailableReason: string | null;
  referenceDate: string | null;
  sourceDocument: "DFP" | "ITR" | null;
};
type Analysis = {
  ticker: string;
  companyName: string | null;
  price: number | null;
  changePercent: number | null;
  history: { date: string; close: number }[];
  fundamentals: Period[];
  indicators: Indicator[];
};
const money = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }),
  fmt = new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }),
  label = (s: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${s}T00:00:00Z`));
const help: Record<Indicator["key"], string> = {
  pe: "P/L: valor de mercado / lucro líquido. Requer ações emitidas ou valor de mercado, não apenas cotação.",
  pb: "P/VP: valor de mercado / patrimônio líquido. Deve ser interpretado com rentabilidade e qualidade dos ativos.",
  roe: "ROE: lucro líquido anual / patrimônio líquido médio. Dívida e eventos não recorrentes influenciam a leitura.",
  netMargin:
    "Margem líquida: lucro líquido / receita do mesmo período. Itens não recorrentes podem distorcer um período.",
};
function Price({ points }: { points: Analysis["history"] }) {
  if (points.length < 2)
    return (
      <p className="text-sm text-muted-foreground">
        Não há histórico suficiente para o gráfico.
      </p>
    );
  const v = points.map((p) => p.close),
    min = Math.min(...v),
    max = Math.max(...v),
    r = max - min || 1,
    poly = points
      .map(
        (p, i) =>
          `${(i / (points.length - 1)) * 100},${100 - ((p.close - min) / r) * 100}`,
      )
      .join(" ");
  return (
    <div>
      <svg
        aria-label="Gráfico do histórico de preço"
        role="img"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-52 w-full"
      >
        <polyline
          points={poly}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          className="text-primary"
        />
      </svg>
      <p className="flex justify-between text-xs text-muted-foreground">
        <span>{label(points[0].date)}</span>
        <span>
          {money.format(min)} — {money.format(max)}
        </span>
        <span>{label(points.at(-1)?.date ?? points[0].date)}</span>
      </p>
    </div>
  );
}
export function StockAnalysisDashboard() {
  const [a, setA] = useState<Analysis | null>(null),
    [e, setE] = useState(false),
    [days, setDays] = useState(365);
  const load = async () => {
    setE(false);
    try {
      const r = await fetch("/api/analyses/stocks/PETR4"),
        b = await r.json();
      if (!r.ok) throw Error();
      setA(b as Analysis);
    } catch {
      setE(true);
    }
  };
  useEffect(() => {
    void fetch("/api/analyses/stocks/PETR4")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error();
        return body as Analysis;
      })
      .then(setA)
      .catch(() => setE(true));
  }, []);
  const points = useMemo(() => {
    if (!a) return [];
    const end = new Date(a.history.at(-1)?.date ?? ""),
      from = new Date(end);
    from.setDate(from.getDate() - days);
    return a.history.filter((p) => new Date(p.date) >= from);
  }, [a, days]);
  if (e)
    return (
      <Card>
        <CardContent className="flex items-center gap-4 p-6">
          <p role="alert">Não foi possível consultar a ação agora.</p>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  if (!a)
    return (
      <Card aria-busy="true">
        <CardContent className="p-6">Carregando análise...</CardContent>
      </Card>
    );
  const annual = a.fundamentals.filter((p) => p.sourceDocument === "DFP"),
    interim = a.fundamentals.filter((p) => p.sourceDocument === "ITR");
  return (
    <TooltipProvider>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardDescription>Ativo consultado</CardDescription>
            <CardTitle className="text-2xl">
              {a.ticker} · {a.companyName ?? "Empresa não informada"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-8">
            <p className="text-3xl font-semibold">
              {a.price === null ? "—" : money.format(a.price)}
            </p>
            <p
              className={
                a.changePercent !== null && a.changePercent < 0
                  ? "text-destructive"
                  : "text-emerald-600"
              }
            >
              {a.changePercent === null
                ? "Variação não informada"
                : `Variação: ${a.changePercent.toFixed(2)}%`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Histórico de preço</CardTitle>
            <CardDescription>
              Cotações diárias; os filtros aparecem somente para intervalos
              cobertos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex gap-2">
              {[30, 90, 180, 365]
                .filter(
                  (d) =>
                    a.history.length &&
                    new Date(a.history.at(-1)?.date ?? "").getTime() -
                      new Date(a.history[0].date).getTime() >=
                      (d - 1) * 86400000,
                )
                .map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={d === days ? "default" : "outline"}
                    onClick={() => setDays(d)}
                  >
                    {d === 365 ? "1A" : `${d / 30}M`}
                  </Button>
                ))}
            </div>
            <Price points={points} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Indicadores fundamentalistas</CardTitle>
            <CardDescription>
              Mostrados somente quando há base financeiramente compatível.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {a.indicators.map((i) => (
              <div key={i.key} className="rounded-lg border p-4">
                <p className="flex items-center gap-1 font-medium">
                  {
                    {
                      pe: "P/L",
                      pb: "P/VP",
                      roe: "ROE",
                      netMargin: "Margem líquida",
                    }[i.key]
                  }
                  <Tooltip>
                    <TooltipTrigger aria-label={`Ajuda sobre ${i.key}`}>
                      <CircleHelp className="size-4" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      {help[i.key]}
                    </TooltipContent>
                  </Tooltip>
                </p>
                <p className="mt-3 text-xl font-semibold">
                  {i.value === null ? "Indisponível" : `${i.value.toFixed(1)}%`}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {i.value === null
                    ? i.unavailableReason
                    : `${i.sourceDocument === "ITR" ? "Acumulado até" : "DFP anual encerrado em"} ${label(i.referenceDate ?? "")}`}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Evolução dos fundamentos anuais</CardTitle>
            <CardDescription>
              DFPs anuais comparados entre si: receita, lucro líquido e
              patrimônio líquido.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {annual.length ? (
              annual.map((p) => (
                <div
                  key={p.referenceDate}
                  className="rounded-lg border p-4 text-sm"
                >
                  <p className="font-medium">{label(p.referenceDate)}</p>
                  <p>
                    Receita:{" "}
                    {p.revenue === null ? "—" : fmt.format(Number(p.revenue))}
                  </p>
                  <p>
                    Lucro líquido:{" "}
                    {p.netIncome === null
                      ? "—"
                      : fmt.format(Number(p.netIncome))}
                  </p>
                  <p>
                    Patrimônio:{" "}
                    {p.equity === null ? "—" : fmt.format(Number(p.equity))}
                  </p>
                </div>
              ))
            ) : (
              <p>Sem DFP anual disponível.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Demonstrativos intermediários</CardTitle>
            <CardDescription>
              ITRs acumulados no exercício até cada data; não são trimestres
              isolados nem são comparados a DFPs anuais.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {interim.length ? (
              interim.map((p) => (
                <div
                  key={p.referenceDate}
                  className="rounded-lg border p-4 text-sm"
                >
                  <p className="font-medium">
                    Acumulado até {label(p.referenceDate)}
                  </p>
                  <p>
                    Receita:{" "}
                    {p.revenue === null ? "—" : fmt.format(Number(p.revenue))}
                  </p>
                  <p>
                    Lucro líquido:{" "}
                    {p.netIncome === null
                      ? "—"
                      : fmt.format(Number(p.netIncome))}
                  </p>
                  <p>
                    Patrimônio:{" "}
                    {p.equity === null ? "—" : fmt.format(Number(p.equity))}
                  </p>
                </div>
              ))
            ) : (
              <p>Sem ITR disponível.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
