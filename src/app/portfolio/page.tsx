export const dynamic = "force-dynamic";
import Link from "next/link";
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
const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
export default async function PortfolioPage({
  searchParams = Promise.resolve({}),
}: { searchParams?: Promise<{ view?: string }> } = {}) {
  const { view } = await searchParams;
  const movementsView = view === "movements";
  const [positions, movements] = await Promise.all([
    importRepository.listLatestPositions(),
    importRepository.listMovements(),
  ]);
  return (
    <AppShell title="Carteira">
      <div className="mb-7">
        <p className="text-sm text-muted-foreground">
          Acompanhe suas posições e movimentações importadas da B3.
        </p>
      </div>
      <div className="mb-5 flex gap-2 border-b">
        <Link
          href="/portfolio"
          className={`border-b-2 px-3 py-2 text-sm font-medium ${!movementsView ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
        >
          Posições
        </Link>
        <Link
          href="/portfolio?view=movements"
          className={`border-b-2 px-3 py-2 text-sm font-medium ${movementsView ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
        >
          Movimentações
        </Link>
      </div>
      {movementsView ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Movimentações</CardTitle>
            <CardDescription>
              {movements.length
                ? `${movements.length} movimentações importadas`
                : "Nenhuma movimentação importada"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {movements.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Produto / código</TableHead>
                    <TableHead>Instituição</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">Preço unitário</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>
                        {date.format(
                          new Date(`${movement.occurredAt}T00:00:00Z`),
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge>
                          {movement.direction === "CREDITO"
                            ? "Crédito"
                            : "Débito"}{" "}
                          · {movement.movementType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {movement.product}
                        {movement.assetCode && (
                          <span className="block text-xs text-muted-foreground">
                            {movement.assetCode}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{movement.institution ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(Number(movement.quantity))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {movement.unitPrice
                          ? formatCurrency(Number(movement.unitPrice))
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {movement.operationValue
                          ? formatCurrency(Number(movement.operationValue))
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="p-12 text-center text-sm text-muted-foreground">
                Importe um arquivo de movimentações da B3 para visualizá-las.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Posições atuais</CardTitle>
                <CardDescription>
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
                    <TableHead>Emissão</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Valor atual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((position) => (
                    <TableRow key={position.id}>
                      <TableCell className="font-medium">
                        {position.product}
                      </TableCell>
                      <TableCell>{position.assetCode ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(Number(position.quantity))}
                      </TableCell>
                      <TableCell>{position.institution ?? "—"}</TableCell>
                      <TableCell>
                        {position.issuedAt
                          ? date.format(
                              new Date(`${position.issuedAt}T00:00:00Z`),
                            )
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {position.maturityAt
                          ? date.format(
                              new Date(`${position.maturityAt}T00:00:00Z`),
                            )
                          : "—"}
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
              <p className="p-12 text-center text-sm text-muted-foreground">
                Importe um arquivo B3 para visualizar suas posições.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
