import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";
import { isValidPortfolioAllocationTargets } from "@/lib/portfolio-allocation-target-values";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";
export type ContributionGuidancePosition = {
  estimatedValue?: number | null;
  totalValue: string | null;
  classification: { assetClass: string | null };
};
export type ContributionGuidance = {
  status:
    | "reserve_below_target"
    | "reserve_incomplete"
    | "target_gap"
    | "no_gap"
    | "needs_targets"
    | "needs_values"
    | "incomplete_data"
    | "tie"
    | "unavailable";
  title: string;
  explanation: string;
  assetClass?: string;
  currentPercentage?: number;
  targetPercentage?: number;
  reserveNote?: string;
};
type Input = {
  positions: ContributionGuidancePosition[];
  targets: unknown;
  emergencyReserve?: EmergencyReserveCalculation;
};
const isAssetClass = (
  value: string | null,
): value is (typeof portfolioAssetClassOptions)[number] =>
  portfolioAssetClassOptions.some((assetClass) => assetClass === value);
const getValue = (position: ContributionGuidancePosition) => {
  const value =
    position.estimatedValue ??
    (position.totalValue === null ? null : Number(position.totalValue));
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
};
const getReserveNote = (reserve?: EmergencyReserveCalculation) => {
  if (!reserve || reserve.status === "not_configured")
    return "A reserva ainda não está configurada; esta comparação não considera uma meta de reserva.";
  if (reserve.status === "expenses_required")
    return "A reserva precisa de um custo mensal válido para ser considerada.";
  return undefined;
};
export function getNextContributionGuidance({
  positions,
  targets,
  emergencyReserve,
}: Input): ContributionGuidance {
  const reserveNote = getReserveNote(emergencyReserve);
  if (
    emergencyReserve?.status === "below_target" &&
    (emergencyReserve.unvaluedGroups > 0 ||
      (emergencyReserve.missingSelectionCount ?? 0) > 0)
  )
    return {
      status: "reserve_incomplete",
      title: "Revise os dados da reserva",
      explanation:
        "Há posições sem valor ou seleções que não correspondem à carteira atual. A diferença para a meta pode estar incompleta, então não indicamos um valor de aporte para a reserva.",
    };
  if (
    emergencyReserve?.status === "below_target" &&
    emergencyReserve.difference !== null &&
    emergencyReserve.difference > 0
  )
    return {
      status: "reserve_below_target",
      title: "Sua reserva está abaixo da meta pessoal",
      explanation: `Faltam R$ ${emergencyReserve.difference.toFixed(2)} para a meta que você definiu. Se essa meta continua prioritária, considere direcionar o próximo aporte à reserva.`,
    };
  if (!positions.length)
    return {
      status: "needs_values",
      title: "Importe sua carteira para orientar o próximo aporte",
      explanation:
        "Ainda não há posições importadas para comparar com sua estratégia.",
      reserveNote,
    };
  const values = positions.map(getValue);
  if (values.some((value) => value === null))
    return {
      status: "incomplete_data",
      title: "Complete os valores e as classificações",
      explanation:
        "Há posições sem valor atual ou sem classe reconhecida. A comparação fica incompleta, então não indicamos uma prioridade de aporte.",
      reserveNote,
    };
  const totalValue = values.reduce<number>((total, value) => total + value!, 0);
  if (totalValue <= 0)
    return {
      status: "needs_values",
      title: "Sem valores atuais para comparar",
      explanation:
        "A orientação depende de posições com valor atual maior que zero.",
      reserveNote,
    };
  if (!isValidPortfolioAllocationTargets(targets))
    return {
      status: "needs_targets",
      title: "Defina sua estratégia de alocação",
      explanation:
        "Registre metas pessoais por classe na carteira para comparar a distribuição atual.",
      reserveNote,
    };
  if (
    positions.some(
      (position) => !isAssetClass(position.classification.assetClass),
    )
  )
    return {
      status: "incomplete_data",
      title: "Complete os valores e as classificações",
      explanation:
        "Há posições sem valor atual ou sem classe reconhecida. A comparação fica incompleta, então não indicamos uma prioridade de aporte.",
      reserveNote,
    };
  const currentByClass = new Map<string, number>();
  positions.forEach((position, index) => {
    const assetClass = position.classification.assetClass!;
    currentByClass.set(
      assetClass,
      (currentByClass.get(assetClass) ?? 0) + values[index]!,
    );
  });
  const gaps = portfolioAssetClassOptions
    .map((assetClass) => ({
      assetClass,
      gap:
        targets[assetClass] -
        ((currentByClass.get(assetClass) ?? 0) / totalValue) * 100,
    }))
    .filter(({ gap }) => gap > 0.01)
    .sort((left, right) => right.gap - left.gap);
  if (!gaps.length)
    return {
      status: "no_gap",
      title: "Nenhuma classe está abaixo da meta",
      explanation:
        "Com os valores atuais e as metas registradas, não há uma classe subalocada para priorizar.",
      reserveNote,
    };
  if (gaps.length > 1 && Math.abs(gaps[0]!.gap - gaps[1]!.gap) <= 0.01)
    return {
      status: "tie",
      title: "Há mais de uma prioridade possível",
      explanation:
        "As maiores diferenças para suas metas estão empatadas. Revise sua estratégia e escolha a prioridade do aporte.",
      reserveNote,
    };
  const priority = gaps[0]!;
  const currentPercentage =
    ((currentByClass.get(priority.assetClass) ?? 0) / totalValue) * 100;
  const targetPercentage = targets[priority.assetClass];
  return {
    status: "target_gap",
    title: `Considere ${priority.assetClass} para o próximo aporte`,
    explanation: `${priority.assetClass} representa ${currentPercentage.toFixed(1)}% da carteira; sua meta pessoal é ${targetPercentage.toFixed(1)}%. A diferença pode orientar a comparação com sua estratégia, mas não recomenda um ativo.`,
    assetClass: priority.assetClass,
    currentPercentage,
    targetPercentage,
    reserveNote,
  };
}
