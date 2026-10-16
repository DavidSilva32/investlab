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
    <div className="w-full space-y-5">
      <header className="max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight">
          Aprenda sobre as classes de ativos
        </h2>
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
