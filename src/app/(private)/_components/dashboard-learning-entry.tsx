"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CircleCheck,
  CircleHelp,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api-client";
import { getLearningClassHref } from "@/lib/asset-class-learning";
import {
  strategyAssetClassById,
  strategyAssetClasses,
  type StrategyAssetClassId,
} from "@/lib/strategy-allocation";

type ProgressResponse = {
  courses: Array<{ courseId: string; passed: boolean }>;
};

export function DashboardLearningEntry() {
  const [incompleteCourses, setIncompleteCourses] = useState<
    StrategyAssetClassId[] | null
  >(null);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    void apiRequest<ProgressResponse>(
      "/api/learning/progress",
      undefined,
      "Não foi possível carregar seu progresso.",
    )
      .then((response) => {
        if (!active) return;
        const passed = new Set(
          response.courses
            .filter((course) => course.passed)
            .map((course) => course.courseId),
        );
        setIncompleteCourses(
          strategyAssetClasses
            .filter((assetClass) => !passed.has(assetClass.id))
            .map((assetClass) => assetClass.id),
        );
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [retryKey]);

  if (loadError) {
    return (
      <section
        aria-label="Aprendizado"
        className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <CircleHelp aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Cursos de aprendizado</h2>
            <p role="status" className="mt-1 text-sm text-muted-foreground">
              Não foi possível carregar seu progresso.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" className="min-h-10">
            <Link href="/aprender">
              Explorar cursos
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-10"
            onClick={() => {
              setLoadError(false);
              setRetryKey((key) => key + 1);
            }}
          >
            Tentar novamente
            <RefreshCw aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </section>
    );
  }

  if (!incompleteCourses?.length) return null;

  return (
    <section
      aria-labelledby="dashboard-learning-title"
      className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <BookOpenCheck aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 id="dashboard-learning-title" className="font-semibold">
              Continue seu aprendizado
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {incompleteCourses.length === 1
                ? "Falta concluir 1 curso."
                : `Faltam ${incompleteCourses.length} cursos para concluir.`}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="min-h-10 w-full sm:w-auto">
          <Link href="/aprender">
            Ver cursos
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {incompleteCourses.map((courseId) => {
          const assetClass = strategyAssetClassById[courseId];
          return (
            <li key={courseId}>
              <Link
                href={getLearningClassHref(courseId)}
                className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 truncate">{assetClass.label}</span>
                <CircleCheck
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
