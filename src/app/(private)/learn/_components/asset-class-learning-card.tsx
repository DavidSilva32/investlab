import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CirclePlay, Clock3 } from "lucide-react";
import {
  assetClassLearningContent,
  getLearningClassHref,
} from "@/lib/asset-class-learning";
import {
  strategyAssetClassById,
  type StrategyAssetClassId,
} from "@/lib/strategy-allocation";

export function AssetClassLearningCard({
  id,
  selected,
}: {
  id: StrategyAssetClassId;
  selected: boolean;
}) {
  const assetClass = strategyAssetClassById[id];
  const content = assetClassLearningContent[id];

  return (
    <Link
      href={getLearningClassHref(id)}
      aria-current={selected ? "location" : undefined}
      aria-label={`Abrir conteúdo sobre ${assetClass.label}`}
      className={`group relative flex min-w-[230px] items-center gap-3 rounded-2xl border bg-card p-2.5 transition-all motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-0 ${selected ? "border-primary/50 bg-primary/[0.04] shadow-sm ring-1 ring-primary/15" : "border-border/60 hover:border-border hover:bg-muted/30"}`}
      style={{
        borderColor: selected
          ? `color-mix(in srgb, var(${assetClass.colorToken}) 50%, var(--border))`
          : undefined,
      }}
    >
      <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-muted sm:size-14">
        <Image
          src={content.imageSrc}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
          className="object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="min-w-0">
          <h3
            className="truncate text-sm font-semibold tracking-tight"
            style={{
              color: selected ? `var(${assetClass.colorToken})` : undefined,
            }}
          >
            {assetClass.label}
          </h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {content.availability === "available"
              ? `${content.courseLessons.length} aulas · prova final`
              : "Vídeo em breve"}
          </p>
        </div>
      </div>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
        {content.availability === "available" ? (
          <CirclePlay aria-hidden="true" className="size-4" />
        ) : (
          <Clock3 aria-hidden="true" className="size-4" />
        )}
      </span>
      <ArrowUpRight
        aria-hidden="true"
        className="absolute right-2 top-2 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      />
    </Link>
  );
}
