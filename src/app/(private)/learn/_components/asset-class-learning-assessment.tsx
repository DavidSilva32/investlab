"use client";

import { useState } from "react";
import { Award, PartyPopper, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  calculateLearningAssessmentScore,
  hasAllLearningAnswers,
  learningAssessmentPassScore,
  type AssetClassLearningQuestion,
} from "@/lib/asset-class-learning";
import { AssetClassLearningQuiz } from "./asset-class-learning-quiz";

type AssetClassLearningAssessmentProps = {
  questions: AssetClassLearningQuestion[];
  initialResult?: {
    score: number;
    passed: boolean;
    attemptPassed?: boolean;
    bestScore?: number;
  } | null;
  onComplete?: (input: { attemptId: string; answers: number[] }) => Promise<{
    score: number;
    passed: boolean;
    coursePassed?: boolean;
    bestScore?: number;
  }>;
};

type AssessmentResult = {
  score: number;
  passed: boolean;
  attemptPassed: boolean;
  bestScore: number;
};

export function AssetClassLearningAssessment({
  questions,
  initialResult = null,
  onComplete,
}: AssetClassLearningAssessmentProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [currentAnswerCorrect, setCurrentAnswerCorrect] = useState<
    boolean | null
  >(null);
  const [answers, setAnswers] = useState<Array<number | null>>(() =>
    questions.map(() => null),
  );
  const [attempt, setAttempt] = useState(0);
  const [coursePassed, setCoursePassed] = useState(
    initialResult?.passed ?? false,
  );
  const [bestScore, setBestScore] = useState(
    initialResult?.bestScore ??
      (initialResult?.passed ? initialResult.score : 0),
  );
  const [result, setResult] = useState<AssessmentResult | null>(
    initialResult
      ? {
          score: initialResult.score,
          passed: initialResult.passed,
          attemptPassed: initialResult.attemptPassed ?? initialResult.passed,
          bestScore:
            initialResult.bestScore ??
            (initialResult.passed ? initialResult.score : 0),
        }
      : null,
  );
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const question = questions[questionIndex];

  async function moveForward() {
    const selectedAnswer = answers[questionIndex];
    const nextCorrectAnswers =
      correctAnswers + (currentAnswerCorrect === true ? 1 : 0);
    if (questionIndex < questions.length - 1) {
      setCorrectAnswers(nextCorrectAnswers);
      setQuestionIndex((index) => index + 1);
      setAnswered(false);
      setCurrentAnswerCorrect(null);
      return;
    }

    const completedAnswers = answers.map((answer, index) =>
      index === questionIndex ? selectedAnswer : answer,
    );
    if (!hasAllLearningAnswers(completedAnswers)) return;
    setSubmitting(true);
    setSubmitError(null);
    const id = attemptId ?? crypto.randomUUID();
    setAttemptId(id);
    try {
      const localScore = calculateLearningAssessmentScore(
        nextCorrectAnswers,
        questions.length,
      );
      const finalResult = onComplete
        ? await onComplete({
            attemptId: id,
            answers: completedAnswers as number[],
          })
        : {
            score: localScore,
            passed: localScore >= learningAssessmentPassScore,
          };
      const permanentlyPassed =
        coursePassed || finalResult.passed || finalResult.coursePassed === true;
      const nextBestScore = Math.max(
        bestScore,
        finalResult.bestScore ?? 0,
        finalResult.passed ? finalResult.score : 0,
      );
      setCoursePassed(permanentlyPassed);
      setBestScore(nextBestScore);
      setResult({
        score: finalResult.score,
        passed: permanentlyPassed,
        attemptPassed: finalResult.passed,
        bestScore: nextBestScore,
      });
    } catch {
      setSubmitError(
        "Não foi possível salvar o resultado. Tente novamente; suas respostas foram mantidas.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function retryAssessment() {
    setQuestionIndex(0);
    setCorrectAnswers(0);
    setAnswered(false);
    setCurrentAnswerCorrect(null);
    setAnswers(questions.map(() => null));
    setResult(null);
    setAttemptId(null);
    setSubmitError(null);
    setAttempt((current) => current + 1);
  }

  return (
    <section
      aria-label="Prova final"
      className="space-y-4 rounded-xl border border-border/70 bg-muted/30 p-4 sm:p-5"
    >
      {!result ? (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Prova final</h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {questionIndex + 1} de {questions.length}
              </span>
            </div>
            <Progress
              value={
                ((questionIndex + (answered ? 1 : 0)) / questions.length) * 100
              }
              aria-label="Progresso da prova"
              className="h-1.5"
            />
          </div>

          <AssetClassLearningQuiz
            key={`${attempt}-${questionIndex}`}
            question={question.question}
            options={question.options}
            correctOptionIndex={question.correctOptionIndex}
            onAnswered={(correct, selectedAnswerIndex) => {
              setAnswered(correct !== null);
              setCurrentAnswerCorrect(correct);
              if (selectedAnswerIndex !== undefined) {
                setAnswers((previous) => {
                  const next = [...previous];
                  next[questionIndex] = selectedAnswerIndex;
                  return next;
                });
              }
            }}
          />

          {answered && (
            <Button
              type="button"
              className="min-h-11"
              onClick={() => void moveForward()}
              disabled={submitting}
            >
              {submitting ? "Salvando resultado…" : null}
              {!submitting &&
                (questionIndex === questions.length - 1
                  ? "Ver resultado"
                  : "Próxima pergunta")}
            </Button>
          )}
          {submitError && (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          )}
        </>
      ) : (
        <div
          role="status"
          aria-live="polite"
          className={`overflow-hidden rounded-2xl border ${
            result.passed
              ? "border-status-success/40 bg-status-success/5"
              : "border-border bg-background"
          }`}
        >
          <div
            className={`px-5 py-6 text-center ${result.passed ? "bg-status-success/10" : "bg-muted/40"}`}
          >
            {result.passed ? (
              <>
                <span className="mx-auto grid size-16 place-items-center rounded-full border border-status-success/30 bg-background text-status-success shadow-sm">
                  <Award
                    aria-hidden="true"
                    className="size-9 motion-safe:animate-bounce motion-reduce:animate-none"
                  />
                </span>
                <h3 className="mt-3 text-2xl font-bold tracking-tight">
                  Curso concluído!
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {result.attemptPassed
                    ? "Emblema conquistado"
                    : "Sua aprovação continua registrada"}
                </p>
                <PartyPopper
                  aria-hidden="true"
                  className="mx-auto mt-2 size-5 text-status-success motion-safe:animate-pulse motion-reduce:animate-none"
                />
              </>
            ) : (
              <>
                <h3 className="text-xl font-semibold">Você está quase lá</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reveja as aulas e tente a prova novamente.
                </p>
              </>
            )}
          </div>
          <div className="mx-auto max-w-sm px-5 py-5 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sua nota
            </p>
            <p className="mt-1 text-5xl font-bold tabular-nums tracking-tight">
              {result.score.toLocaleString("pt-BR", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
              <span className="text-lg font-medium text-muted-foreground">
                /10
              </span>
            </p>
            <Progress
              value={result.score * 10}
              aria-label={`Nota ${result.score.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} de 10`}
              className={`mt-3 h-2 ${result.passed ? "[&>div]:bg-status-success" : ""}`}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              Nota mínima: 7,0
            </p>
            {result.passed && !result.attemptPassed && (
              <p className="mt-1 text-xs text-muted-foreground">
                Melhor nota aprovada:{" "}
                {result.bestScore.toLocaleString("pt-BR", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
                /10.
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-11"
            onClick={retryAssessment}
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Refazer prova
          </Button>
        </div>
      )}
    </section>
  );
}
