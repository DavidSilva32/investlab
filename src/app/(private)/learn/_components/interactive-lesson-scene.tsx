"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import type { StrategyAssetClassId } from "@/lib/strategy-allocation";

type SceneStep = { label: string; detail: string; icon: LucideIcon };

const visualClassName: Record<StrategyAssetClassId, string> = {
  fiis: "text-asset-class-fiis",
  fixed_income: "text-asset-class-fixed-income",
  brazilian_equities: "text-asset-class-brazilian-equities",
  international_etfs: "text-asset-class-international-etfs",
};

const visualSoftClassName: Record<StrategyAssetClassId, string> = {
  fiis: "bg-asset-class-fiis/10",
  fixed_income: "bg-asset-class-fixed-income/10",
  brazilian_equities: "bg-asset-class-brazilian-equities/10",
  international_etfs: "bg-asset-class-international-etfs/10",
};

export function InteractiveLessonScene({
  assetClass,
  title,
  steps,
}: {
  assetClass: StrategyAssetClassId;
  title: string;
  steps: SceneStep[];
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  const selected = steps[selectedIndex];
  const accent = visualClassName[assetClass];
  const accentSoft = visualSoftClassName[assetClass];

  if (!selected) return null;

  return (
    <section
      aria-label={title}
      className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-muted/50 via-card to-card p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-foreground sm:text-base">
          {title}
        </h4>
        <span className="shrink-0 rounded-full bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground">
          Toque para explorar
        </span>
      </div>

      <div
        role="group"
        aria-label="Etapas para explorar este conceito"
        className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-1 sm:gap-3"
      >
        {steps.map(({ label, icon: Icon }, index) => {
          const active = index === selectedIndex;
          return (
            <div key={label} className="contents">
              <Button
                type="button"
                variant="outline"
                aria-pressed={active}
                aria-controls="lesson-scene-explanation"
                onClick={() => setSelectedIndex(index)}
                className={`h-auto min-w-0 flex-col justify-start gap-1 whitespace-normal rounded-xl px-1.5 py-2 text-center transition-colors sm:gap-2 sm:px-3 sm:py-3 ${
                  active
                    ? `${accent} ${accentSoft} border-current/30`
                    : "bg-background/70 hover:bg-muted"
                }`}
              >
                <span
                  className={`grid size-9 place-items-center rounded-lg sm:size-11 ${
                    active ? "bg-background/80" : accentSoft
                  } ${accent}`}
                >
                  <Icon aria-hidden="true" className="size-5 sm:size-6" />
                </span>
                <span className="line-clamp-2 text-[11px] font-semibold leading-4 sm:text-sm">
                  {label}
                </span>
              </Button>
              {index < steps.length - 1 && (
                <ArrowRight
                  aria-hidden="true"
                  className={`my-auto size-3 ${accent} sm:size-5`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div
        id="lesson-scene-explanation"
        aria-live="polite"
        aria-atomic="true"
        className={`mt-3 flex min-h-16 items-center gap-3 rounded-xl border border-border/50 bg-background/80 p-3 sm:p-4 ${accent}`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selected.label}
            data-testid="interactive-lesson-step"
            className="flex min-w-0 items-center gap-3"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -4 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.18 }}
          >
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-lg ${accentSoft}`}
            >
              <selected.icon aria-hidden="true" className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                {selected.label}
              </span>
              <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">
                {selected.detail}
              </span>
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Cena ilustrativa; não apresenta dados de um ativo específico.
      </p>
    </section>
  );
}
