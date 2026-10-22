"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AssetClassLearningQuiz } from "./asset-class-learning-quiz";
import type { AssetClassLearningContent } from "@/lib/asset-class-learning";
import {
  strategyAssetClassById,
  type StrategyAssetClassId,
} from "@/lib/strategy-allocation";

type AssetClassLearningCourseProps = {
  selectedClass: StrategyAssetClassId;
  content: AssetClassLearningContent;
};

export function AssetClassLearningCourse({
  selectedClass,
  content,
}: AssetClassLearningCourseProps) {
  const assetClass = strategyAssetClassById[selectedClass];
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState(false);
  const totalSteps = content.courseLessons.length + 1;
  const isQuiz = step === content.courseLessons.length;
  const lesson = content.courseLessons[step];
  const progress =
    (isQuiz && !completed ? step : step + 1) * (100 / totalSteps);

  function goToStep(nextStep: number) {
    setStep(Math.max(0, Math.min(nextStep, totalSteps - 1)));
  }

  return (
    <section
      aria-label={`Mini-curso: ${assetClass.label}`}
      className="overflow-hidden rounded-xl border border-border/70 bg-card"
    >
      <div className="space-y-3 border-b border-border/70 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">Mini-curso</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {step + 1} de {totalSteps}
          </p>
        </div>
        <Progress
          value={progress}
          aria-label="Progresso do mini-curso"
          className="h-1.5"
        />
        <nav
          aria-label="Etapas do curso"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {[...content.courseLessons.map((item) => item.title), "Pergunta"].map(
            (label, index) => {
              const isCurrent = step === index;
              const isReached = index <= step;
              const shortLabel =
                index === content.courseLessons.length
                  ? "Quiz"
                  : `Aula ${index + 1}`;

              return (
                <Button
                  key={label}
                  type="button"
                  variant={isCurrent ? "secondary" : "ghost"}
                  size="sm"
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={`Etapa ${index + 1}: ${label}`}
                  disabled={!isReached}
                  onClick={() => goToStep(index)}
                  className="min-h-10 justify-start gap-2 overflow-hidden px-2 text-xs"
                >
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] ${
                      index < step
                        ? "bg-primary text-primary-foreground"
                        : isCurrent
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {index < step ? (
                      <Check aria-hidden="true" className="size-3" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span>{shortLabel}</span>
                </Button>
              );
            },
          )}
        </nav>
      </div>

      <div className="p-4 sm:p-6">
        {!isQuiz && lesson ? (
          <article
            key={step}
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:duration-300"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Aula {step + 1}
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              {lesson.title}
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
              {lesson.content}
            </p>

            {step === 0 && content.availability === "available" && (
              <div className="mt-5 overflow-hidden rounded-xl border border-border/70 bg-black">
                <video
                  key={content.videoSrc}
                  className="aspect-video w-full"
                  controls
                  playsInline
                  preload="none"
                  poster={content.thumbnailSrc}
                  aria-label={`Vídeo educativo: ${assetClass.label}`}
                >
                  <source src={content.videoSrc} type="video/mp4" />
                  Seu navegador não oferece suporte à reprodução de vídeo.
                </video>
              </div>
            )}

            {step === 0 && content.availability === "coming-soon" && (
              <p
                role="status"
                className="mt-5 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"
              >
                Vídeo em breve
              </p>
            )}
          </article>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Confira o que aprendeu
              </p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                Uma pergunta rápida
              </h3>
            </div>
            {completed && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-3 rounded-xl border border-status-success/40 bg-status-success/10 p-4 motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-300"
              >
                <PartyPopper
                  aria-hidden="true"
                  className="size-5 shrink-0 text-status-success motion-safe:animate-bounce motion-reduce:animate-none"
                />
                <div>
                  <p className="font-semibold">Boa! Curso concluído.</p>
                  <p className="text-sm text-muted-foreground">
                    Você pode rever as aulas quando quiser.
                  </p>
                </div>
              </div>
            )}
            <AssetClassLearningQuiz
              question={content.quiz.question}
              options={content.quiz.options}
              correctOptionIndex={content.quiz.correctOptionIndex}
              onCorrect={() => setCompleted(true)}
            />
          </div>
        )}

        {!isQuiz && (
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 0}
              onClick={() => goToStep(step - 1)}
              className="min-h-11"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Voltar
            </Button>
            <Button
              type="button"
              onClick={() => goToStep(step + 1)}
              className="min-h-11"
            >
              {step === content.courseLessons.length - 1
                ? "Ir para a pergunta"
                : "Próxima aula"}
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
