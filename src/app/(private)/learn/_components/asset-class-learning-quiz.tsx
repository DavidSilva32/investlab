"use client";

import { useEffect, useId, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  shuffleLearningOptions,
  type ShuffledLearningOption,
} from "@/lib/asset-class-learning";

type AssetClassLearningQuizProps = {
  question: string;
  options: {
    text: string;
    explanation: string;
  }[];
  correctOptionIndex: number;
  onAnswered?: (
    correct: boolean | null,
    selectedOptionIndex?: number | null,
  ) => void;
};

export function AssetClassLearningQuiz({
  question,
  options,
  correctOptionIndex,
  onAnswered,
}: AssetClassLearningQuizProps) {
  const quizId = useId();
  const [shuffledOptions, setShuffledOptions] = useState<
    ShuffledLearningOption[]
  >(() =>
    options.map((option, sourceIndex) => ({
      ...option,
      sourceIndex,
      isCorrect: sourceIndex === correctOptionIndex,
    })),
  );
  const [optionsReady, setOptionsReady] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submittedOption, setSubmittedOption] = useState<number | null>(null);
  const answered = submittedOption !== null;
  const correct =
    submittedOption !== null && shuffledOptions[submittedOption].isCorrect;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setShuffledOptions((previousOptions) =>
        shuffleLearningOptions(
          options,
          correctOptionIndex,
          Math.random,
          previousOptions.map((option) => option.sourceIndex),
        ),
      );
      setOptionsReady(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [correctOptionIndex, options]);

  function submitAnswer() {
    setSubmittedOption(selectedOption);
    onAnswered?.(
      selectedOption !== null && shuffledOptions[selectedOption].isCorrect,
      selectedOption === null
        ? null
        : shuffledOptions[selectedOption].sourceIndex,
    );
  }

  function retry() {
    setShuffledOptions((previousOptions) =>
      shuffleLearningOptions(
        options,
        correctOptionIndex,
        Math.random,
        previousOptions.map((option) => option.sourceIndex),
      ),
    );
    setSelectedOption(null);
    setSubmittedOption(null);
    onAnswered?.(null, null);
  }

  return (
    <section
      aria-labelledby={`${quizId}-title`}
      className="rounded-xl border border-border/70 bg-muted/30 p-4 sm:p-5"
    >
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Confira o que aprendeu
        </p>
        <h3 id={`${quizId}-title`} className="mt-1 text-lg font-semibold">
          {question}
        </h3>
      </div>

      {optionsReady ? (
        <RadioGroup
          aria-label="Escolha uma resposta"
          value={selectedOption === null ? "" : String(selectedOption)}
          onValueChange={(value) => setSelectedOption(Number(value))}
          disabled={answered}
          className="grid gap-2"
        >
          {shuffledOptions.map((option, index) => {
            const id = `${quizId}-answer-${index}`;
            const isSelected = selectedOption === index;
            const isCorrectOption = option.isCorrect;

            return (
              <label
                key={option.text}
                htmlFor={id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:bg-muted/60"
                } ${answered && isCorrectOption ? "border-status-success" : ""}`}
              >
                <RadioGroupItem
                  id={id}
                  value={String(index)}
                  className="mt-0.5 shrink-0"
                />
                <span>{option.text}</span>
              </label>
            );
          })}
        </RadioGroup>
      ) : (
        <div
          aria-hidden="true"
          className="grid gap-2"
          data-testid="answer-options-loading"
        >
          {options.map((option) => (
            <div
              key={option.text}
              className="h-11 animate-pulse rounded-lg border border-border/70 bg-muted/40"
            />
          ))}
        </div>
      )}

      {!answered ? (
        <Button
          type="button"
          className="mt-4 min-h-10 focus-visible:ring-2 focus-visible:ring-offset-2"
          disabled={selectedOption === null}
          onClick={submitAnswer}
        >
          Conferir resposta
        </Button>
      ) : (
        <>
          <div
            role="status"
            aria-live="polite"
            className={`mt-4 rounded-lg border p-3 ${
              correct
                ? "border-status-success/40 bg-status-success/10"
                : "border-status-danger/40 bg-status-danger/10"
            }`}
          >
            <p className="flex items-center gap-2 font-semibold">
              {correct ? (
                <Check
                  aria-hidden="true"
                  className="size-4 text-status-success"
                />
              ) : (
                <X aria-hidden="true" className="size-4 text-status-danger" />
              )}
              {correct ? "Resposta certa" : "Ainda não"}
            </p>
            <p className="mt-1 text-sm text-foreground">
              {shuffledOptions[submittedOption].explanation}
            </p>
            {!correct && (
              <p className="mt-2 text-sm text-foreground">
                A resposta correta é:{" "}
                <strong>
                  {shuffledOptions.find((option) => option.isCorrect)?.text}
                </strong>
              </p>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-10 focus-visible:ring-2 focus-visible:ring-offset-2"
            onClick={retry}
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Tentar novamente
          </Button>
        </>
      )}
    </section>
  );
}
