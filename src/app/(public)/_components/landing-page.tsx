import Link from "next/link";
import {
  ArrowRight,
  ChartNoAxesCombined,
  CircleHelp,
  GraduationCap,
  ShieldCheck,
  Target,
  WalletCards,
} from "lucide-react";
import { LandingHeroSection } from "@/app/(public)/_components/landing-hero-section";
import { LandingLearningSection } from "@/app/(public)/_components/landing-learning-section";
import { LandingProductPreview } from "@/app/(public)/_components/landing-product-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const benefits = [
  {
    icon: WalletCards,
    title: "Veja o que você tem",
    description:
      "Reúna posições, valores conhecidos e instituições em uma visão de carteira.",
  },
  {
    icon: Target,
    title: "Acompanhe o que importa",
    description:
      "Organize sua reserva e seus objetivos pessoais em um só lugar.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Entenda o contexto",
    description:
      "Compare a estratégia que você definiu com a distribuição conhecida da carteira.",
  },
  {
    icon: GraduationCap,
    title: "Aprenda no seu ritmo",
    description:
      "Acesse vídeos sobre classes de investimento dentro da plataforma.",
  },
];

export function LandingPage() {
  return (
    <main id="inicio" className="overflow-hidden">
      <LandingHeroSection />
      <section
        id="produto"
        aria-labelledby="landing-product-heading"
        className="scroll-mt-20 bg-muted/30 py-16 sm:py-20"
      >
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-9 max-w-3xl text-center sm:mb-11">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">
              Veja por dentro
            </p>
            <h2
              id="landing-product-heading"
              className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
            >
              Explore as partes do produto.
            </h2>
            <p className="mt-3 text-base leading-7 text-muted-foreground sm:text-lg">
              Alterne entre posições, objetivos e estratégia. Os nomes e valores
              são fictícios.
            </p>
          </div>
          <LandingProductPreview />
          <div className="mt-7 text-center">
            <Button asChild size="lg" className="group min-h-12">
              <Link href="/demonstracao">
                Abrir a demonstração interativa
                <ArrowRight
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section
        id="beneficios"
        aria-labelledby="landing-benefits-heading"
        className="scroll-mt-20 py-16 sm:py-20"
      >
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-9 max-w-3xl text-center sm:mb-11">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">
              O que muda no dia a dia
            </p>
            <h2
              id="landing-benefits-heading"
              className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
            >
              Mais contexto para cuidar do seu dinheiro com calma.
            </h2>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              Conecte informações que ajudam você a entender sua situação, sem
              transformar uma métrica isolada em decisão automática.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map(({ icon: Icon, title, description }, index) => (
              <Card
                key={title}
                className="group border-border/80 transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
              >
                <CardContent className="p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <span
                      aria-hidden="true"
                      className="font-mono text-sm text-muted-foreground/70"
                    >
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 font-semibold text-foreground">
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

      <LandingLearningSection />
      <section
        aria-labelledby="landing-start-heading"
        className="bg-muted/30 py-16 sm:py-20"
      >
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-9 max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">
              Comece sem complicação
            </p>
            <h2
              id="landing-start-heading"
              className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
            >
              Conheça antes de conectar seus dados.
            </h2>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              A demonstração pública não exige conta e não consulta uma carteira
              real.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                number: "1",
                title: "Explore um exemplo",
                description: "Alterne entre posições, objetivos e estratégia.",
              },
              {
                number: "2",
                title: "Veja se faz sentido",
                description:
                  "Conheça o que a plataforma organiza e como apresenta os dados disponíveis.",
              },
              {
                number: "3",
                title: "Acesse com convite",
                description:
                  "O acesso a uma conta pessoal continua sendo disponibilizado por convite.",
              },
            ].map((step) => (
              <Card key={step.number} className="border-border/80 bg-card">
                <CardContent className="flex gap-4 p-5 sm:p-6">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {step.number}
                  </span>
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-7 grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3 sm:p-6">
            {[
              ["Sem conta", "A demonstração é pública"],
              ["Dados fictícios", "Nenhuma carteira real é consultada"],
              ["Você decide", "Explore sem receber recomendação"],
            ].map(([title, description]) => (
              <div key={title} className="flex items-start gap-3">
                <ShieldCheck
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-primary"
                />
                <p className="text-sm">
                  <span className="font-semibold text-foreground">{title}</span>
                  <span className="block text-muted-foreground">
                    {description}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="landing-faq-heading" className="py-16 sm:py-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-primary">
              <CircleHelp aria-hidden="true" className="size-4" />
              Perguntas frequentes
            </p>
            <h2
              id="landing-faq-heading"
              className="mt-3 text-3xl font-semibold tracking-tight text-foreground"
            >
              Antes de explorar
            </h2>
          </div>
          <div className="grid gap-3">
            {[
              [
                "A demonstração usa dados da minha conta?",
                "Não. Ela usa um cenário fictício e não consulta nem altera uma carteira real.",
              ],
              [
                "Como consigo acesso pessoal?",
                "No momento, o acesso a uma conta pessoal é disponibilizado por convite.",
              ],
              [
                "O InvestLab escolhe investimentos por mim?",
                "Não. Você registra sua estratégia; o InvestLab organiza as informações disponíveis para ajudar a entendê-las. As decisões continuam suas.",
              ],
            ].map(([question, answer]) => (
              <Card key={question} className="border-border/80">
                <CardContent className="p-5 sm:p-6">
                  <h3 className="font-semibold text-foreground">{question}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {answer}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-6 rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:flex-row sm:items-center sm:p-9">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-primary">
              Dê uma olhada por dentro
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Seu próximo passo pode ser só conhecer.
            </h2>
            <p className="mt-2 leading-7 text-muted-foreground">
              Explore a demonstração com dados fictícios, sem criar conta nem
              conectar seus dados.
            </p>
          </div>
          <Button asChild size="lg" className="group min-h-12 shrink-0">
            <Link href="/demonstracao">
              Explorar a demonstração{" "}
              <ArrowRight
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
