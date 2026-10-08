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
      className={`group block overflow-hidden rounded-2xl border bg-card shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary/60 ring-1 ring-primary/20" : "border-border/70 hover:-translate-y-0.5 hover:shadow-md"}`}
      style={{
        borderTopColor: `color-mix(in srgb, var(${assetClass.colorToken}) 70%, var(--border))`,
        borderTopWidth: "3px",
      }}
    >
      <div className="relative aspect-[16/7] overflow-hidden bg-muted sm:aspect-[16/6]">
        <Image
          src={content.imageSrc}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/15 to-transparent" />
        <span
          className="absolute bottom-4 left-4 rounded-full border border-border/70 bg-background/85 px-3 py-1 text-xs font-semibold backdrop-blur"
          style={{ color: `var(${assetClass.colorToken})` }}
        >
          {assetClass.label}
        </span>
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight">
            {assetClass.label}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {content.description}
          </p>
        </div>
        <span className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-primary">
          {content.availability === "available" ? (
            <>
              <CirclePlay aria-hidden="true" className="size-4" />
              Assistir conteúdo
            </>
          ) : (
            <>
              <Clock3 aria-hidden="true" className="size-4" />
              Vídeo em breve
            </>
          )}
          <ArrowUpRight
            aria-hidden="true"
            className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        </span>
      </div>
    </Link>
  );
}
