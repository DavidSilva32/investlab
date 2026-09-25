import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import type { ContributionGuidance } from "@/lib/next-contribution-guidance";
export function NextContributionGuidanceCard({
  guidance,
}: {
  guidance?: ContributionGuidance;
}) {
  if (!guidance) return null;
  return (
    <section aria-labelledby="next-contribution-guidance-title">
      <Card>
        <CardHeader>
          <h2
            id="next-contribution-guidance-title"
            className="text-lg font-semibold leading-none tracking-tight"
          >
            Orientação para o próximo aporte
          </h2>
          <CardDescription>
            Comparação com sua estratégia pessoal; não é uma recomendação de
            ativo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div role="status" aria-live="polite">
            <p className="font-medium">{guidance.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {guidance.explanation}
            </p>
          </div>
          {guidance.reserveNote && (
            <p className="text-sm text-muted-foreground">
              {guidance.reserveNote}
            </p>
          )}
          <Link
            href="/portfolio"
            className="inline-block text-sm font-medium text-primary hover:underline"
          >
            Revisar estratégia e classificações
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
