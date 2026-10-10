import Link from "next/link";
import { ArrowRight, CircleAlert, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ContributionGuidance } from "@/lib/next-contribution-guidance";

const states: Record<
  ContributionGuidance["status"],
  { text: string; label: string; href: string }
> = {
  reserve_below_target: {
    text: "Reserva abaixo da sua meta",
    label: "Revisar reserva",
    href: "/portfolio?panel=objectives&objective=reserve",
  },
  reserve_incomplete: {
    text: "Revise os valores da reserva",
    label: "Revisar reserva",
    href: "/portfolio?panel=objectives&objective=reserve",
  },
  target_gap: {
    text: "Classe abaixo da sua meta",
    label: "Planejar aporte",
    href: "/strategy",
  },
  no_gap: {
    text: "Nenhuma classe abaixo da meta",
    label: "Consultar estratégia",
    href: "/strategy",
  },
  needs_targets: {
    text: "Defina suas metas de alocação",
    label: "Configurar estratégia",
    href: "/strategy",
  },
  needs_values: {
    text: "Vincule seus investimentos e valores",
    label: "Organizar carteira",
    href: "/portfolio?panel=objectives",
  },
  incomplete_data: {
    text: "Comparação incompleta",
    label: "Revisar carteira",
    href: "/portfolio?view=positions",
  },
  tie: {
    text: "Mais de uma classe merece revisão",
    label: "Comparar na Estratégia",
    href: "/strategy",
  },
  unavailable: {
    text: "Comparação indisponível",
    label: "Consultar estratégia",
    href: "/strategy",
  },
};
const percentage = (value: number) =>
  `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function DashboardContributionOverview({
  guidance,
}: {
  guidance?: ContributionGuidance;
}) {
  const status = guidance?.status ?? "unavailable";
  const state = states[status];
  const hasComparison =
    status === "target_gap" &&
    guidance?.assetClass &&
    Number.isFinite(guidance.currentPercentage) &&
    Number.isFinite(guidance.targetPercentage);
  const href =
    status === "target_gap"
      ? guidance?.allocationMode === "legacy"
        ? "#legacy-contribution"
        : "/strategy#next-contribution"
      : state.href;
  const attention =
    status === "reserve_below_target" ||
    status === "reserve_incomplete" ||
    status === "incomplete_data";
  const Icon = attention ? CircleAlert : Target;

  return (
    <section aria-labelledby="dashboard-contribution-title" className="h-full">
      <Card className="h-full">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-xl ${attention ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-primary/10 text-primary"}`}
            >
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 id="dashboard-contribution-title" className="font-semibold">
                Próximo aporte
              </h2>
              <p className="text-sm text-muted-foreground">{state.text}</p>
            </div>
          </div>
          {hasComparison && (
            <div className="space-y-3">
              <p className="font-medium">{guidance!.assetClass}</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>Atual</span>
                  <span className="font-semibold tabular-nums">
                    {percentage(guidance!.currentPercentage!)}
                  </span>
                </div>
                <Progress
                  value={guidance!.currentPercentage}
                  aria-label="Alocação atual"
                  className="motion-reduce:[&>div]:transition-none"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>Meta pessoal</span>
                  <span className="font-semibold tabular-nums">
                    {percentage(guidance!.targetPercentage!)}
                  </span>
                </div>
                <Progress
                  value={guidance!.targetPercentage}
                  aria-label="Meta pessoal de alocação"
                  className="[&>div]:bg-primary/50 motion-reduce:[&>div]:transition-none"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {guidance!.allocationMode === "strategy"
                  ? "Investimentos de longo prazo"
                  : "Distribuição da carteira"}
              </p>
            </div>
          )}
          {status === "incomplete_data" && (
            <p className="text-sm text-muted-foreground">
              Há valores ou classificações pendentes.
            </p>
          )}
          {guidance?.reserveNote && (
            <p className="text-xs text-muted-foreground">
              Reserva não considerada nesta comparação.
            </p>
          )}
          <Link
            href={href}
            className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {state.label}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
          <Link
            href="/analyses"
            className="ml-3 inline-flex min-h-10 items-center rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Analisar ações
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
