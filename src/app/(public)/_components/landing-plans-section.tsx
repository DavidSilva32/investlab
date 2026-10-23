import Link from "next/link";
import { ArrowRight, Check, Clock3, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

export function LandingPlansSection() {
  return (
    <section
      id="planos"
      aria-labelledby="landing-plans-heading"
      className="scroll-mt-20 bg-muted/30 py-16 sm:py-20"
    >
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-9 max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">
            Acesso
          </p>
          <h2
            id="landing-plans-heading"
            className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
          >
            Comece pelo período beta.
          </h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            O cadastro abre um teste de 30 dias. O plano pago ainda não pode ser
            contratado.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="relative overflow-hidden border-primary/30 shadow-lg shadow-primary/5">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1 bg-primary"
            />
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold leading-none tracking-tight">
                  Beta gratuito
                </h3>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  Disponível
                </span>
              </div>
              <CardDescription>
                Acesso completo por 30 dias após criar a conta.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight text-foreground">
                R$ 0
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sem cobrança e sem renovação automática.
              </p>
              <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-primary"
                  />
                  Explore a plataforma com sua conta.
                </li>
                <li className="flex items-start gap-2">
                  <Clock3
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-primary"
                  />
                  Após 30 dias, a conta fica somente para consulta.
                </li>
              </ul>
              <Button asChild className="mt-6 w-full">
                <Link href="/cadastro">
                  Criar conta beta gratuita <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-border/80 bg-card/70">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold leading-none tracking-tight">
                  Pro
                </h3>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  Em planejamento
                </span>
              </div>
              <CardDescription>
                Preço de referência para avaliar a oferta.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight text-foreground">
                R$ 19,90
                <span className="ml-1 text-base font-normal text-muted-foreground">
                  / mês*
                </span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                *Hipótese inicial, ainda sujeita a validação.
              </p>
              <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <LockKeyhole
                    aria-hidden="true"
                    className="size-4 text-primary"
                  />
                  Ainda sem contratação
                </p>
                <p className="mt-1">
                  Não há pagamento nem cobrança ativa. O preço e os recursos do
                  plano podem mudar antes do lançamento.
                </p>
              </div>
              <Button className="mt-6 w-full" disabled variant="outline">
                Indisponível no momento
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
