import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ContributionGuidance } from "@/lib/next-contribution-guidance";

export function StrategyGuidance({
  nextContributionGuidance,
}: {
  nextContributionGuidance?: ContributionGuidance;
}) {
  const guidance = nextContributionGuidance ?? {
    status: "unavailable" as const,
    title: "Orientação temporariamente indisponível",
    explanation:
      "A orientação do próximo aporte não chegou com os dados da carteira. Atualize a carteira para tentar novamente.",
  };

  return (
    <Card className="border-primary/20 bg-primary/2">
      <CardHeader aria-live="polite">
        <CardTitle>{guidance.title}</CardTitle>
        <CardDescription>{guidance.explanation}</CardDescription>
      </CardHeader>
      {guidance.reserveNote && (
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            {guidance.reserveNote}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
