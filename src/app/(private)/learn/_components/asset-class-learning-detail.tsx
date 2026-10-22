import { ChevronDown, CirclePlay, ExternalLink } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { AssetClassLearningQuiz } from "./asset-class-learning-quiz";
import { assetClassLearningContent } from "@/lib/asset-class-learning";
import {
  strategyAssetClassById,
  type StrategyAssetClassId,
} from "@/lib/strategy-allocation";

export function AssetClassLearningDetail({
  selectedClass,
}: {
  selectedClass: StrategyAssetClassId | null;
}) {
  if (!selectedClass) {
    return (
      <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
        Selecione uma classe para abrir o conteúdo educativo.
      </p>
    );
  }

  const assetClass = strategyAssetClassById[selectedClass];
  const content = assetClassLearningContent[selectedClass];

  return (
    <section
      key={selectedClass}
      id="class-content"
      aria-labelledby="class-content-title"
      className="motion-content-reveal scroll-mt-24 rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-7"
      style={{
        borderTopColor: `color-mix(in srgb, var(${assetClass.colorToken}) 70%, var(--border))`,
        borderTopWidth: "3px",
      }}
    >
      <div className="mb-5">
        <h2
          id="class-content-title"
          className="text-2xl font-semibold tracking-tight"
        >
          {assetClass.label}
        </h2>
      </div>

      <article className="mb-5 rounded-xl border border-border/70 bg-muted/30 p-4 sm:p-5">
        <h3 className="text-lg font-semibold">{content.lesson.title}</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {content.lesson.explanation}
        </p>
        <p className="mt-3 max-w-3xl text-sm font-medium leading-6">
          {content.lesson.takeaway}
        </p>
      </article>

      {content.availability === "available" ? (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-black">
          <video
            key={content.videoSrc}
            className="aspect-video w-full"
            controls
            playsInline
            preload="none"
            poster={content.thumbnailSrc}
            aria-label={`Conteúdo educativo: ${assetClass.label}`}
          >
            <source src={content.videoSrc} type="video/mp4" />
            Seu navegador não oferece suporte à reprodução de vídeo.
          </video>
        </div>
      ) : (
        <p
          role="status"
          className="flex min-h-11 items-center gap-2 rounded-lg bg-muted/55 px-3 py-2 text-sm text-muted-foreground"
        >
          <CirclePlay aria-hidden="true" className="size-4 shrink-0" />
          Vídeo em breve
        </p>
      )}

      <div className="mt-5">
        <AssetClassLearningQuiz
          key={selectedClass}
          question={content.quiz.question}
          options={content.quiz.options}
          correctOptionIndex={content.quiz.correctOptionIndex}
        />
      </div>

      <Collapsible className="mt-4 rounded-xl border border-border/70">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="group flex min-h-11 w-full justify-between px-4 text-left"
            aria-label={`Fontes oficiais sobre ${assetClass.label}`}
          >
            <span>Fontes oficiais</span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 transition-transform group-data-[state=open]:rotate-180"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border/70 px-4 py-3">
          <ul className="grid gap-2">
            {content.sources.map((source) => (
              <li key={source.href}>
                <a
                  href={source.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {source.label}
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
