import { Award, BookOpen, CircleCheck, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { strategyAssetClassById } from "@/lib/strategy-allocation";
import type { StrategyAssetClassId } from "@/lib/strategy-allocation";

export type LearningProgressSummary = {
  courseId: string;
  passed: boolean;
  bestScore: number | null;
  passedAt: string | null;
};

export function UserLearningBadges({
  courses,
  loading,
  error,
  onRetry,
}: {
  courses: LearningProgressSummary[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const passedCourses = courses.filter(
    (course) => course.passed && course.courseId in strategyAssetClassById,
  );

  return (
    <section aria-label="Emblemas de aprendizagem" className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Award aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold">Seus emblemas</h2>
          <p className="text-sm text-muted-foreground">
            Conclua a prova com nota 7 ou mais para conquistar um emblema.
          </p>
        </div>
      </div>

      {loading ? (
        <p
          role="status"
          className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground"
        >
          Carregando seus emblemas…
        </p>
      ) : error ? (
        <div className="rounded-xl border border-status-danger/30 bg-status-danger/5 p-4">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onRetry}
          >
            Tentar novamente
          </Button>
        </div>
      ) : passedCourses.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {passedCourses.map((course) => {
            const assetClass =
              strategyAssetClassById[course.courseId as StrategyAssetClassId];
            return (
              <li
                key={course.courseId}
                className="flex min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-card p-3"
                style={{
                  borderLeftColor: `var(${assetClass.colorToken})`,
                  borderLeftWidth: "3px",
                }}
              >
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-muted"
                  style={{ color: `var(${assetClass.colorToken})` }}
                  aria-hidden="true"
                >
                  <Medal className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {assetClass.label}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-status-success">
                    <CircleCheck aria-hidden="true" className="size-3.5" />
                    Aprovado
                  </span>
                </span>
                {course.bestScore !== null && (
                  <span className="shrink-0 text-right">
                    <span className="block text-lg font-bold tabular-nums">
                      {course.bestScore.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      /10
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-5 text-center">
          <BookOpen
            aria-hidden="true"
            className="mx-auto size-6 text-muted-foreground"
          />
          <p className="mt-2 text-sm font-medium">
            Seu primeiro emblema está à espera
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Acesse um curso e conclua a prova para conquistá-lo.
          </p>
        </div>
      )}
    </section>
  );
}
