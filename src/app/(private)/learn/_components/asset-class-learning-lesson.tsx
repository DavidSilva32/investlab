import Image from "next/image";
import {
  ArrowRight,
  Building2,
  Clock3,
  Check,
  CircleHelp,
  Coins,
  FileSearch,
  Layers3,
  MapPinned,
  Network,
  PackageOpen,
  Percent,
  Scale,
  ShieldCheck,
  Wallet,
  Landmark as Bank,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { AssetClassLearningContent } from "@/lib/asset-class-learning";
import type { StrategyAssetClassId } from "@/lib/strategy-allocation";

type Lesson = AssetClassLearningContent["courseLessons"][number];
type ExampleIconName =
  | "clock"
  | "bank"
  | "percent"
  | "scale"
  | "building"
  | "layers"
  | "file"
  | "trend"
  | "package";

type AssetClassLearningLessonProps = {
  selectedClass: StrategyAssetClassId;
  lessonIndex: number;
  lesson: Lesson;
};

const analysisRoadmaps: Record<
  StrategyAssetClassId,
  { title: string; detail: string }[]
> = {
  fiis: [
    {
      title: "Objetivo e estratégia",
      detail: "Compare seu prazo com a política do fundo.",
    },
    {
      title: "Carteira e operação",
      detail: "Veja imóveis ou ativos, locatários, contratos e vacância.",
    },
    {
      title: "Receitas e distribuições",
      detail: "Confira origem e histórico; DY passado não prevê o futuro.",
    },
    {
      title: "Custos e riscos",
      detail: "Leia taxas, concentração, liquidez e riscos nos informes.",
    },
  ],
  fixed_income: [
    {
      title: "Objetivo e prazo",
      detail: "Considere quando você pode precisar do dinheiro.",
    },
    {
      title: "Remuneração",
      detail: "Confira taxa, indexador e condições até o vencimento.",
    },
    {
      title: "Emissor e crédito",
      detail: "Identifique quem emite e a capacidade de pagamento.",
    },
    {
      title: "Liquidez e riscos",
      detail: "Verifique carência, resgate ou venda e proteções aplicáveis.",
    },
  ],
  brazilian_equities: [
    {
      title: "Negócio e objetivo",
      detail: "Entenda a empresa e relacione-a ao seu horizonte.",
    },
    {
      title: "Resultados",
      detail: "Compare receita e lucro em períodos equivalentes.",
    },
    {
      title: "Indicadores e contexto",
      detail: "Leia P/L, P/VP e ROE considerando setor e qualidade dos dados.",
    },
    {
      title: "Preço e riscos",
      detail: "Separe preço observado de estimativas e reveja as premissas.",
    },
  ],
  international_etfs: [
    {
      title: "Objetivo e exposição",
      detail: "Identifique o mercado e a geografia do investimento.",
    },
    {
      title: "Índice e carteira",
      detail: "Confira a referência, os ativos e as regras de composição.",
    },
    {
      title: "Custos e moeda",
      detail:
        "Verifique despesas e como o câmbio pode afetar o valor em reais.",
    },
    {
      title: "Concentração e riscos",
      detail: "Avalie liquidez e riscos; diversificar não elimina perdas.",
    },
  ],
};

type VisualStep = { label: string; detail: string; icon: LucideIcon };

const lessonVisuals: Record<
  Exclude<StrategyAssetClassId, "fiis">,
  Record<number, { title: string; steps: VisualStep[] }>
> = {
  fixed_income: {
    1: {
      title: "Prazo e liquidez definem quando usar o recurso",
      steps: [
        { label: "Prazo", detail: "Quando termina", icon: Clock3 },
        { label: "Liquidez", detail: "Como resgatar", icon: Wallet },
        { label: "Produto", detail: "Regras de saída", icon: FileSearch },
      ],
    },
    2: {
      title: "Emissor e proteções também importam",
      steps: [
        { label: "Emissor", detail: "Quem deve pagar", icon: Building2 },
        { label: "Proteções", detail: "Regras e limites", icon: ShieldCheck },
        {
          label: "Crédito",
          detail: "Capacidade de pagamento",
          icon: FileSearch,
        },
      ],
    },
    3: {
      title: "Compare as condições lado a lado",
      steps: [
        { label: "Remuneração", detail: "Taxa e indexador", icon: Coins },
        { label: "Prazo", detail: "Quando vence", icon: Clock3 },
        { label: "Liquidez", detail: "Condições de resgate", icon: Wallet },
      ],
    },
  },
  brazilian_equities: {
    1: {
      title: "O resultado começa no negócio",
      steps: [
        { label: "Empresa", detail: "O que faz", icon: Building2 },
        { label: "Receita", detail: "Vendas e serviços", icon: Coins },
        { label: "Lucro", detail: "Após despesas", icon: Scale },
      ],
    },
    2: {
      title: "Cada indicador responde uma pergunta",
      steps: [
        {
          label: "P/L",
          detail: "Relaciona preço e lucro por ação",
          icon: Scale,
        },
        {
          label: "P/VP",
          detail: "Compara preço e patrimônio por ação",
          icon: FileSearch,
        },
        {
          label: "ROE",
          detail: "Relaciona lucro e patrimônio da empresa",
          icon: Coins,
        },
      ],
    },
    3: {
      title: "Preço observado e estimativa são diferentes",
      steps: [
        {
          label: "Preço de mercado",
          detail: "Muda na negociação",
          icon: Coins,
        },
        { label: "Método", detail: "Usa dados e premissas", icon: FileSearch },
        { label: "Estimativa", detail: "Não é garantia", icon: CircleHelp },
      ],
    },
  },
  international_etfs: {
    1: {
      title: "Entenda a referência e a composição",
      steps: [
        {
          label: "Índice",
          detail: "Uma referência possível",
          icon: FileSearch,
        },
        { label: "Regras", detail: "Composição da carteira", icon: Scale },
        { label: "Ativos", detail: "O que existe no fundo", icon: Layers3 },
      ],
    },
    2: {
      title: "Ativos, mercados e câmbio podem influenciar",
      steps: [
        { label: "Ativos", detail: "Variação da carteira", icon: Layers3 },
        { label: "Mercados", detail: "Oscilações externas", icon: Network },
        { label: "Câmbio", detail: "Conversão para reais", icon: Coins },
      ],
    },
    3: {
      title: "Diversificar distribui exposição, sem zerar riscos",
      steps: [
        { label: "Cesta", detail: "Reúne ativos", icon: Layers3 },
        { label: "Concentração", detail: "Depende da estratégia", icon: Scale },
        { label: "Riscos", detail: "Ainda podem existir", icon: ShieldCheck },
      ],
    },
  },
};

const visualClassName: Record<StrategyAssetClassId, string> = {
  fiis: "text-asset-class-fiis",
  fixed_income: "text-asset-class-fixed-income",
  brazilian_equities: "text-asset-class-brazilian-equities",
  international_etfs: "text-asset-class-international-etfs",
} as const;

const visualSoftClassName: Record<StrategyAssetClassId, string> = {
  fiis: "bg-asset-class-fiis/5",
  fixed_income: "bg-asset-class-fixed-income/10",
  brazilian_equities: "bg-asset-class-brazilian-equities/10",
  international_etfs: "bg-asset-class-international-etfs/10",
} as const;

const exampleIcons: Record<ExampleIconName, LucideIcon> = {
  clock: Clock3,
  bank: Bank,
  percent: Percent,
  scale: Scale,
  building: Building2,
  layers: Layers3,
  file: FileSearch,
  trend: TrendingUp,
  package: PackageOpen,
};

export function AssetClassLearningLesson({
  selectedClass,
  lessonIndex,
  lesson,
}: AssetClassLearningLessonProps) {
  const isFii = selectedClass === "fiis";
  const className = {
    fiis: "Fundos imobiliários (FIIs)",
    fixed_income: "Renda fixa",
    brazilian_equities: "Ações e BDRs",
    international_etfs: "ETFs internacionais",
  }[selectedClass];
  const analysisRoadmap = lessonIndex === 3 && (
    <section
      aria-label={`Roteiro de análise: ${className}`}
      className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5"
    >
      <h4 className="text-sm font-semibold">Roteiro de análise</h4>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {analysisRoadmaps[selectedClass].map(({ title, detail }, index) => (
          <li
            key={title}
            className="flex items-start gap-3 rounded-lg bg-muted/50 p-3"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-foreground">
              {index + 1}
            </span>
            <span>
              <span className="block text-sm font-medium">{title}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {detail}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {selectedClass === "fiis" && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-asset-class-fiis/20 bg-asset-class-fiis/5 p-3">
          <span className="text-xs font-medium text-muted-foreground">
            DY histórico
          </span>
          <span className="text-sm font-semibold">
            distribuições passadas ÷ preço da cota
          </span>
          <span className="text-xs text-muted-foreground">
            retrato do período, não promessa de rendimento
          </span>
        </div>
      )}
    </section>
  );
  const lessonExamples = lesson.examples;
  const examplesSection = lessonExamples && (
    <section
      aria-label={`Exemplos: ${className}`}
      className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5"
    >
      <div className="flex items-center gap-2">
        <Network
          aria-hidden="true"
          className={`size-4 ${visualClassName[selectedClass]}`}
        />
        <h4 className="text-sm font-semibold">
          {selectedClass === "fixed_income" && lessonIndex === 1
            ? "Três pontos para conferir na oferta"
            : "Na prática"}
        </h4>
      </div>
      <ul
        className={`mt-3 grid items-stretch gap-2 ${
          selectedClass === "fixed_income" && lessonIndex === 1
            ? "sm:grid-cols-3 sm:gap-x-8"
            : "sm:grid-cols-2 xl:grid-cols-3"
        }`}
      >
        {lessonExamples.map((example, exampleIndex) => {
          const Icon = example.icon
            ? exampleIcons[example.icon]
            : exampleIcons.package;
          return (
            <li
              key={example.title}
              className={`flex min-w-0 items-stretch gap-2 ${selectedClass === "fixed_income" && lessonIndex === 1 ? "relative flex-col sm:flex-row sm:items-center" : ""}`}
            >
              <article
                className={`relative flex min-w-0 flex-1 gap-3 overflow-hidden rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors ${visualSoftClassName[selectedClass]} sm:p-4`}
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg bg-background ${visualClassName[selectedClass]}`}
                >
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <h5 className="text-sm font-semibold">{example.title}</h5>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {example.description}
                  </p>
                </div>
              </article>
              {selectedClass === "fixed_income" &&
                lessonIndex === 1 &&
                exampleIndex < lessonExamples.length - 1 && (
                  <ArrowRight
                    aria-hidden="true"
                    className="mx-auto size-4 rotate-90 text-asset-class-fixed-income sm:absolute sm:right-[-1.5rem] sm:top-1/2 sm:mx-0 sm:-translate-y-1/2 sm:rotate-0"
                  />
                )}
            </li>
          );
        })}
      </ul>
    </section>
  );

  if (!isFii) {
    const visual = lessonVisuals[selectedClass][lessonIndex];
    const accent = visualClassName[selectedClass];
    const accentSoft = visualSoftClassName[selectedClass];

    if (visual)
      return (
        <div className="mt-1 space-y-4">
          <section
            aria-label={visual.title}
            className={`relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-muted/60 via-card to-card p-4 sm:p-5 ${accent}`}
          >
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-foreground sm:text-base">
                {visual.title}
              </h4>
              <span className="shrink-0 rounded-full bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground">
                Esquema simplificado
              </span>
            </div>
            <div className="mt-5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1 sm:gap-3">
              {visual.steps.map(({ label, detail, icon: Icon }, index) => (
                <div key={label} className="contents">
                  <div className="min-w-0 text-center">
                    <span
                      className={`mx-auto grid size-12 place-items-center rounded-2xl ${accentSoft} ${accent} sm:size-14`}
                    >
                      <Icon aria-hidden="true" className="size-6" />
                    </span>
                    <p className="mt-2 text-xs font-semibold text-foreground sm:text-sm">
                      {label}
                    </p>
                    <p className="mx-auto mt-1 max-w-32 text-xs leading-4 text-muted-foreground sm:text-sm">
                      {detail}
                    </p>
                  </div>
                  {index < visual.steps.length - 1 && (
                    <ArrowRight
                      aria-hidden="true"
                      className={`size-4 ${accent} sm:size-5`}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
          {examplesSection}
          {analysisRoadmap}
        </div>
      );
  }

  return (
    <div className="mt-1 space-y-4">
      {isFii && lessonIndex === 1 && (
        <section
          aria-label="Como funciona a participação em um fundo"
          className="grid gap-4 rounded-2xl border border-border/60 bg-gradient-to-br from-asset-class-fiis/10 via-card to-card p-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:p-5"
        >
          <div className="flex flex-col justify-center">
            <div className="flex size-11 items-center justify-center rounded-xl bg-asset-class-fiis/10 text-asset-class-fiis">
              <Layers3 aria-hidden="true" className="size-5" />
            </div>
            <h4 className="mt-3 font-semibold">Você participa como cotista</h4>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              O fundo reúne cotistas e segue uma estratégia definida. Sua cota
              representa uma parte dessa participação.
            </p>
          </div>
          <div className="rounded-xl bg-background/75 p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Um fundo · várias pessoas
            </p>
            <div
              role="img"
              aria-label="Cotas de seis investidores participam do mesmo fundo imobiliário"
              className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6"
            >
              {Array.from({ length: 6 }, (_, index) => (
                <span
                  key={index}
                  className={`grid aspect-[1.4/1] place-items-center rounded-xl text-xs font-semibold sm:aspect-square ${
                    index === 0
                      ? "bg-asset-class-fiis/15 text-asset-class-fiis"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {index === 0 ? "Você" : "Cotista"}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Cada cotista participa conforme suas cotas e as regras do fundo.
            </p>
          </div>
        </section>
      )}

      {lesson.visuals && (
        <section aria-label="Exemplos de imóveis de fundos imobiliários">
          <div className="mb-3 flex items-center gap-2">
            <Building2
              aria-hidden="true"
              className="size-4 text-asset-class-fiis"
            />
            <h4 className="text-sm font-semibold">Exemplos de portfólio</h4>
            <span className="text-xs text-muted-foreground">
              Cada fundo tem sua própria estratégia
            </span>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {lesson.visuals.map((visual) => (
              <li
                key={visual.title}
                className="group overflow-hidden rounded-2xl bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                  <Image
                    src={visual.imageSrc}
                    alt={visual.imageAlt}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-105 motion-reduce:transition-none"
                  />
                </div>
                <div className="p-3">
                  <h5 className="text-sm font-semibold">{visual.title}</h5>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {visual.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isFii && lessonIndex === 2 && (
        <section
          aria-label="Exemplo de vacância física em 10 salas de mesma área"
          className="grid gap-4 rounded-2xl border border-border/60 bg-gradient-to-br from-muted/50 via-card to-card p-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] sm:p-5"
        >
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MapPinned
                aria-hidden="true"
                className="size-4 text-asset-class-fiis"
              />
              Imagine um prédio com 10 salas de mesma área
            </div>
            <div
              role="img"
              aria-label="Dez salas de mesma área: oito ocupadas e duas vazias, exemplo de 20 por cento da área com vacância física"
              className="mt-4 grid grid-cols-5 gap-2"
            >
              {Array.from({ length: 10 }, (_, index) => {
                const empty = index >= 8;
                return (
                  <span
                    key={index}
                    className={`flex aspect-[1.25/1] items-center justify-center rounded-lg border ${
                      empty
                        ? "border-status-warning/35 bg-status-warning/10 text-status-warning"
                        : "border-asset-class-fiis/30 bg-asset-class-fiis/10 text-asset-class-fiis"
                    }`}
                  >
                    {empty ? (
                      <CircleHelp aria-hidden="true" className="size-4" />
                    ) : (
                      <Check aria-hidden="true" className="size-4" />
                    )}
                  </span>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-sm bg-asset-class-fiis"
                />
                8 ocupadas
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-sm bg-status-warning"
                />
                2 vazias
              </span>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-3">
            <div className="rounded-xl bg-asset-class-fiis/5 p-3">
              <h5 className="text-sm font-semibold">Vacância física</h5>
              <p className="mt-1 text-sm text-muted-foreground">
                Área sem locatário. Como as salas têm a mesma área, 2 de 10
                vazias representam 20% da área.
              </p>
            </div>
            <div className="rounded-xl bg-muted/70 p-3">
              <h5 className="text-sm font-semibold">Vacância financeira</h5>
              <p className="mt-1 text-sm text-muted-foreground">
                Estima o efeito dos espaços vagos na receita potencial.
              </p>
            </div>
          </div>
        </section>
      )}

      {examplesSection}

      {analysisRoadmap}
    </div>
  );
}
