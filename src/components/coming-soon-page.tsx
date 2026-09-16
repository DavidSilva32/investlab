import { Construction } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
export function ComingSoonPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <AppShell title={title}>
      <Card>
        <CardContent className="grid min-h-72 place-items-center p-6 text-center">
          <div>
            <span className="mx-auto grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <Construction className="size-5" />
            </span>
            <h2 className="mt-4 text-lg font-semibold">Em desenvolvimento</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {description}
            </p>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
