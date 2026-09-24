import Link from "next/link";
import { Button } from "@/components/ui/button";

export function AnalysisExperienceNav({
  active,
}: {
  active: "explore" | "analysis";
}) {
  return (
    <nav
      aria-label="Experiências de análise"
      className="mb-6 flex flex-wrap gap-2"
    >
      <Button variant={active === "explore" ? "default" : "outline"} asChild>
        <Link href="/analyses/screener">Explorar ações</Link>
      </Button>
      <Button variant={active === "analysis" ? "default" : "outline"} asChild>
        <Link href="/analyses?ticker=PETR4">Analisar ação</Link>
      </Button>
    </nav>
  );
}
