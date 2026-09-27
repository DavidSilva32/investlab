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
type Choice = "yes" | "no" | "unsure" | null;
type Preference = "fewer" | "accept" | "unsure" | null;
type Context = { objective: string | null; targetMonth: string | null };

const guidance: Record<
  AssetClass,
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
  "Renda variável": {
    summary: "Uma ação representa participação em uma empresa.",
    detail:
      "O preço pode subir ou cair, e não há garantia de retorno. O resultado depende da empresa e das condições de mercado.",
    source: {
      label: "CVM: ações",
      href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/fundos-de-investimentos/acoes",
    },
  },
  Fundos: {
    summary:
      "Fundos diferentes podem investir em ativos e estratégias distintos.",
    detail:
      "Riscos, carteira e regras para resgate dependem da categoria e do regulamento. O nome amplo desta classe não permite comparar essas características.",
    source: {
      label: "CVM: fundos de investimento",
      href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/fundos-de-investimentos",
    },
  },
  Criptoativos: {
    summary: "Criptoativos podem ter alta volatilidade.",
    detail:
      "A natureza e a regulação variam conforme o ativo e a oferta. Esta explicação não avalia um criptoativo específico.",
    source: {
      label: "CVM: criptoativos",
      href: "https://www.gov.br/cvm/pt-br/assuntos/protecao/mercado-forex",
    },
  },
  Imóveis: {
    summary:
      "A categoria da carteira não identifica um instrumento imobiliário específico.",
    detail:
      "Como prazos, riscos e regras variam conforme o instrumento, não comparamos esta classe sem saber qual alternativa está sendo considerada.",
  },
  Outros: {
    summary: "Esta categoria reúne instrumentos diferentes.",
    detail:
      "Sem identificar o instrumento, não há base para comparar riscos, liquidez ou horizonte de uso.",
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
  const [liquidity, setLiquidity] = useState<Choice>(null);
  const [preference, setPreference] = useState<Preference>(null);
  const [question, setQuestion] = useState<
    "liquidity" | "preference" | "complete"
  >("liquidity");
  const selected = useMemo(() => new Set(classes), [classes]);
  const hasSelection = classes.length > 0;

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
      }).format(new Date(`${context.targetMonth}-01T00:00:00Z`))
    : null;

  function toggle(assetClass: AssetClass, checked: boolean | "indeterminate") {
    if (checked && contextStatus === "idle") void loadContext();
    setClasses((current) =>
      checked
        ? [...current, assetClass]
        : current.filter((item) => item !== assetClass),
    );
    if (!checked && classes.length === 1) {
      setLiquidity(null);
      setPreference(null);
      setQuestion("liquidity");
    }
  }

  function continueQuestions() {
    setQuestion((current) =>
      current === "liquidity" ? "preference" : "complete",
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/2">
      <CardHeader>
        <CardTitle>Construir sua estratégia</CardTitle>
        <CardDescription>
          Considere alternativas para seus objetivos. Não presumimos um perfil
          nem sugerimos uma carteira pronta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasSelection && contextStatus === "loading" && (
          <p role="status" className="text-sm text-muted-foreground">
            Carregando o contexto que você informou.
          </p>
        )}
        {hasSelection && contextStatus === "error" && (
          <div role="alert" className="space-y-2 rounded-lg border p-4">
            <p className="text-sm">
              Não foi possível carregar o contexto que você informou. Tente
              novamente para continuar.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadContext()}
            >
              Tentar carregar novamente
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
          <p className="text-sm text-muted-foreground">
            Escolha uma ou mais. A seleção fica nesta tela até você decidir se
            quer usá-la ao definir suas metas.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {portfolioAssetClassOptions.map((assetClass) => {
              const id = `strategy-class-${portfolioAssetClassOptions.indexOf(assetClass)}`;
              return (
                <div
                  key={assetClass}
                  className="flex min-h-12 items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50"
                >
                  <Checkbox
                    id={id}
                    aria-labelledby={id + "-label"}
                    checked={selected.has(assetClass)}
                    onCheckedChange={(checked) => toggle(assetClass, checked)}
                  />
                  <span id={id + "-label"}>{assetClass}</span>
                </div>
              );
            })}
          </div>
        </fieldset>
        {classes.length > 0 && contextStatus === "ready" && (
          <>
            {question !== "complete" && (
              <div className="space-y-5 border-t pt-5" aria-live="polite">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Pergunta {question === "liquidity" ? "1" : "2"} de 2
                </p>
                {question === "liquidity" ? (
                  <fieldset className="space-y-3">
                    <legend className="text-sm font-semibold">
                      {targetMonth
                        ? `Você pode precisar usar esse dinheiro antes de ${targetMonth}?`
                        : "Você considera importante conseguir acessar esse dinheiro rapidamente?"}
                    </legend>
                    <p className="text-sm text-muted-foreground">
                      Isso importa porque liquidez e prazo de resgate variam por
                      título e por fundo. A classe ampla não informa essas
                      condições.
                    </p>
                    <ChoiceButtons
                      label="Necessidade de acessar o dinheiro"
                      value={liquidity}
                      options={[
                        ["yes", "Sim, é possível"],
                        ["no", "Não espero precisar"],
                        ["unsure", "Ainda não sei"],
                      ]}
                      onChange={setLiquidity}
                    />
                    {liquidity && (
                      <p
                        className="rounded-md bg-muted/50 p-3 text-sm"
                        role="status"
                      >
                        {liquidity === "yes"
                          ? "Você informou que considera importante acessar o dinheiro rapidamente. Isso torna as regras de resgate de cada instrumento uma informação importante; os dados disponíveis aqui não permitem comparar essa condição entre classes."
                          : liquidity === "no"
                            ? "Você informou que não considera importante acessar o dinheiro rapidamente. Ainda assim, prazo e liquidez dependem do instrumento escolhido e não são iguais para toda a classe."
                            : "Como você ainda não sabe, não usamos liquidez para favorecer ou descartar nenhuma classe. As condições dependem do instrumento."}
                      </p>
                    )}
                    <Button type="button" size="sm" onClick={continueQuestions}>
                      {liquidity ? "Continuar" : "Pular por agora"}
                    </Button>
                  </fieldset>
                ) : (
                  <fieldset className="space-y-3">
                    <legend className="text-sm font-semibold">
                      Como você prefere lidar com oscilações no valor?
                    </legend>
                    <p className="text-sm text-muted-foreground">
                      Sua resposta é uma preferência explícita, não um perfil.
                      Não há uma medida comparável de oscilação para estas
                      classes amplas.
                    </p>
                    <ChoiceButtons
                      label="Preferência diante de oscilações"
                      value={preference}
                      options={[
                        ["fewer", "Prefiro ver menos oscilações"],
                        ["accept", "Aceito oscilações no caminho"],
                        ["unsure", "Ainda não sei"],
                      ]}
                      onChange={setPreference}
                    />
                    {preference && (
                      <p
                        className="rounded-md bg-muted/50 p-3 text-sm"
                        role="status"
                      >
                        {preference === "fewer"
                          ? "Você informou preferência por menos oscilações. Isso merece atenção ao avaliar cada instrumento, mas não permite classificar a adequação de uma classe inteira."
                          : preference === "accept"
                            ? "Você informou que aceita oscilações. Isso não significa que toda classe ou ativo seja adequado; riscos variam entre instrumentos."
                            : "Sem uma preferência definida, não usamos oscilação para favorecer ou descartar alternativas."}
                      </p>
                    )}
                    <Button type="button" size="sm" onClick={continueQuestions}>
                      {preference ? "Continuar" : "Pular por agora"}
                    </Button>
                  </fieldset>
                )}
              </div>
            )}
            {question === "complete" && (
              <section
                aria-labelledby="strategy-explanations-title"
                className="space-y-3 border-t pt-5"
              >
                <h3
                  id="strategy-explanations-title"
                  className="text-sm font-semibold"
                >
                  O que sabemos sobre as classes escolhidas
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {classes.map((assetClass) => (
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
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={() => onOpenTargets(classes)}
                >
                  <Check aria-hidden="true" className="size-4" /> Revisar estas
                  classes nas minhas metas
                </Button>
                <p className="text-xs text-muted-foreground">
                  Sua seleção serve apenas como referência manual no editor da
                  #3. As metas atuais serão carregadas e preservadas; nada será
                  preenchido ou alterado automaticamente. Você decide se e como
                  mudar seus percentuais.
                </p>
                <p className="text-xs text-muted-foreground">
                  As fontes descrevem características gerais. Elas não
                  determinam adequação pessoal nem substituem a análise do
                  instrumento.
                </p>
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ChoiceButtons<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value | null;
  options: readonly (readonly [Value, string])[];
  onChange: (value: Value) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(([option, text]) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={value === option ? "default" : "outline"}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {text}
        </Button>
      ))}
    </div>
  );
}
