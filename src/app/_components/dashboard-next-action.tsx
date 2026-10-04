import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";

export type DashboardNextActionData = {
  title: string;
  detail: string;
  label: string;
  href: string;
};

export function getDashboardNextAction({
  positionCount,
  missingValueCount,
  reserveIncomplete,
  reserve,
}: {
  positionCount: number;
  missingValueCount: number;
  reserveIncomplete: boolean;
  reserve?: EmergencyReserveCalculation;
}): DashboardNextActionData | null {
  if (reserveIncomplete) {
    return {
      title: "Revise as posições selecionadas como reserva",
      detail:
        "Há posições sem valor ou seleções que não correspondem à carteira atual.",
      label: "Revisar reserva",
      href: "/portfolio?panel=objectives&objective=reserve",
    };
  }
  if (positionCount === 0) {
    return {
      title: "Adicione os dados da sua carteira",
      detail: "Sem posições, ainda não há base para interpretar sua situação.",
      label: "Importar carteira",
      href: "/imports",
    };
  }
  if (missingValueCount > 0) {
    return {
      title: "Revise as posições sem valor atual",
      detail:
        "Valores ausentes deixam o total conhecido e a distribuição incompletos.",
      label: "Revisar carteira",
      href: "/portfolio?view=positions",
    };
  }
  if (
    reserve &&
    (reserve.monthlyExpenses === null || reserve.status === "not_configured")
  ) {
    return {
      title: "Complete a configuração da reserva",
      detail:
        "Informe suas despesas e defina sua meta pessoal para acompanhar a cobertura.",
      label: "Configurar reserva",
      href: "/portfolio?panel=objectives&objective=reserve&screen=reserve-settings",
    };
  }
  if (reserve?.status === "below_target" && reserve.difference !== null) {
    return {
      title: "Acompanhe a evolução da reserva",
      detail:
        "A cobertura está abaixo da meta pessoal que você definiu. Consulte os valores registrados na carteira.",
      label: "Ver reserva",
      href: "/portfolio?panel=objectives&objective=reserve",
    };
  }
  return null;
}

export function DashboardNextAction({
  action,
}: {
  action: DashboardNextActionData | null;
}) {
  if (!action) return null;

  return (
    <section aria-labelledby="dashboard-next-action-title">
      <Card className="h-full">
        <CardContent className="h-full p-5 sm:p-6">
          <h2
            id="dashboard-next-action-title"
            className="text-lg font-semibold"
          >
            Próxima ação
          </h2>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            <span className="grid size-12 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary">
              <ClipboardList aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="mt-1 font-medium">{action.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {action.detail}
              </p>
              <Link
                href={action.href}
                className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {action.label}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
