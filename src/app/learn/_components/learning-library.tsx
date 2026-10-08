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
    <div className="w-full space-y-8">
      <header className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">
          Educação financeira
        </p>
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Aprenda sobre as classes de ativos
        </h2>
        <p className="text-base leading-7 text-muted-foreground">
          Explore conceitos de cada classe para entender melhor como ela se
          relaciona com suas escolhas financeiras.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        {(Object.keys(assetClassLearningContent) as StrategyAssetClassId[]).map(
          (id) => (
            <AssetClassLearningCard
              key={id}
              id={id}
              selected={selectedClass === id}
            />
          ),
        )}
      </div>
      <AssetClassLearningDetail selectedClass={selectedClass} />
    </div>
  );
}
