import Link from "next/link";
import { ArrowRight, BookOpenCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DashboardLearningEntry() {
  return (
    <section
      aria-labelledby="dashboard-learning-title"
      className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <BookOpenCheck aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 id="dashboard-learning-title" className="font-semibold">
            Aprenda no seu ritmo
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Aulas curtas, perguntas e cursos sobre investimentos.
          </p>
        </div>
      </div>
      <Button asChild className="min-h-11 w-full sm:w-auto">
        <Link href="/aprender">
          Explorar cursos
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </Button>
    </section>
  );
}
