import { ChevronDown, ExternalLink } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { AssetClassLearningCourse } from "./asset-class-learning-course";
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
      className="motion-content-reveal scroll-mt-24"
    >
      <h2 id="class-content-title" className="sr-only">
        {assetClass.label}
      </h2>

      <AssetClassLearningCourse
        key={selectedClass}
        selectedClass={selectedClass}
        content={content}
      />

      <Collapsible className="mt-4 rounded-2xl border border-border/60 bg-card/70">
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
