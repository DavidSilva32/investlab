import Link from "next/link";
import { Button } from "@/components/ui/button";

const experiences = [
  { id: "discover", href: "/analyses", label: "Descobrir" },
  { id: "explore", href: "/analyses/screener", label: "Explorar" },
  { id: "analysis", href: "/analyses?ticker=PETR4", label: "Analisar" },
] as const;

export function AnalysisExperienceNav({
  active,
}: {
  active: (typeof experiences)[number]["id"];
}) {
  return (
    <nav
      aria-label="Experiências de análise"
      className="mb-6 flex flex-wrap gap-2"
    >
      {experiences.map(({ id, href, label }) => (
        <Button
          key={id}
          variant={active === id ? "default" : "outline"}
          asChild
        >
          <Link href={href} aria-current={active === id ? "page" : undefined}>
            {label}
          </Link>
        </Button>
      ))}
    </nav>
  );
}
