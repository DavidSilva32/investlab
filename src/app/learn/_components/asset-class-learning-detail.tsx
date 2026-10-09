import { CirclePlay } from "lucide-react";
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
      id="class-content"
      aria-labelledby="class-content-title"
      className="scroll-mt-24 rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-7"
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
    </section>
  );
}
