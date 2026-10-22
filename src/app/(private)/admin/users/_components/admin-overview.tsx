import {
  ArrowRight,
  Clock3,
  ShieldCheck,
  UserRoundCheck,
  UserRoundX,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type AdminStats = {
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;
  disabledUsers: number;
  expiringTrials: number;
  expiredTrials: number;
  invitationsPending: number;
};
export function AdminOverview({ stats }: { stats: AdminStats | undefined }) {
  const metrics = [
    {
      label: "Contas cadastradas",
      value: stats?.totalUsers,
      icon: UsersRound,
      detail: "Pessoas com conta no InvestLab",
      tone: "text-primary bg-primary/10",
    },
    {
      label: "Contas ativas",
      value: stats?.activeUsers,
      icon: UserRoundCheck,
      detail: "Acesso habilitado",
      tone: "text-status-success bg-status-success/10",
    },
    {
      label: "Convites aguardando",
      value: stats?.invitationsPending,
      icon: UserRoundPlus,
      detail: "Ainda não usados",
      tone: "text-status-warning bg-status-warning/10",
    },
    {
      label: "Acesso beta vencido",
      value: stats?.expiredTrials,
      icon: Clock3,
      detail: "Consulta permanece disponível",
      tone: "text-muted-foreground bg-muted",
    },
  ];
  const accountedUsers = stats
    ? stats.activeUsers + stats.pendingUsers + stats.disabledUsers
    : 0;
  const accessStates = [
    {
      label: "Ativas",
      value: stats?.activeUsers,
      icon: UserRoundCheck,
      tone: "bg-status-success",
    },
    {
      label: "Aguardando ativação",
      value: stats?.pendingUsers,
      icon: Clock3,
      tone: "bg-status-warning",
    },
    {
      label: "Desativadas",
      value: stats?.disabledUsers,
      icon: UserRoundX,
      tone: "bg-muted-foreground/50",
    },
  ];

  return (
    <div className="space-y-5">
      <Card className="relative isolate overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 -top-20 -z-10 size-64 rounded-full bg-primary/10 blur-3xl"
        />
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="max-w-2xl space-y-2">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <ShieldCheck aria-hidden="true" className="size-4" />
              Administração do beta
            </p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Central de operação
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Acompanhe os acessos, convide participantes e cuide das contas em
              um só lugar.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 rounded-xl border bg-background/80 p-4 sm:w-auto sm:min-w-56">
            <p className="text-xs font-medium text-muted-foreground">
              JORNADA DO PARTICIPANTE
            </p>
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="rounded-md bg-primary/10 px-2 py-1 text-primary">
                Convite
              </span>
              <ArrowRight
                aria-hidden="true"
                className="size-3.5 text-muted-foreground"
              />
              <span className="rounded-md bg-status-success/10 px-2 py-1 text-status-success">
                Teste
              </span>
              <ArrowRight
                aria-hidden="true"
                className="size-3.5 text-muted-foreground"
              />
              <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
                Leitura
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Convite · 30 dias de acesso completo · consulta após o vencimento
            </p>
          </div>
        </CardContent>
      </Card>

      <section
        aria-label="Indicadores de acesso"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {metrics.map(({ label, value, icon: Icon, detail, tone }) => (
          <Card
            key={label}
            className="overflow-hidden transition-shadow hover:shadow-md"
          >
            <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  {label}
                </p>
                <p className="text-3xl font-semibold tabular-nums tracking-tight">
                  {stats === undefined ? "—" : (value ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground">{detail}</p>
              </div>
              <span className={`rounded-xl p-2.5 ${tone}`}>
                <Icon aria-hidden="true" className="size-5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Estado das contas</CardTitle>
            <CardDescription>
              Situação atual das contas cadastradas. O acesso beta é mostrado à
              parte do papel de usuário.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {accessStates.map(({ label, value, icon: Icon, tone }) => {
              const width =
                !stats || accountedUsers === 0
                  ? 0
                  : ((value ?? 0) / accountedUsers) * 100;
              return (
                <div key={label} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <Icon
                        aria-hidden="true"
                        className="size-4 text-muted-foreground"
                      />
                      {label}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {stats === undefined ? "—" : (value ?? 0)}
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={
                      stats === undefined
                        ? `${label}: dados indisponíveis`
                        : `${label}: ${value ?? 0} de ${accountedUsers} contas`
                    }
                  >
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${tone}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-status-warning/30 bg-status-warning/5">
          <CardHeader>
            <CardTitle>Requer atenção</CardTitle>
            <CardDescription>
              Contas beta próximas do vencimento ou já em modo de consulta.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-background p-4">
              <p className="text-sm text-muted-foreground">Vencem em 7 dias</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {stats === undefined ? "—" : stats.expiringTrials}
              </p>
            </div>
            <div className="rounded-xl border bg-background p-4">
              <p className="text-sm text-muted-foreground">Acesso vencido</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {stats === undefined ? "—" : stats.expiredTrials}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Gerenciar pessoas e acessos</p>
          <p className="text-sm text-muted-foreground">
            Convites, edição de conta, extensão do beta e outras ações.
          </p>
        </div>
        <p className="inline-flex items-center gap-2 text-sm font-medium text-primary">
          Use a aba <span className="font-semibold">Pessoas e acessos</span>
          <ArrowRight aria-hidden="true" className="size-4" />
        </p>
      </div>
    </div>
  );
}
