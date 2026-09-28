"use client";

import { useCallback, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";

type AssetClass = (typeof portfolioAssetClassOptions)[number];
type Context = { objective: string | null; targetMonth: string | null };

type VariableIncomeType =
  "Ações" | "ETFs de ações" | "FIIs" | "Fundos de ações" | "BDRs";

const variableIncomeOptions: {
  label: VariableIncomeType;
  description: string;
  sourceLabel: string;
  href: string;
}[] = [
  {
    label: "Ações",
    description:
      "Representam participação em uma empresa. O resultado depende da empresa e das condições de mercado.",
    sourceLabel: "Portal do Investidor: ações",
    href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/fundos-de-investimentos/acoes",
  },
  {
    label: "ETFs de ações",
    description:
      "Fundos que buscam acompanhar um índice de ações. Existem também ETFs de renda fixa.",
    sourceLabel: "Portal do Investidor: ETFs",
    href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/etfs",
  },
  {
    label: "FIIs",
    description:
      "Fundos que investem em empreendimentos ou ativos ligados ao mercado imobiliário.",
    sourceLabel: "Portal do Investidor: FIIs",
    href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/fundos-de-investimentos-imobiliarios-fii",
  },
  {
    label: "Fundos de ações",
    description:
      "Fundos com estratégias e carteiras próprias; consulte a política e os documentos de cada fundo.",
    sourceLabel: "Portal do Investidor: fundos",
    href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/fundos-de-investimentos",
  },
  {
    label: "BDRs",
    description:
      "Certificados que podem representar ações, cotas de ETFs ou títulos de dívida negociados no exterior. Sem identificar o lastro, não dá para dizer qual tipo de exposição um BDR oferece.",
    sourceLabel: "Portal do Investidor: BDRs",
    href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/brazilian-depositary-receipts-bdrs",
  },
];

const guidance: Record<
  Exclude<AssetClass, "Renda variável">,
  { summary: string; detail: string; source?: { label: string; href: string } }
> = {
  "Renda fixa": {
    summary: "As condições de remuneração são definidas para cada título.",
    detail:
      "O valor pode oscilar se houver venda antes do vencimento. Risco de crédito, prazo e possibilidade de resgate dependem do título e do emissor.",
    source: {
      label: "CVM: risco e liquidez",
      href: "https://www.gov.br/investidor/pt-br/investir/antes-de-investir/entenda-as-caracteristicas-dos-investimentos/risco-e-a-relacao-risco-x-retorno",
    },
  },
  Fundos: {
    summary:
      "Fundos diferentes podem investir em ativos e estratégias distintos.",
    detail:
      "Riscos, carteira e regras para resgate dependem da categoria e do regulamento.",
    source: {
      label: "Portal do Investidor: fundos de investimento",
      href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/fundos-de-investimentos",
    },
  },
  Criptoativos: {
    summary: "Criptoativos podem ter alta volatilidade.",
    detail: "A natureza e a regulação variam conforme o ativo e a oferta.",
    source: {
      label: "CVM: criptoativos",
      href: "https://www.gov.br/cvm/pt-br/assuntos/protecao/mercado-forex",
    },
  },
  Imóveis: {
    summary:
      "A categoria da carteira não identifica um instrumento imobiliário específico.",
    detail: "Prazos, riscos e regras variam conforme o instrumento.",
  },
  Outros: {
    summary: "Esta categoria reúne instrumentos diferentes.",
    detail: "Sem identificar o instrumento, não há base para compará-lo.",
  },
};

export function StrategyGuidance({
  onOpenTargets,
}: {
  onOpenTargets: (classes: AssetClass[]) => void;
}) {
  const [context, setContext] = useState<Context | null>(null);
  const [contextStatus, setContextStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [classes, setClasses] = useState<AssetClass[]>([]);
  const [variableIncomeTypes, setVariableIncomeTypes] = useState<
    VariableIncomeType[]
  >([]);
  const selected = useMemo(() => new Set(classes), [classes]);

  const loadContext = useCallback(async () => {
    setContextStatus("loading");
    try {
      const response = await fetch("/api/investor-context");
      if (!response.ok) throw new Error("Unable to load investor context");
      const body = (await response.json()) as { context?: Context };
      setContext(body.context ?? { objective: null, targetMonth: null });
      setContextStatus("ready");
    } catch {
      setContext(null);
      setContextStatus("error");
    }
  }, []);

  const targetMonth = context?.targetMonth
    ? new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(context.targetMonth + "-01T00:00:00Z"))
    : null;

  function toggleClass(
    assetClass: AssetClass,
    checked: boolean | "indeterminate",
  ) {
    if (checked && contextStatus === "idle") void loadContext();
    setClasses((current) =>
      checked
        ? [...new Set([...current, assetClass])]
        : current.filter((item) => item !== assetClass),
    );
    if (assetClass === "Renda variável" && !checked) {
      setVariableIncomeTypes([]);
    }
  }

  function toggleVariableIncomeType(
    type: VariableIncomeType,
    checked: boolean | "indeterminate",
  ) {
    setVariableIncomeTypes((current) =>
      checked
        ? [...new Set([...current, type])]
        : current.filter((item) => item !== type),
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/2">
      <CardHeader>
        <CardTitle>Construir sua estratégia</CardTitle>
        <CardDescription>
          Explore alternativas para seus objetivos. Esta escolha não presume um
          perfil nem define uma carteira.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {classes.length > 0 && contextStatus === "loading" && (
          <p role="status" className="text-sm text-muted-foreground">
            Carregando o contexto que você informou.
          </p>
        )}
        {classes.length > 0 && contextStatus === "error" && (
          <div role="alert" className="space-y-2 rounded-lg border p-4">
            <p className="text-sm">
              Não foi possível carregar o contexto que você informou.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadContext()}
            >
              Tentar novamente
            </Button>
          </div>
        )}
        {context &&
          contextStatus === "ready" &&
          (context.objective || targetMonth) && (
            <div className="rounded-lg border bg-background p-4 text-sm">
              <p className="font-medium">Contexto que você informou</p>
              {context.objective && (
                <p className="mt-1 text-muted-foreground">
                  Objetivo: “{context.objective}”
                </p>
              )}
              {targetMonth && (
                <p className="mt-1 text-muted-foreground">
                  Pretende usar o dinheiro em: {targetMonth}.
                </p>
              )}
            </div>
          )}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">
            Quais classes você quer considerar?
          </legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {portfolioAssetClassOptions.map((assetClass, index) => {
              const id = `strategy-class-${index}`;
              return (
                <label
                  key={assetClass}
                  htmlFor={id}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50"
                >
                  <Checkbox
                    id={id}
                    checked={selected.has(assetClass)}
                    onCheckedChange={(checked) =>
                      toggleClass(assetClass, checked)
                    }
                  />
                  {assetClass}
                </label>
              );
            })}
          </div>
        </fieldset>

        {selected.has("Renda variável") && (
          <fieldset className="space-y-3 border-t pt-5">
            <legend className="text-sm font-semibold">
              Que tipos de renda variável você quer conhecer?
            </legend>
            <p className="text-sm text-muted-foreground">
              A categoria inclui instrumentos diferentes. Escolha um ou mais
              para ver informações sobre cada tipo.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {variableIncomeOptions.map(({ label }, index) => {
                const id = `strategy-variable-income-${index}`;
                return (
                  <label
                    key={label}
                    htmlFor={id}
                    className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50"
                  >
                    <Checkbox
                      id={id}
                      checked={variableIncomeTypes.includes(label)}
                      onCheckedChange={(checked) =>
                        toggleVariableIncomeType(label, checked)
                      }
                    />
                    {label}
                  </label>
                );
              })}
            </div>
            {variableIncomeTypes.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2">
                {variableIncomeOptions
                  .filter(({ label }) => variableIncomeTypes.includes(label))
                  .map(({ label, description, sourceLabel, href }) => (
                    <article
                      key={label}
                      className="rounded-lg border bg-background p-4"
                    >
                      <h3 className="font-medium">{label}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {description}
                      </p>
                      <a
                        className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {sourceLabel}
                      </a>
                    </article>
                  ))}
              </div>
            )}
          </fieldset>
        )}

        {classes.some((assetClass) => assetClass !== "Renda variável") && (
          <section
            aria-labelledby="strategy-explanations-title"
            className="space-y-3 border-t pt-5"
          >
            <h3
              id="strategy-explanations-title"
              className="text-sm font-semibold"
            >
              Sobre as classes escolhidas
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {classes
                .filter(
                  (
                    assetClass,
                  ): assetClass is Exclude<AssetClass, "Renda variável"> =>
                    assetClass !== "Renda variável",
                )
                .map((assetClass) => (
                  <article
                    key={assetClass}
                    className="rounded-lg border bg-background p-4"
                  >
                    <h4 className="font-medium">{assetClass}</h4>
                    <p className="mt-1 text-sm">
                      {guidance[assetClass].summary}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {guidance[assetClass].detail}
                    </p>
                    {guidance[assetClass].source && (
                      <a
                        className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        href={guidance[assetClass].source.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {guidance[assetClass].source.label}
                      </a>
                    )}
                  </article>
                ))}
            </div>
          </section>
        )}

        {classes.length > 0 && (
          <div className="space-y-3 border-t pt-5">
            <p className="text-sm text-muted-foreground">
              Nada será alterado nas suas metas até você revisar e salvar no
              editor.
            </p>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => onOpenTargets(classes)}
            >
              <Check aria-hidden="true" className="size-4" /> Revisar minhas
              metas
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
