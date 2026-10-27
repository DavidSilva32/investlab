"use client";

import Image from "next/image";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Building2, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/lib/use-reduced-motion";

type PropertyExample = {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
};

export function FiiPropertyExplorer({
  examples,
}: {
  examples: PropertyExample[];
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  const selected = examples[selectedIndex];

  if (!selected) return null;

  return (
    <section
      aria-label="Exemplos de imóveis de fundos imobiliários"
      className="rounded-2xl border border-border/60 bg-card p-3 sm:p-5"
    >
      <div className="flex items-center gap-2">
        <Building2
          aria-hidden="true"
          className="size-4 text-asset-class-fiis"
        />
        <h4 className="text-sm font-semibold">Explore exemplos de imóveis</h4>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Escolha um tipo para ver como ele pode fazer parte de um FII.
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(15rem,0.8fr)]">
        <article
          id="fii-property-example"
          aria-live="polite"
          aria-atomic="true"
          className="min-w-0 overflow-hidden rounded-xl border border-border/60 bg-background"
        >
          <div className="relative aspect-[16/10] overflow-hidden bg-muted">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={selected.imageSrc}
                className="absolute inset-0"
                initial={reducedMotion ? false : { opacity: 0, scale: 1.03 }}
                animate={
                  reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }
                }
                exit={reducedMotion ? undefined : { opacity: 0, scale: 0.99 }}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { duration: 0.24, ease: "easeOut" }
                }
              >
                <Image
                  src={selected.imageSrc}
                  alt={selected.imageAlt}
                  fill
                  sizes="(max-width: 640px) 100vw, 60vw"
                  className="object-cover"
                />
              </motion.div>
            </AnimatePresence>
            <span className="absolute bottom-2 left-2 z-10 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm">
              Exemplo ilustrativo
            </span>
          </div>
          <div className="p-3 sm:p-4">
            <h5 className="font-semibold">{selected.title}</h5>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {selected.description}
            </p>
          </div>
        </article>

        <div className="space-y-3">
          <div
            role="group"
            aria-label="Escolha um exemplo de imóvel"
            className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:content-start"
          >
            {examples.map((example, index) => {
              const isSelected = index === selectedIndex;

              return (
                <Button
                  key={example.title}
                  type="button"
                  variant="outline"
                  aria-pressed={isSelected}
                  aria-controls="fii-property-example"
                  onClick={() => setSelectedIndex(index)}
                  className={`h-auto min-w-0 flex-col items-stretch gap-1 overflow-hidden whitespace-normal p-1 text-left transition-colors lg:flex-row lg:items-center lg:gap-3 lg:p-2 ${
                    isSelected
                      ? "border-asset-class-fiis/50 bg-asset-class-fiis/10"
                      : "bg-background hover:border-asset-class-fiis/40 hover:bg-asset-class-fiis/5"
                  }`}
                >
                  <span className="relative block aspect-[16/9] w-full overflow-hidden rounded-md bg-muted lg:size-14 lg:shrink-0 lg:aspect-square">
                    <Image
                      src={example.imageSrc}
                      alt=""
                      fill
                      sizes="(max-width: 1024px) 30vw, 56px"
                      className="object-cover"
                    />
                  </span>
                  <span className="line-clamp-2 px-1 py-0.5 text-[11px] leading-4 lg:px-0 lg:text-sm">
                    {example.title}
                  </span>
                </Button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="Exemplo ilustrativo de composição de um fundo"
            className="rounded-xl border border-asset-class-fiis/20 bg-asset-class-fiis/5 p-3"
          >
            <p className="text-xs font-semibold">Como isso entra no fundo</p>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={selected.imageSrc}
                  data-testid="fii-property-animation"
                  className="flex min-w-0 items-center gap-2"
                  initial={
                    reducedMotion ? false : { opacity: 0, x: -22, scale: 0.86 }
                  }
                  animate={
                    reducedMotion
                      ? { opacity: 1 }
                      : { opacity: 1, x: 0, scale: 1 }
                  }
                  exit={
                    reducedMotion
                      ? undefined
                      : { opacity: 0, x: 16, scale: 0.92 }
                  }
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 360, damping: 28 }
                  }
                >
                  <span className="relative size-9 shrink-0 overflow-hidden rounded-md bg-muted">
                    <Image
                      src={selected.imageSrc}
                      alt=""
                      fill
                      sizes="36px"
                      className="object-cover"
                    />
                  </span>
                  <span className="min-w-0 text-xs font-medium leading-4">
                    {selected.title}
                  </span>
                </motion.div>
              </AnimatePresence>
              <ArrowRight
                aria-hidden="true"
                className="size-4 text-asset-class-fiis"
              />
              <span className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-background px-2 text-xs font-semibold text-asset-class-fiis">
                <Layers3 aria-hidden="true" className="size-5" />
                FII
              </span>
            </div>
            <p className="mt-2 text-xs leading-4 text-muted-foreground">
              Um FII pode reunir ativos como este, conforme a estratégia do
              fundo.
            </p>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        A imagem não representa a carteira de um fundo específico. A estratégia
        e os ativos variam conforme as regras de cada FII.
      </p>
    </section>
  );
}
