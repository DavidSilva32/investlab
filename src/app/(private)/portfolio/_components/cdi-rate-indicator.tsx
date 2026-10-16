import { formatQuantity } from "@/lib/utils";

export function CdiRateIndicator({
  percentage,
}: {
  percentage: string | null | undefined;
}) {
  if (percentage === null || percentage === undefined) return null;
  return (
    <span className="block text-xs font-medium text-primary">
      {formatQuantity(Number(percentage))}% do CDI
    </span>
  );
}
