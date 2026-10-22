import Image from "next/image";
import type { AssetClassLearningVisual } from "@/lib/asset-class-learning";

export function AssetClassLearningVisuals({
  visuals,
}: {
  visuals: AssetClassLearningVisual[];
}) {
  return (
    <ul
      aria-label="Exemplos de ativos imobiliários"
      className="mt-5 grid gap-3 sm:grid-cols-3"
    >
      {visuals.map((visual) => (
        <li
          key={visual.title}
          className="overflow-hidden rounded-xl border border-border/70 bg-card"
        >
          <div className="relative aspect-[3/2] bg-muted">
            <Image
              src={visual.imageSrc}
              alt={visual.imageAlt}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
            />
          </div>
          <div className="space-y-1 p-3">
            <h4 className="text-sm font-semibold">{visual.title}</h4>
            <p className="text-xs leading-5 text-muted-foreground">
              {visual.description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
