"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, CircleDollarSign, Clock3 } from "lucide-react";
import { usePortfolioProventos } from "@/lib/queries/portfolio";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ProventoItem = {
  id: string;
  fileName: string;
  status: "RECEIVED" | "UPCOMING";
  product: string;
  eventType: string;
  paymentDate: string;
  institution: string | null;
  quantity: string;
  unitPrice: string;
  netValue: string;
  importedAt: string;
};
type ProventosResponse = {
  items: ProventoItem[];
  latestImports: {
    received: LatestProventoImport | null;
    upcoming: LatestProventoImport | null;
  };
};
type LatestProventoImport = {
  fileName: string;
  importedAt: string;
  count: number;
  total: number;
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 });
const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function formattedDate(value: string) {
  return date.format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function ProventoTable({
  title,
  items,
  upcoming,
}: {
  title: string;
  items: ProventoItem[];
  upcoming: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {upcoming
              ? "A B3 não informou proventos previstos nos arquivos importados."
              : "Nenhum provento recebido foi importado ainda."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[54rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>{upcoming ? "Previsão" : "Pagamento"}</TableHead>
                  <TableHead>Instituição</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Preço unitário</TableHead>
                  <TableHead className="text-right">Valor líquido</TableHead>
                  <TableHead>Origem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="min-w-48 font-medium">
                      {item.product}
                    </TableCell>
                    <TableCell>{item.eventType}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formattedDate(item.paymentDate)}
                    </TableCell>
                    <TableCell className="min-w-52">
                      {item.institution ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {number.format(Number(item.quantity))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(Number(item.unitPrice))}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {money.format(Number(item.netValue))}
                    </TableCell>
                    <TableCell className="max-w-56 text-xs text-muted-foreground">
                      <span className="block truncate" title={item.fileName}>
                        {item.fileName}
                      </span>
                      <span>{dateTime.format(new Date(item.importedAt))}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PortfolioProventos() {
  const query = usePortfolioProventos<ProventosResponse>();
  const refetch = query.refetch;
  useEffect(() => {
    const refresh = () => void refetch();
    window.addEventListener("proventos:updated", refresh);
    return () => window.removeEventListener("proventos:updated", refresh);
  }, [refetch]);

  if (query.isPending)
    return (
      <div className="space-y-4" aria-label="Carregando proventos">
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );

  if (query.isError || !query.data)
    return (
      <Alert variant="destructive" role="alert">
        <AlertCircle aria-hidden="true" className="size-4" />
        <AlertTitle>Não foi possível carregar os proventos</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>Seus dados não foram alterados. Tente novamente.</span>
          <Button
            type="button"
            variant="outline"
            onClick={() => void query.refetch()}
          >
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );

  const { items, latestImports } = query.data;
  const received = items.filter((item) => item.status === "RECEIVED");
  const upcoming = items.filter((item) => item.status === "UPCOMING");

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">
          Valores registrados pela B3 nos arquivos importados. Recebidos e
          previstos ficam separados; previsões podem mudar. Cada total mostra
          apenas o arquivo mais recente daquele tipo; os arquivos anteriores
          continuam no histórico abaixo.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-3 p-4 sm:p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <CircleDollarSign aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">
                Recebidos no arquivo mais recente
              </p>
              <p className="text-xl font-semibold tabular-nums">
                {money.format(latestImports.received?.total ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">
                {latestImports.received
                  ? `${latestImports.received.count} ${latestImports.received.count === 1 ? "registro" : "registros"} · ${formattedDate(latestImports.received.importedAt)}`
                  : "Nenhum arquivo importado"}
              </p>
              {latestImports.received && latestImports.received.total > 0 ? (
                <Button
                  asChild
                  size="sm"
                  variant="link"
                  className="h-auto px-0"
                >
                  <Link
                    href={`/estrategia?aporteCents=${Math.round(latestImports.received.total * 100)}#next-contribution`}
                  >
                    Simular como próximo aporte
                  </Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4 sm:p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Clock3 aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">
                A receber no arquivo mais recente
              </p>
              <p className="text-xl font-semibold tabular-nums">
                {money.format(latestImports.upcoming?.total ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">
                {latestImports.upcoming
                  ? `${latestImports.upcoming.count} ${latestImports.upcoming.count === 1 ? "previsão" : "previsões"} · ${formattedDate(latestImports.upcoming.importedAt)}`
                  : "Nenhum arquivo importado"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      {items.length === 0 ? (
        <Alert>
          <AlertTitle>Importe seus relatórios de proventos</AlertTitle>
          <AlertDescription>
            Na carteira, escolha Importar dados e envie o XLSX de “Proventos
            Recebidos” ou “Proventos a Receber” baixado na Área do Investidor da
            B3. Você confere os registros antes de salvar.
          </AlertDescription>
        </Alert>
      ) : null}
      <ProventoTable
        title="Proventos recebidos"
        items={received}
        upcoming={false}
      />
      <ProventoTable title="Proventos a receber" items={upcoming} upcoming />
    </div>
  );
}
