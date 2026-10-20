import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  CircleDollarSign,
  ShieldCheck,
  Target,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const productSteps = [
  {
    number: "01",
    title: "Entenda sua situação",
    description:
      "Reúna posições, movimentações e valores conhecidos para enxergar o ponto de partida.",
    icon: WalletCards,
  },
  {
    number: "02",
    title: "Defina o que importa",
    description:
      "Organize objetivos e registre a estratégia que faz sentido para a sua realidade.",
    icon: Target,
  },
  {
    number: "03",
    title: "Decida com contexto",
    description:
      "Veja como a carteira está distribuída e entenda os dados que ajudam na próxima decisão.",
    icon: ChartNoAxesCombined,
  },
];

const sampleAllocation = [
  { label: "Renda fixa", share: "40%", color: "bg-asset-class-fixed-income" },
  {
    label: "Ações e BDRs",
    share: "30%",
    color: "bg-asset-class-brazilian-equities",
  },
  {
    label: "ETFs internacionais",
    share: "20%",
    color: "bg-asset-class-international-etfs",
  },
  { label: "Sem destino", share: "10%", color: "bg-destination-unassigned" },
];

export function LandingPage() {
  return (
    <main className="overflow-hidden">
      <section className="relative isolate border-b border-border bg-background">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-48 -z-10 size-[34rem] rounded-full bg-primary/15 blur-3xl motion-safe:animate-pulse"
        />
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-28">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-2 text-sm font-semibold text-primary">
              <CircleDollarSign aria-hidden="true" className="size-4" />
              Sua vida financeira, em perspectiva
            </p>
            <h1 className="mt-7 text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Mais clareza para cuidar do seu{" "}
              <span className="text-primary">patrimônio inteiro.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
              O InvestLab organiza sua carteira, seus objetivos e sua estratégia
              para ajudar você a entender onde está e escolher o próximo passo
              com mais contexto.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="min-h-12 shadow-lg shadow-primary/20"
              >
                <Link href="/demonstracao">
                  Conhecer a demonstração
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-12">
                <Link href="/entrar">
                  Acessar minha conta <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              O acesso à plataforma é disponibilizado por convite.
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
              Seus dados ficam na sua conta autenticada.
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-2xl motion-safe:transition-transform motion-safe:duration-500 motion-safe:hover:-translate-y-1">
            <div
              aria-hidden="true"
              className="absolute -inset-5 -z-10 rounded-[2rem] bg-primary/10 blur-2xl"
            />
            <Card
              aria-label="Prévia ilustrativa da carteira no InvestLab"
              className="overflow-hidden rounded-2xl border-border/80 bg-card shadow-2xl shadow-primary/10"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-7">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                    <WalletCards aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">
                      Visão da carteira
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Exemplo ilustrativo
                    </p>
                  </div>
                </div>
                <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  Dados fictícios
                </span>
              </div>
              <CardContent className="p-5 sm:p-7">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Valor conhecido
                    </p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                      R$ 84.250,00
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/60 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Em</span>{" "}
                    <span className="font-medium text-foreground">
                      4 categorias
                    </span>
                  </div>
                </div>
                <div className="mt-7">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-foreground">
                      Distribuição da carteira
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      Exemplo
                    </span>
                  </div>
                  <div
                    aria-label="Composição ilustrativa: renda fixa 40%, ações e BDRs 30%, ETFs internacionais 20%, sem destino 10%"
                    className="flex h-3 overflow-hidden rounded-full bg-muted"
                    role="img"
                  >
                    {sampleAllocation.map((item) => (
                      <span
                        key={item.label}
                        className={item.color}
                        style={{ width: item.share }}
                      />
                    ))}
                  </div>
                  <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                    {sampleAllocation.map((item) => (
                      <li
                        key={item.label}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span
                          className={
                            "size-2.5 shrink-0 rounded-full " + item.color
                          }
                        />
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {item.label}
                        </span>
                        <span className="font-medium tabular-nums text-foreground">
                          {item.share}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-background p-4">
                    <p className="text-sm text-muted-foreground">Objetivos</p>
                    <p className="mt-1 text-xl font-semibold text-foreground">
                      3 em acompanhamento
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-4">
                    <p className="text-sm text-muted-foreground">Estratégia</p>
                    <p className="mt-1 text-xl font-semibold text-foreground">
                      Visão do todo
                    </p>
                  </div>
                </div>
                <p className="mt-5 text-xs leading-5 text-muted-foreground">
                  Valores e percentuais fictícios para ilustrar a interface. Não
                  são recomendação nem previsão de resultado.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section aria-labelledby="landing-flow-heading" className="bg-muted/35">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">
              Do cenário à próxima ação
            </p>
            <h2
              id="landing-flow-heading"
              className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
            >
              Suas finanças fazem parte da mesma história.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Em vez de olhar cada investimento isolado, conecte o que você tem,
              o que deseja alcançar e como quer organizar seu patrimônio.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {productSteps.map(({ number, title, description, icon: Icon }) => (
              <Card
                key={number}
                className="group border-border/80 bg-card transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
              >
                <CardContent className="p-6 sm:p-7">
                  <div className="flex items-center justify-between">
                    <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <span className="font-mono text-sm text-muted-foreground/70">
                      {number}
                    </span>
                  </div>
                  <h3 className="mt-6 text-lg font-semibold text-foreground">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-background">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">
              Feito para a sua realidade
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Uma visão que respeita seus objetivos e suas escolhas.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              Organize posições, acompanhe objetivos e registre sua estratégia.
              O InvestLab ajuda a dar contexto ao que os dados mostram — sem
              transformar uma métrica isolada em decisão automática.
            </p>
            <Button
              asChild
              variant="link"
              className="mt-4 h-auto px-0 text-base"
            >
              <Link href="/demonstracao">
                Explore cada área na demonstração{" "}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                icon: WalletCards,
                title: "Carteira organizada",
                description:
                  "Posições, movimentações e instituições em um só lugar.",
              },
              {
                icon: Target,
                title: "Objetivos acompanhados",
                description:
                  "Veja seus destinos e acompanhe o que está construindo.",
              },
              {
                icon: ChartNoAxesCombined,
                title: "Estratégia no contexto",
                description:
                  "Compare sua organização atual com o plano que definiu.",
              },
              {
                icon: ShieldCheck,
                title: "Acesso por convite",
                description:
                  "Uma plataforma pessoal com os dados associados à sua conta.",
              },
            ].map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="flex gap-4 rounded-xl border border-border bg-card p-5"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <h3 className="font-semibold text-foreground">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-6 rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:flex-row sm:items-center sm:p-9">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-primary">
              Comece explorando
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Veja como a experiência funciona na prática.
            </h2>
            <p className="mt-2 leading-7 text-muted-foreground">
              Navegue por posições, objetivos e estratégia usando um cenário
              fictício, sem criar conta nem conectar seus dados.
            </p>
          </div>
          <Button asChild size="lg" className="min-h-12 shrink-0">
            <Link href="/demonstracao">
              Abrir demonstração <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
