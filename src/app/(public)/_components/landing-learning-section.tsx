import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const learningTopics = [
  {
    name: "Renda fixa",
    image: "/images/asset-classes/fixed-income-office.webp",
  },
  {
    name: "Ações e BDRs",
    image: "/images/asset-classes/brazilian-equities.webp",
  },
  {
    name: "ETFs internacionais",
    image: "/images/asset-classes/international-etfs.webp",
  },
  {
    name: "Fundos imobiliários (FIIs)",
    image: "/images/asset-classes/fiis.webp",
  },
];

export function LandingLearningSection() {
  return (
    <section
      id="aprender"
      aria-labelledby="landing-learning-heading"
      className="scroll-mt-20 bg-slate-950 py-16 text-white sm:py-20"
    >
      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14 lg:px-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-300">
            Também para quem está começando
          </p>
          <h2
            id="landing-learning-heading"
            className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Você não precisa virar especialista para dar o primeiro passo.
          </h2>
          <p className="mt-4 leading-7 text-slate-300">
            Organize o que já tem e conheça diferentes classes de investimento
            no seu ritmo. Há vídeos dentro da plataforma para apoiar seu
            aprendizado.
          </p>
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-300">
            <ShieldCheck aria-hidden="true" className="size-4 text-blue-300" />
            Acesso pessoal disponibilizado por convite.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {learningTopics.map(({ name, image }) => (
            <Card
              key={name}
              className="group relative min-h-32 overflow-hidden border-white/20 bg-slate-900 sm:min-h-40"
            >
              <Image
                src={image}
                alt=""
                fill
                sizes="(max-width: 640px) 45vw, 25vw"
                className="object-cover opacity-55 transition duration-500 group-hover:scale-105 group-hover:opacity-70"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"
              />
              <CardContent className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                <h3 className="text-sm font-semibold text-white sm:text-base">
                  {name}
                </h3>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
