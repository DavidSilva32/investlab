import { type StrategyAssetClassId } from "@/lib/strategy-allocation";
import { assetClassLearningContent } from "@/lib/asset-class-learning";
import { AssetClassLearningCard } from "./asset-class-learning-card";
import { AssetClassLearningDetail } from "./asset-class-learning-detail";

export function LearningLibrary({
  selectedClass,
}: {
  selectedClass: StrategyAssetClassId | null;
}) {
  return (
    <div className="w-full space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Aprender
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            Escolha um curso
          </h2>
        </div>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Aulas visuais e prova final
        </p>
      </header>

      <nav
        aria-label="Cursos por classe de ativos"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 md:grid md:grid-cols-2 md:overflow-visible 2xl:grid-cols-4"
      >
        {(Object.keys(assetClassLearningContent) as StrategyAssetClassId[]).map(
          (id) => (
            <AssetClassLearningCard
              key={id}
              id={id}
              selected={selectedClass === id}
            />
          ),
        )}
      </nav>
      <AssetClassLearningDetail selectedClass={selectedClass} />
    </div>
  );
}
