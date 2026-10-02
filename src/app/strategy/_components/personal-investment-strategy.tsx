"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Compass, Globe2, LoaderCircle, Timer } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiMessage } from "@/lib/api-message";
import { formatCurrencyCents } from "@/lib/portfolio-money";

type Answers = {
  horizonYears: number | "";
  internationalInterest: "interested" | "not_interested" | "unsure" | "";
};
type PersistedAnswers = {
  horizonYears: number;
  internationalInterest: Exclude<Answers["internationalInterest"], "">;
};
type Direction = "review_horizon" | "consider_international";
type StrategyData = {
  valuationDate: string;
  valuationDates: string[];
  totalWealth: {
    knownValueCents: string;
    unvaluedPositionCount: number;
    positionCount: number;
  };
  longTermWealth: {
    knownValueCents: string;
    unvaluedPositionCount: number;
    positionCount: number;
    assignedPositionCount: number;
    unclassifiedKnownValueCents: string;
    classes: Array<{ id: string; label: string; knownValueCents: string }>;
  };
  longTermMaturityDates: Array<{ date: string; count: number }>;
  longTermPositionsWithoutMaturityDate: number;
  savedStrategy: {
    answers: PersistedAnswers;
    selectedDirection: Direction;
    updatedAt: string;
  } | null;
  destinationsNeedingPurposeConfirmation: number;
};

const groupLimitations: Record<string, string> = {
  fixed_income:
    "O sistema agrupa a classe informada; não avalia risco, liquidez nem produtos individuais.",
  brazilian_equities:
    "Só entram posições classificadas como renda variável e Brasil.",
  international_etfs:
    "Só entram posições identificadas como ETF e classificadas fora do Brasil ou como globais.",
  fiis: "O grupo usa a identificação de FII disponível na carteira; não analisa fundos individuais.",
};

function addYears(date: string, years: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function PersonalInvestmentStrategy() {
  const [data, setData] = useState<StrategyData | null>(null);
  const [answers, setAnswers] = useState<Answers>({
    horizonYears: "",
    internationalInterest: "",
  });
  const [selectedDirection, setSelectedDirection] = useState<Direction | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/portfolio/strategy");
        const body: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            getApiMessage(body, "Não foi possível carregar sua estratégia."),
          );
        }
        if (!active) return;
        const loaded = body as StrategyData;
        setData(loaded);
        if (loaded.savedStrategy) {
          setAnswers(loaded.savedStrategy.answers);
          setSelectedDirection(loaded.savedStrategy.selectedDirection);
        }
      } catch (failure) {
        if (active) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Não foi possível carregar sua estratégia.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const horizon = useMemo(() => {
    if (
      !data ||
      answers.horizonYears === "" ||
      !Number.isInteger(answers.horizonYears) ||
      answers.horizonYears < 1
    )
      return null;
    const cutoffDate = addYears(data.valuationDate, answers.horizonYears);
    return {
      cutoffDate,
      knownMaturityCount: data.longTermMaturityDates.reduce(
        (sum, maturity) =>
          sum + (maturity.date <= cutoffDate ? maturity.count : 0),
        0,
      ),
    };
  }, [answers.horizonYears, data]);

  async function save(strategyData: StrategyData, direction: Direction) {
    setSaving(true);
    try {
      const response = await fetch("/api/portfolio/strategy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers, selectedDirection: direction }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(
          getApiMessage(body, "Não foi possível salvar sua estratégia."),
        );
        return;
      }
      const saved = (body as { strategy: StrategyData["savedStrategy"] })
        .strategy;
      setData({ ...strategyData, savedStrategy: saved });
      toast.success(
        getApiMessage(body, "Sua direção de estratégia foi salva."),
      );
    } catch {
      toast.error("Não foi possível salvar sua estratégia.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Lendo sua carteira…
      </div>
    );
  }
  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Não foi possível abrir a estratégia</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const showInternational =
    answers.internationalInterest === "interested" ||
    answers.internationalInterest === "unsure";
  const internationalValue =
    data.longTermWealth.classes.find(
      (group) => group.id === "international_etfs",
    )?.knownValueCents ?? "0";
  const totalUnknown = data.totalWealth.unvaluedPositionCount;
  const longTermUnknown = data.longTermWealth.unvaluedPositionCount;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section aria-labelledby="strategy-reading-title" className="space-y-3">
        <div>
          <h2 id="strategy-reading-title" className="text-xl font-semibold">
            O que sua carteira mostra hoje
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Valores canônicos da carteira avaliados em{" "}
            {formatDate(data.valuationDate)}.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Patrimônio total</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {formatCurrencyCents(data.totalWealth.knownValueCents)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Inclui posições da Reserva, de objetivos e sem destino.
                {totalUnknown > 0 &&
                  ` ${totalUnknown} posição(ões) sem valor conhecido.`}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Destinado à estratégia de longo prazo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {formatCurrencyCents(data.longTermWealth.knownValueCents)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Soma apenas posições atribuídas a destinos classificados como
                investimento de longo prazo.
                {longTermUnknown > 0 &&
                  ` ${longTermUnknown} posição(ões) sem valor conhecido.`}
              </p>
            </CardContent>
          </Card>
        </div>
        {data.destinationsNeedingPurposeConfirmation > 0 && (
          <Alert>
            <AlertTitle>
              {data.destinationsNeedingPurposeConfirmation} destino(s) ainda sem
              finalidade definida
            </AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                Eles continuam funcionando e permanecem fora da Estratégia até
                você confirmar se são objetivos pessoais ou investimentos de
                longo prazo.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/portfolio?panel=objectives">Revisar destinos</Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {data.longTermWealth.positionCount === 0 && (
          <Alert>
            <AlertTitle>Nenhuma posição destinada ao longo prazo</AlertTitle>
            <AlertDescription>
              Classifique um destino e atribua a ele as posições
              correspondentes. Isso preserva a Reserva e os objetivos pessoais
              existentes.
            </AlertDescription>
          </Alert>
        )}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Composição conhecida do longo prazo
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Retrato atual por classe; não são metas nem uma alocação
              recomendada.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {data.longTermWealth.classes.map((group) => (
              <div key={group.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{group.label}</span>
                  <span className="text-sm tabular-nums">
                    {formatCurrencyCents(group.knownValueCents)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {groupLimitations[group.id]}
                </p>
              </div>
            ))}
            {BigInt(data.longTermWealth.unclassifiedKnownValueCents) > 0n && (
              <div className="rounded-lg border border-dashed p-3 sm:col-span-2">
                <div className="flex justify-between gap-2 text-sm">
                  <span>Classe ou geografia não identificada</span>
                  <span className="tabular-nums">
                    {formatCurrencyCents(
                      data.longTermWealth.unclassifiedKnownValueCents,
                    )}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Esses valores ficam fora dos quatro grupos até a classificação
                  ser conhecida.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        {(data.valuationDates.length > 1 || totalUnknown > 0) && (
          <Alert>
            <AlertTitle>Limites dos dados</AlertTitle>
            <AlertDescription>
              {data.valuationDates.length > 1 &&
                `As fontes disponíveis têm datas efetivas diferentes: ${data.valuationDates.map(formatDate).join(", ")}. `}
              {totalUnknown > 0 &&
                "Valores não conhecidos não são tratados como zero."}
            </AlertDescription>
          </Alert>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que importa para você?</CardTitle>
          <p className="text-sm text-muted-foreground">
            Duas respostas ajustam os fatos e as direções que você pode
            registrar. Não calculam recomendação nem meta percentual.
          </p>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="strategy-horizon">
              Em quantos anos espera usar uma parte relevante desse valor?
            </Label>
            <Input
              id="strategy-horizon"
              type="number"
              min={1}
              max={100}
              step={1}
              value={answers.horizonYears}
              onChange={(event) =>
                setAnswers({
                  ...answers,
                  horizonYears:
                    event.target.value === "" ? "" : Number(event.target.value),
                })
              }
              aria-describedby="strategy-horizon-help"
            />
            <p
              id="strategy-horizon-help"
              className="text-xs text-muted-foreground"
            >
              Usamos o prazo apenas para comparar com vencimentos cadastrados.
              Não inferimos liquidez nem adequação.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="strategy-international">
              Você quer considerar investimentos com exposição internacional?
            </Label>
            <Select
              value={answers.internationalInterest}
              onValueChange={(
                value: Exclude<Answers["internationalInterest"], "">,
              ) => {
                setAnswers({ ...answers, internationalInterest: value });
                if (
                  value === "not_interested" &&
                  selectedDirection === "consider_international"
                ) {
                  setSelectedDirection(null);
                }
              }}
            >
              <SelectTrigger id="strategy-international">
                <SelectValue placeholder="Escolha uma resposta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interested">Sim</SelectItem>
                <SelectItem value="not_interested">Não por enquanto</SelectItem>
                <SelectItem value="unsure">Ainda não sei</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              A resposta inclui ou oculta a direção sobre exposição
              internacional; não define uma porcentagem.
            </p>
          </div>
        </CardContent>
      </Card>

      <section
        aria-labelledby="strategy-directions-title"
        className="space-y-3"
      >
        <div>
          <h2 id="strategy-directions-title" className="text-lg font-semibold">
            Escolha uma direção para desenvolver
          </h2>
          <p className="text-sm text-muted-foreground">
            São temas para orientar sua estratégia. Nenhum altera sua carteira
            ou representa uma composição percentual concluída.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {horizon ? (
            <DirectionCard
              id="review_horizon"
              selected={selectedDirection === "review_horizon"}
              title="Revisar os prazos da carteira de longo prazo"
              Icon={Timer}
              onSelect={setSelectedDirection}
            >
              <p>
                Considerando o horizonte de {answers.horizonYears} ano(s), há{" "}
                {horizon.knownMaturityCount} posição(ões) com vencimento
                cadastrado até {formatDate(horizon.cutoffDate)}.
              </p>
              <p>
                {data.longTermPositionsWithoutMaturityDate} posição(ões) não têm
                vencimento cadastrado. A comparação é factual e não determina se
                o prazo é adequado.
              </p>
            </DirectionCard>
          ) : (
            <p className="text-sm text-muted-foreground">
              Informe seu horizonte para comparar os vencimentos cadastrados.
            </p>
          )}
          {showInternational && (
            <DirectionCard
              id="consider_international"
              selected={selectedDirection === "consider_international"}
              title="Avaliar exposição internacional"
              Icon={Globe2}
              onSelect={setSelectedDirection}
            >
              <p>
                Você indicou{" "}
                {answers.internationalInterest === "interested"
                  ? "interesse"
                  : "dúvida"}{" "}
                em considerar exposição internacional. Hoje há{" "}
                {formatCurrencyCents(internationalValue)} em ETFs internacionais
                identificados nos destinos de longo prazo.
              </p>
              <p>
                Essa direção apenas registra o tema a estudar; não seleciona
                ETFs nem sugere peso. Exposição cambial e variação de mercados
                podem ampliar oscilações.
              </p>
            </DirectionCard>
          )}
        </div>
      </section>

      <Alert>
        <Compass className="size-4" />
        <AlertTitle>
          Esta versão não conclui uma alocação quantitativa
        </AlertTitle>
        <AlertDescription>
          Ainda não há metodologia validada que transforme essas respostas e os
          dados disponíveis em percentuais-alvo comparáveis para as quatro
          classes. A evolução quantitativa tem critérios próprios e não faz
          parte desta escolha.
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {data.savedStrategy
            ? "Sua direção está registrada."
            : "A escolha será salva sem alterar metas, destinos ou posições."}
        </p>
        <Button
          onClick={() => void save(data!, selectedDirection!)}
          disabled={
            saving ||
            !selectedDirection ||
            answers.horizonYears === "" ||
            answers.horizonYears < 1 ||
            !answers.internationalInterest
          }
        >
          {saving ? "Salvando…" : "Salvar direção escolhida"}
        </Button>
      </div>
    </div>
  );
}

function DirectionCard({
  id,
  selected,
  title,
  Icon,
  onSelect,
  children,
}: {
  id: Direction;
  selected: boolean;
  title: string;
  Icon: typeof Timer;
  onSelect: (direction: Direction) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(id)}
      className={`h-full rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 font-semibold">
          <Icon aria-hidden="true" className="size-4 text-primary" />
          {title}
        </span>
        {selected && <Badge>Escolhida</Badge>}
      </span>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
        {children}
      </div>
    </button>
  );
}
