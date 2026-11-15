import Link from "next/link";
import { ArrowRight, Clock3, UserRoundCheck, UsersRound } from "lucide-react";
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

export function AdminOverview({
  stats,
  loading,
}: {
  stats: AdminStats | undefined;
  loading: boolean;
}) {
  const metrics = [
    {
      label: "Pessoas cadastradas",
      value: stats?.totalUsers,
      icon: UsersRound,
    },
    {
      label: "Contas ativas",
      value: stats?.activeUsers,
      icon: UserRoundCheck,
    },
    {
      label: "Convites aguardando",
      value: stats?.invitationsPending,
      icon: Clock3,
      hideWhenZero: true,
    },
  ];
  const attentionCount =
    (stats?.expiringTrials ?? 0) + (stats?.expiredTrials ?? 0);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Visão geral
        </h2>
        <p className="text-sm text-muted-foreground sm:text-base">
          Convites e acessos que podem precisar da sua atenção.
        </p>
      </header>

      <section
        aria-label="Resumo de pessoas e acessos"
        className="grid gap-3 sm:grid-cols-3"
      >
        {metrics
          .filter(
            ({ hideWhenZero, value }) =>
              !hideWhenZero || stats === undefined || (value ?? 0) > 0,
          )
          .map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="flex items-center justify-between gap-3 p-4 sm:p-5">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    {label}
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {stats === undefined ? "—" : (value ?? 0)}
                  </p>
                </div>
                <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
              </CardContent>
            </Card>
          ))}
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Acessos beta</CardTitle>
          <CardDescription>
            Consulta após o vencimento permanece disponível.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {stats === undefined ? (
            <p className="text-sm text-muted-foreground" role="status">
              {loading
                ? "Consultando acessos…"
                : "Os indicadores de acesso não estão disponíveis."}
            </p>
          ) : attentionCount > 0 ? (
            <p className="text-sm">
              {stats.expiringTrials > 0 && (
                <span>
                  {stats.expiringTrials}{" "}
                  {stats.expiringTrials === 1
                    ? "acesso vence"
                    : "acessos vencem"}{" "}
                  em 7 dias
                </span>
              )}
              {stats.expiringTrials > 0 && stats.expiredTrials > 0 && " · "}
              {stats.expiredTrials > 0 && (
                <span>
                  {stats.expiredTrials}{" "}
                  {stats.expiredTrials === 1
                    ? "acesso vencido"
                    : "acessos vencidos"}
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum acesso precisa de atenção agora.
            </p>
          )}
          <Link
            href="/admin/usuarios"
            className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Gerenciar pessoas e acessos
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
