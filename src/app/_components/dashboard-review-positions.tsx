import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function DashboardReviewPositions({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <section aria-labelledby="dashboard-review-positions-title">
      <Card className="border-status-warning/40 bg-status-warning/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <TriangleAlert
              aria-hidden="true"
              className="size-5 shrink-0 text-status-warning"
            />
            <div>
              <h2
                id="dashboard-review-positions-title"
                className="font-semibold"
              >
                Dados para revisar
              </h2>
              <p className="text-sm text-muted-foreground">
                {count} {count === 1 ? "posição sem" : "posições sem"} valor
                atual
              </p>
            </div>
          </div>
          <Link
            href="/portfolio?view=positions"
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Revisar posições
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
