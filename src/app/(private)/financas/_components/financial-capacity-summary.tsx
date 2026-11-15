import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyCents } from "@/lib/portfolio-money";

export type FinancialCapacitySimulation = {
  state:
    | "loading"
    | "unavailable"
    | "error"
    | "reserve-incomplete"
    | "portfolio-incomplete"
    | "ready"
    | "reserve-priority"
    | "unallocated";
  reserveContributionCents: string | null;
  allocations: Array<{ label: string; contributionValueCents: string }>;
  unallocatedContributionCents: string;
};

type Props = {
  monthLabel: string;
  expectedBalance: string | null;
  historicalMonth: boolean;
  simulation: FinancialCapacitySimulation | null;
};

const fromCents = (cents: string) => formatCurrencyCents(cents);

export function FinancialCapacitySummary({
  monthLabel,
  expectedBalance,
  historicalMonth,
  simulation,
}: Props) {
  const balance = expectedBalance === null ? null : Number(expectedBalance);

  return (
    <Card aria-labelledby="financial-capacity-title">
      <CardHeader className="pb-3">
        <CardTitle
          id="financial-capacity-title"
          role="heading"
          aria-level={3}
          className="text-lg"
        >
          Distribuição pela estratégia
        </CardTitle>
        <p className="text-sm text-muted-foreground">{monthLabel}</p>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {balance === null || !Number.isFinite(balance) ? (
          <p className="text-sm text-muted-foreground">
            Cadastre receitas e despesas previstas para calcular a simulação.
            Valores sem registro não são tratados como zero.
          </p>
        ) : (
          <>
            {balance < 0 ? (
              <p className="text-sm text-muted-foreground">
                Os registros mostram despesas previstas acima das receitas; não
                há saldo para simular uma distribuição.
              </p>
            ) : balance === 0 ? (
              <p className="text-sm text-muted-foreground">
                Os registros não mostram saldo previsto para simular uma
                distribuição.
              </p>
            ) : historicalMonth ? (
              <p className="text-sm text-muted-foreground">
                Meses passados não recebem simulação: ela usaria as posições e a
                Reserva atuais.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  A simulação usa a estratégia, as posições e a Reserva atuais.
                  Compromissos não cadastrados podem não estar incluídos.
                </p>
                <SimulationResult simulation={simulation} />
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SimulationResult({
  simulation,
}: {
  simulation: FinancialCapacitySimulation | null;
}) {
  if (!simulation || simulation.state === "unavailable") {
    return (
      <p className="text-sm text-muted-foreground">
        Ative sua estratégia de longo prazo para ver uma simulação de
        distribuição.
      </p>
    );
  }
  if (simulation.state === "loading") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Calculando uma simulação pela sua estratégia…
      </p>
    );
  }
  if (simulation.state === "error") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Não foi possível calcular a simulação agora.
      </p>
    );
  }
  if (simulation.state === "reserve-incomplete") {
    return (
      <p className="text-sm text-muted-foreground">
        A distribuição ficou indisponível porque faltam dados para aplicar a
        prioridade atual da Reserva.
      </p>
    );
  }
  if (simulation.state === "portfolio-incomplete") {
    return (
      <p className="text-sm text-muted-foreground">
        A simulação depende de posições de Longo Prazo com valor e classificação
        completos. Atualize esses dados para ver a distribuição.
      </p>
    );
  }
  if (simulation.state === "reserve-priority") {
    return (
      <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-medium">Simulação pela prioridade da Reserva</p>
        <p className="text-muted-foreground">
          O cenário direcionaria{" "}
          {fromCents(simulation.reserveContributionCents ?? "0")} à Reserva.
          Essa hipótese não cria lançamentos nem executa aportes.
        </p>
      </div>
    );
  }
  if (simulation.state === "unallocated") {
    return (
      <p className="text-sm text-muted-foreground">
        A estratégia atual deixa{" "}
        {fromCents(simulation.unallocatedContributionCents)} sem alocação porque
        não há diferença para as metas de classe.
      </p>
    );
  }

  const hasReserveContribution =
    simulation.reserveContributionCents !== null &&
    BigInt(simulation.reserveContributionCents) > 0n;
  const allocations = simulation.allocations.filter(
    (allocation) => BigInt(allocation.contributionValueCents) > 0n,
  );

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div>
        <p className="font-medium">Simulação pela sua estratégia</p>
        <p className="text-xs text-muted-foreground">
          Cenário informativo; não cria lançamentos nem executa aportes.
        </p>
      </div>
      <dl className="space-y-2 text-sm">
        {hasReserveContribution && (
          <div className="flex justify-between gap-4">
            <dt>Reserva</dt>
            <dd className="font-medium tabular-nums">
              {fromCents(simulation.reserveContributionCents!)}
            </dd>
          </div>
        )}
        {allocations.map((allocation) => (
          <div key={allocation.label} className="flex justify-between gap-4">
            <dt>{allocation.label}</dt>
            <dd className="font-medium tabular-nums">
              {fromCents(allocation.contributionValueCents)}
            </dd>
          </div>
        ))}
        {BigInt(simulation.unallocatedContributionCents) > 0n && (
          <div className="flex justify-between gap-4 border-t pt-2">
            <dt>Sem alocação na estratégia atual</dt>
            <dd className="font-medium tabular-nums">
              {fromCents(simulation.unallocatedContributionCents)}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
