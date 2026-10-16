import { FileText } from "lucide-react";
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
    <section
      className="space-y-3"
      aria-labelledby="allocation-guidance-heading"
    >
      <h3 id="allocation-guidance-heading" className="text-base font-semibold">
        {guidance.allocationMode === "strategy"
          ? "Orientação da Estratégia"
          : "Orientação do próximo aporte"}
      </h3>
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
          <div
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center self-start rounded-full bg-primary/10 text-primary sm:size-16 sm:self-center"
          >
            <FileText className="size-6" />
          </div>
          <div className="min-w-0 space-y-1" aria-live="polite">
            <CardTitle className="text-base">{guidance.title}</CardTitle>
            <CardDescription>{guidance.explanation}</CardDescription>
            {guidance.reserveNote && (
              <p className="pt-1 text-sm text-muted-foreground">
                {guidance.reserveNote}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
