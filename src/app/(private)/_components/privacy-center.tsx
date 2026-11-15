"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ExternalLink,
  FileText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CookieConsentPreferencesButton } from "@/components/cookie-consent-preferences-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api-client";
import { CURRENT_TERMS_VERSION } from "@/lib/privacy-policy";

type TermsAcceptancesResponse = {
  currentTermsVersion: string | null;
  termsAcceptances: Array<{ termsVersion: string; acceptedAt: string }>;
};

function formatAcceptedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

export function PrivacyCenter() {
  const acceptancesQuery = useQuery({
    queryKey: ["privacy", "terms-acceptances"],
    queryFn: () =>
      apiRequest<TermsAcceptancesResponse>(
        "/api/privacy/terms-acceptances",
        undefined,
        "Não foi possível carregar o histórico de aceite.",
      ),
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
          <ShieldCheck aria-hidden="true" className="size-4" />
          Sua conta
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Privacidade e dados
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Acesse os documentos do InvestLab e consulte o histórico de aceite da
          sua conta.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText aria-hidden="true" className="size-5 text-primary" />
              Documentos
            </CardTitle>
            <CardDescription>
              A versão vigente dos Termos é {CURRENT_TERMS_VERSION}. As
              políticas de Privacidade e Cookies mostram seu status em cada
              página.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <nav
              aria-label="Documentos de privacidade"
              className="flex flex-wrap gap-2"
            >
              <Button asChild variant="outline">
                <Link href="/termos-de-uso">Termos de Uso</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/privacidade">Política de Privacidade</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/cookies">Política de Cookies</Link>
              </Button>
            </nav>
            <p className="text-sm leading-6 text-muted-foreground">
              Até agora, não foram identificados cookies opcionais em uso. Você
              pode rever sua escolha por esta opção, quando quiser.
            </p>
            <CookieConsentPreferencesButton />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Histórico de aceite</CardTitle>
            <CardDescription>
              Registro associado à sua conta, sem alterar aceites anteriores.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {acceptancesQuery.data?.currentTermsVersion && (
              <p className="mb-4 text-sm text-muted-foreground">
                Versão vigente: {acceptancesQuery.data.currentTermsVersion}
              </p>
            )}
            {acceptancesQuery.isPending ? (
              <div
                aria-label="Carregando histórico de aceite"
                className="space-y-3"
              >
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : acceptancesQuery.isError ? (
              <div className="space-y-3" role="alert">
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle aria-hidden="true" className="size-4" />
                  {acceptancesQuery.error instanceof Error
                    ? acceptancesQuery.error.message
                    : "Não foi possível carregar o histórico de aceite."}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void acceptancesQuery.refetch()}
                >
                  <RefreshCw aria-hidden="true" />
                  Tentar novamente
                </Button>
              </div>
            ) : acceptancesQuery.data.termsAcceptances.length === 0 ? (
              <p className="text-sm leading-6 text-muted-foreground">
                Não há aceite registrado nesta conta. Para contas criadas antes
                deste registro, o histórico não é presumido nem preenchido
                retroativamente.
              </p>
            ) : (
              <ol className="space-y-4">
                {acceptancesQuery.data.termsAcceptances.map((acceptance) => (
                  <li
                    key={`${acceptance.termsVersion}-${acceptance.acceptedAt}`}
                    className="rounded-lg border border-border p-4"
                  >
                    <p className="font-medium text-foreground">
                      Termos de Uso · versão {acceptance.termsVersion}
                    </p>
                    <time
                      className="mt-1 block text-sm text-muted-foreground"
                      dateTime={acceptance.acceptedAt}
                    >
                      Aceitos em {formatAcceptedAt(acceptance.acceptedAt)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Solicitações e direitos</CardTitle>
            <CardDescription>
              O InvestLab ainda não registra solicitações por esta página.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p>
              Para pedir acesso ou correção de dados, ou encaminhar um pedido de
              exportação ou exclusão, fale com o administrador que enviou seu
              convite. Esta página não envia nem acompanha esses pedidos.
            </p>
            <div>
              <p className="font-medium text-foreground">
                Não envie senha, token nem extrato financeiro ao pedir ajuda.
              </p>
            </div>
            <Link
              href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Conheça os direitos dos titulares na ANPD
              <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
