"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpenCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  PartyPopper,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiRequest, ApiError } from "@/lib/api-client";
import {
  learningAssessmentPassScore,
  type AssetClassLearningContent,
} from "@/lib/asset-class-learning";
import {
  strategyAssetClassById,
  type StrategyAssetClassId,
} from "@/lib/strategy-allocation";
import { AssetClassLearningAssessment } from "./asset-class-learning-assessment";
import { AssetClassLearningQuiz } from "./asset-class-learning-quiz";
import { AssetClassLearningLesson } from "./asset-class-learning-lesson";

type CourseProgress = {
  courseId: string;
  courseVersion: number;
  completedLessonIds: string[];
  lastLessonId: string | null;
  latestScore: number | null;
  bestScore: number | null;
  quizAttemptCount: number;
  passed: boolean;
  passedAt: string | null;
  updatedAt: string;
};

type CourseProgressResponse = { courses: CourseProgress[] };
type SaveProgressResponse = {
  progress: CourseProgress;
  assessment: { score: number; passed: boolean } | null;
};

type CourseCheckpoint = {
  courseId: StrategyAssetClassId;
  completedLessonIds?: string[];
  lastLessonId?: string;
  assessment?: { attemptId: string; answers: number[] };
};

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
  const [answeredLessons, setAnsweredLessons] = useState<boolean[]>([]);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingProgress, setSavingProgress] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingCheckpoint, setPendingCheckpoint] =
    useState<CourseCheckpoint | null>(null);
  const totalSteps = content.courseLessons.length + 1;
  const examStep = content.courseLessons.length;
  const isExam = step === examStep;
  const lesson = content.courseLessons[step];
  const isLastLesson = step === content.courseLessons.length - 1;
  const progressPercent = Math.round((step / totalSteps) * 100);
  const completedLessonIds = progress?.completedLessonIds ?? [];

  const loadProgress = useCallback(async () => {
    setLoadingProgress(true);
    setLoadError(null);
    try {
      const response = await apiRequest<CourseProgressResponse>(
        "/api/learning/progress",
        undefined,
        "Não foi possível carregar seu progresso.",
      );
      const saved =
        response.courses.find((course) => course.courseId === selectedClass) ??
        null;
      setProgress(saved);
      const lastLessonNumber = Number(
        saved?.lastLessonId?.match(/^lesson-(\d+)$/)?.[1] ?? 0,
      );
      const lastLessonComplete = saved?.completedLessonIds.includes(
        `lesson-${lastLessonNumber}`,
      );
      setStep(
        saved?.passed || saved?.latestScore != null
          ? examStep
          : Math.min(
              Math.max(lastLessonNumber + (lastLessonComplete ? 1 : 0) - 1, 0),
              examStep,
            ),
      );
      setAnsweredLessons(
        content.courseLessons.map(
          (_, index) =>
            saved?.completedLessonIds.includes(`lesson-${index + 1}`) ?? false,
        ),
      );
    } catch (error) {
      setLoadError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível carregar seu progresso.",
      );
    } finally {
      setLoadingProgress(false);
    }
  }, [content.courseLessons, examStep, selectedClass]);

  useEffect(() => {
    // The progress response determines the initial lesson and medal state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProgress();
  }, [loadProgress]);

  async function saveCheckpoint(checkpoint: CourseCheckpoint) {
    setSavingProgress(true);
    setPendingCheckpoint(checkpoint);
    try {
      const response = await apiRequest<SaveProgressResponse>(
        "/api/learning/progress",
        { method: "PUT", body: JSON.stringify(checkpoint) },
        "Não foi possível salvar seu progresso.",
      );
      setSaveError(null);
      setProgress(response.progress);
      setAnsweredLessons(
        content.courseLessons.map((_, index) =>
          response.progress.completedLessonIds.includes(`lesson-${index + 1}`),
        ),
      );
      setPendingCheckpoint(null);
      return response;
    } catch (error) {
      setSaveError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível salvar seu progresso.",
      );
      throw error;
    } finally {
      setSavingProgress(false);
    }
  }

  function handleLessonAnswered(lessonIndex: number, correct: boolean | null) {
    if (correct !== true) return;
    const lessonId = `lesson-${lessonIndex + 1}`;
    const nextCompleted = [...new Set([...completedLessonIds, lessonId])];
    void saveCheckpoint({
      courseId: selectedClass,
      completedLessonIds: nextCompleted,
      lastLessonId: lessonId,
    }).catch(() => undefined);
  }

  function goToStep(nextStep: number) {
    setStep(Math.max(0, Math.min(nextStep, totalSteps - 1)));
  }

  const canGoForward =
    !savingProgress &&
    (answeredLessons[step] ||
      completedLessonIds.includes(`lesson-${step + 1}`));

  if (loadingProgress || loadError) {
    return (
      <section
        aria-label={`Mini-curso: ${assetClass.label}`}
        className="rounded-xl border border-border/70 bg-card p-5"
      >
        {loadingProgress ? (
          <p role="status" className="text-sm text-muted-foreground">
            Recuperando seu progresso…
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadProgress()}
            >
              Tentar novamente
            </Button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label={`Mini-curso: ${assetClass.label}`}
      className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm"
    >
      <div className="relative overflow-hidden border-b border-border/70 bg-gradient-to-br from-primary/10 via-card to-card px-4 py-5 sm:px-7 sm:py-6">
        <div
          aria-hidden="true"
          className="absolute -right-12 -top-20 size-56 rounded-full bg-primary/5 blur-3xl"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <BookOpenCheck aria-hidden="true" className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Mini-curso
              </p>
              <h2 className="mt-1 truncate text-lg font-bold tracking-tight sm:text-xl">
                {assetClass.label}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Aulas curtas, exemplos visuais e uma prova final
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-2 text-sm">
            <Sparkles aria-hidden="true" className="size-4 text-primary" />
            <span className="font-semibold tabular-nums">{step + 1}</span>
            <span className="text-muted-foreground">de {totalSteps}</span>
          </div>
        </div>
        <div className="relative mt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Seu progresso</span>
            <span className="tabular-nums">{progressPercent}%</span>
          </div>
          <Progress
            value={progressPercent}
            aria-label="Progresso do mini-curso"
            className="h-2"
          />
        </div>
        <nav
          aria-label="Etapas do curso"
          className="relative mt-4 flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 sm:overflow-visible"
        >
          {[
            ...content.courseLessons.map((item) => item.title),
            "Prova final",
          ].map((label, index) => {
            const isCurrent = step === index;
            const isReached =
              index === 0 ||
              index <= step ||
              completedLessonIds.includes(`lesson-${index}`) ||
              answeredLessons[index - 1];
            const shortLabel =
              index === examStep ? "Prova" : `Aula ${index + 1}`;

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
                className="min-h-10 min-w-24 justify-start gap-2 overflow-hidden rounded-xl px-3 text-xs sm:min-w-0"
              >
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] ${
                    completedLessonIds.includes(`lesson-${index + 1}`) ||
                    answeredLessons[index]
                      ? "bg-primary text-primary-foreground"
                      : isCurrent
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {completedLessonIds.includes(`lesson-${index + 1}`) ||
                  answeredLessons[index] ? (
                    <Check aria-hidden="true" className="size-3" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span>{shortLabel}</span>
              </Button>
            );
          })}
        </nav>
      </div>

      <div className="p-3 sm:p-6 lg:p-7">
        {!isExam && lesson ? (
          <article
            key={step}
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:duration-300"
          >
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-7">
              <header className="px-1 py-1 sm:px-2 lg:py-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-primary">
                    {step === 0 ? (
                      <CirclePlay aria-hidden="true" className="size-3.5" />
                    ) : (
                      <span>{String(step + 1).padStart(2, "0")}</span>
                    )}
                  </span>
                  {step === 0 ? "Aula em vídeo" : `Aula ${step + 1}`}
                </p>
                <h3 className="mt-3 max-w-4xl text-2xl font-bold tracking-tight sm:text-3xl">
                  {lesson.title}
                </h3>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
                  {lesson.content}
                </p>
              </header>

              <div className="min-w-0">
                {step === 0 && content.availability === "available" ? (
                  <section
                    aria-label={`Aula em vídeo: ${assetClass.label}`}
                    className="overflow-hidden rounded-2xl border border-border/70 bg-foreground/[0.03] shadow-sm"
                  >
                    <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5 sm:px-4">
                      <CirclePlay
                        aria-hidden="true"
                        className="size-4 text-primary"
                      />
                      <h4 className="text-sm font-semibold">Assista à aula</h4>
                      <span className="ml-auto text-xs text-muted-foreground">
                        Vídeo introdutório
                      </span>
                    </div>
                    <div className="bg-black">
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
                  </section>
                ) : step === 0 && content.availability === "coming-soon" ? (
                  <p
                    role="status"
                    className="rounded-2xl border border-border/70 bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
                  >
                    Vídeo em breve
                  </p>
                ) : (
                  <AssetClassLearningLesson
                    selectedClass={selectedClass}
                    lessonIndex={step}
                    lesson={lesson}
                  />
                )}
              </div>
            </div>

            <div className="mt-5">
              <AssetClassLearningQuiz
                key={`lesson-${step}`}
                question={lesson.question.question}
                options={lesson.question.options}
                correctOptionIndex={lesson.question.correctOptionIndex}
                onAnswered={(correct) => handleLessonAnswered(step, correct)}
              />
            </div>
          </article>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-card to-muted/40 p-4 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Revise o que aprendeu
              </p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                Prova final
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Responda às perguntas. A nota vai de 0 a 10; com 7,0 ou mais,
                você conclui o curso e recebe a medalha.
              </p>
            </div>
            <AssetClassLearningAssessment
              key={selectedClass}
              questions={content.assessment}
              initialResult={
                progress?.latestScore !== null &&
                progress?.latestScore !== undefined
                  ? {
                      score: progress.latestScore,
                      passed: progress.passed,
                      attemptPassed:
                        progress.latestScore >= learningAssessmentPassScore,
                      bestScore: progress.bestScore ?? 0,
                    }
                  : progress?.passed
                    ? {
                        score: progress.bestScore ?? 10,
                        passed: true,
                        attemptPassed: true,
                        bestScore: progress.bestScore ?? 10,
                      }
                    : null
              }
              onComplete={async ({ attemptId, answers }) => {
                const saved = await saveCheckpoint({
                  courseId: selectedClass,
                  completedLessonIds: content.courseLessons.map(
                    (_, index) => `lesson-${index + 1}`,
                  ),
                  lastLessonId: `lesson-${content.courseLessons.length}`,
                  assessment: { attemptId, answers },
                });
                if (!saved.assessment) {
                  throw new Error("O resultado da prova não foi salvo.");
                }
                return {
                  score: saved.assessment.score,
                  passed: saved.assessment.passed,
                  coursePassed: saved.progress.passed,
                  bestScore: saved.progress.bestScore ?? 0,
                };
              }}
            />
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm"
            >
              <PartyPopper
                aria-hidden="true"
                className="size-4 shrink-0 text-primary"
              />
              {progress?.quizAttemptCount
                ? `Provas realizadas: ${progress.quizAttemptCount}.`
                : "Você pode rever as aulas e refazer a prova quando quiser."}
            </div>
          </div>
        )}

        {saveError && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-danger/30 bg-status-danger/5 p-3">
            <p role="alert" className="text-sm text-destructive">
              {saveError}
            </p>
            {pendingCheckpoint && (
              <Button
                type="button"
                variant="outline"
                disabled={savingProgress}
                onClick={() =>
                  void saveCheckpoint(pendingCheckpoint).catch(() => undefined)
                }
              >
                {savingProgress ? "Salvando…" : "Tentar salvar novamente"}
              </Button>
            )}
          </div>
        )}

        {!isExam && (
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
              disabled={!canGoForward}
              onClick={() => goToStep(step + 1)}
              className="min-h-11"
            >
              {isLastLesson ? "Começar prova" : "Próxima aula"}
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
