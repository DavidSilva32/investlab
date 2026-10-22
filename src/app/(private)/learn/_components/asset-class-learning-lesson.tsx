import Image from "next/image";
import { Building2, Check, CircleHelp, Layers3, MapPinned } from "lucide-react";
import type { AssetClassLearningContent } from "@/lib/asset-class-learning";
import type { StrategyAssetClassId } from "@/lib/strategy-allocation";

type Lesson = AssetClassLearningContent["courseLessons"][number];

type AssetClassLearningLessonProps = {
  selectedClass: StrategyAssetClassId;
  lessonIndex: number;
  lesson: Lesson;
};

const fiiChecklist = [
  "O que o fundo possui?",
  "Como estão os espaços e contratos?",
  "De onde vêm as distribuições?",
  "Quais são os custos e riscos?",
];

export function AssetClassLearningLesson({
  selectedClass,
  lessonIndex,
  lesson,
}: AssetClassLearningLessonProps) {
  const isFii = selectedClass === "fiis";

  return (
    <div className="mt-5 space-y-5">
      {isFii && lessonIndex === 1 && (
        <section
          aria-label="Como funciona a participação em um fundo"
          className="grid gap-4 rounded-2xl border border-asset-class-fiis/25 bg-asset-class-fiis/5 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:p-5"
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
          <div className="rounded-xl border border-border/70 bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Um fundo · várias pessoas
            </p>
            <div
              role="img"
              aria-label="Cotas de seis investidores participam do mesmo fundo imobiliário"
              className="mt-4 grid grid-cols-6 gap-2"
            >
              {Array.from({ length: 6 }, (_, index) => (
                <span
                  key={index}
                  className={`grid aspect-square place-items-center rounded-lg border text-xs font-semibold ${
                    index === 0
                      ? "border-asset-class-fiis/40 bg-asset-class-fiis/15 text-asset-class-fiis"
                      : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {index === 0 ? "Você" : "Cota"}
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
                className="group overflow-hidden rounded-xl border border-border/70 bg-card transition-shadow hover:shadow-md"
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
          aria-label="Exemplo de vacância física"
          className="grid gap-4 rounded-2xl border border-border/70 bg-muted/25 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:p-5"
        >
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MapPinned
                aria-hidden="true"
                className="size-4 text-asset-class-fiis"
              />
              Imagine um prédio com 10 salas
            </div>
            <div
              role="img"
              aria-label="Oito salas ocupadas e duas salas vazias, exemplo de 20 por cento de vacância física"
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
            <div className="rounded-xl border border-border/70 bg-card p-3">
              <h5 className="text-sm font-semibold">Vacância física</h5>
              <p className="mt-1 text-sm text-muted-foreground">
                Área sem locatário. No exemplo, 2 de 10 salas estão vazias.
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card p-3">
              <h5 className="text-sm font-semibold">Vacância financeira</h5>
              <p className="mt-1 text-sm text-muted-foreground">
                Estima o efeito dos espaços vagos na receita potencial.
              </p>
            </div>
          </div>
        </section>
      )}

      {isFii && lessonIndex === 3 && (
        <section
          aria-label="Roteiro simples para analisar um fundo"
          className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5"
        >
          <h4 className="text-sm font-semibold">Um roteiro para começar</h4>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {fiiChecklist.map((item, index) => (
              <li
                key={item}
                className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-asset-class-fiis/10 text-xs font-semibold text-asset-class-fiis">
                  {index + 1}
                </span>
                {item}
              </li>
            ))}
          </ol>
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
        </section>
      )}
    </div>
  );
}
