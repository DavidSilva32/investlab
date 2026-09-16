export const dynamic = "force-dynamic";
import { importRepository } from "@/backend/repositories/import.repository";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatQuantity } from "@/lib/utils";
export default async function PortfolioPage() {
  const positions = await importRepository.listLatestPositions();
  return (
    <AppShell title="Carteira">
      <div className="mb-7">
        <p className="text-sm text-muted-foreground">
          Acompanhe o snapshot mais recente importado da B3.
        </p>
      </div>
      <Card>
        <CardHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Snapshot atual</CardTitle>
              <CardDescription className="mt-1">
                {positions.length
                  ? `${positions.length} posições disponíveis`
                  : "Nenhuma posição importada"}
              </CardDescription>
            </div>
            {positions.length > 0 && <Badge>{positions.length} ativos</Badge>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {positions.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead>Instituição</TableHead>
                  <TableHead className="text-right">Valor atual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((position) => (
                  <TableRow key={position.id}>
                    <TableCell className="font-medium">
                      {position.product}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {position.assetCode ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(Number(position.quantity))}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {position.institution ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {position.totalValue
                        ? formatCurrency(Number(position.totalValue))
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-16 text-center">
              <p className="font-medium">Sua carteira ainda está vazia</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Importe um arquivo B3 para visualizar suas posições.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
