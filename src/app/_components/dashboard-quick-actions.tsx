import Link from "next/link";
import { Plus, Target, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const actions = [
  {
    label: "Importar e conciliar",
    href: "/imports",
    Icon: Upload,
  },
  {
    label: "Ver objetivos",
    href: "/portfolio?panel=objectives",
    Icon: Target,
  },
] as const;

export function DashboardQuickActions() {
  return (
    <section aria-labelledby="dashboard-quick-actions-title">
      <Card className="motion-content-reveal">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <h2 id="dashboard-quick-actions-title" className="font-semibold">
            Ações rápidas
          </h2>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              asChild
              className="min-h-12 justify-start gap-2 sm:justify-center"
            >
              <Link href="/portfolio#manual-positions">
                <Plus aria-hidden="true" className="size-4" />
                Adicionar posição manual
              </Link>
            </Button>
            {actions.map(({ label, href, Icon }) => (
              <Button
                key={href}
                asChild
                variant="outline"
                className="min-h-12 justify-start gap-2 sm:justify-center"
              >
                <Link href={href}>
                  <Icon aria-hidden="true" className="size-4" />
                  {label}
                </Link>
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            A conciliação com posições existentes aparece durante a revisão da
            importação, quando houver correspondência.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
