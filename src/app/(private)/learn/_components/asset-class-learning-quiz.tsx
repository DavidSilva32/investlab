"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type AssetClassLearningQuizProps = {
  question: string;
  options: {
    text: string;
    explanation: string;
  }[];
  correctOptionIndex: number;
};

export function AssetClassLearningQuiz({
  question,
  options,
  correctOptionIndex,
}: AssetClassLearningQuizProps) {
  const quizId = useId();
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submittedOption, setSubmittedOption] = useState<number | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const answered = submittedOption !== null;
  const correct = submittedOption === correctOptionIndex;

  useEffect(() => {
    if (submittedOption !== null) feedbackRef.current?.focus();
  }, [submittedOption]);

  function submitAnswer() {
    if (selectedOption === null) return;
    setSubmittedOption(selectedOption);
  }

  function retry() {
    setSelectedOption(null);
    setSubmittedOption(null);
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

      <RadioGroup
        aria-label="Escolha uma resposta"
        value={selectedOption === null ? "" : String(selectedOption)}
        onValueChange={(value) => setSelectedOption(Number(value))}
        disabled={answered}
        className="grid gap-2"
      >
        {options.map((option, index) => {
          const id = `${quizId}-answer-${index}`;
          const isSelected = selectedOption === index;
          const isCorrectOption = index === correctOptionIndex;

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
            ref={feedbackRef}
            tabIndex={-1}
            role="status"
            aria-live="polite"
            className={`mt-4 rounded-lg border p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
              {options[submittedOption].explanation}
            </p>
            {!correct && (
              <p className="mt-2 text-sm text-foreground">
                A resposta correta é:{" "}
                <strong>{options[correctOptionIndex].text}</strong>
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
