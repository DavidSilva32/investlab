"use client";

import { ExternalLink, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DashboardFirstAccess({
  onImport,
  onCreateManual,
  readOnly = false,
  contextPending = false,
  contextError = false,
  onRetryContext = () => {},
}: {
  onImport: () => void;
  onCreateManual: () => void;
  readOnly?: boolean;
  contextPending?: boolean;
  contextError?: boolean;
  onRetryContext?: () => void;
}) {
  return (
    <section aria-labelledby="dashboard-first-access-title">
      <Card className="motion-content-reveal overflow-hidden shadow-sm">
        <CardHeader className="gap-2 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Primeiro passo
          </p>
          <CardTitle id="dashboard-first-access-title" className="text-xl">
            Sua carteira começa aqui
          </CardTitle>
          <CardDescription className="max-w-2xl text-sm leading-relaxed">
            Ainda não há investimentos cadastrados. Importe sua posição da B3 ou
            informe um investimento manualmente para começar a acompanhar sua
            carteira.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col items-start gap-4 rounded-xl border bg-card p-4 sm:p-5">
            <div className="space-y-1">
              <h3 className="font-semibold">Importar arquivo da B3</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Escolha o arquivo de posições da B3 e revise os dados antes de
                confirmar.
              </p>
              {!readOnly && (
                <Link
                  href="https://www.investidor.b3.com.br/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Acessar Área do Investidor da B3
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </Link>
              )}
            </div>
            {readOnly && !contextPending && !contextError ? (
              <p className="text-sm font-medium text-muted-foreground">
                Disponível para o titular da conta.
              </p>
            ) : !readOnly ? (
              <Button
                type="button"
                className="min-h-11 w-full justify-start gap-2 sm:w-auto"
                onClick={onImport}
              >
                <Upload aria-hidden="true" className="size-4" />
                Importar arquivo da B3
              </Button>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col items-start gap-4 rounded-xl border bg-card p-4 sm:p-5">
            <div className="space-y-1">
              <h3 className="font-semibold">Cadastrar investimento</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Informe os dados de uma posição para incluí-la na carteira.
              </p>
            </div>
            {readOnly && !contextPending && !contextError ? (
              <p className="text-sm font-medium text-muted-foreground">
                Disponível para o titular da conta.
              </p>
            ) : !readOnly ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full justify-start gap-2 sm:w-auto"
                onClick={onCreateManual}
              >
                <Plus aria-hidden="true" className="size-4" />
                Cadastrar manualmente
              </Button>
            ) : null}
          </div>
          {contextError ? (
            <div
              className="flex flex-wrap items-center justify-between gap-2 text-sm sm:col-span-2"
              role="alert"
            >
              <p className="text-muted-foreground">
                Não foi possível confirmar o estado de suporte. As ações
                permanecem bloqueadas até uma nova tentativa.
              </p>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                onClick={onRetryContext}
              >
                Tentar novamente
              </Button>
            </div>
          ) : contextPending ? (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Verificando o acesso a esta conta. As ações serão liberadas após a
              confirmação.
            </p>
          ) : readOnly ? (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              A visualização de suporte é somente leitura. Os cadastros devem
              ser feitos pelo titular da conta.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
