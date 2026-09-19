"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Position = {
  product: string;
  quantity: string;
  totalValue: string | null;
  institution: string | null;
  assetCode: string | null;
  indexer: string | null;
  unitPrice: string | null;
  valuationSource: "MTM" | "CURVA" | "FECHAMENTO" | "INFORMADO" | null;
};
type Movement = {
  occurredAt: string;
  movementType: string;
  product: string;
  quantity: string;
  operationValue: string | null;
};
type Preview =
  | {
      documentType: "B3_POSITION_XLSX";
      positions: Position[];
      count: number;
      estimationBaseDate?: string | null;
    }
  | { documentType: "B3_MOVEMENT_XLSX"; movements: Movement[]; count: number };
type Item = { file: File; preview?: Preview; error?: string };
type MutationResponse = { message?: string };
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 });
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

function formatDate(value: string | null | undefined) {
  return value ? date.format(new Date(`${value}T00:00:00Z`)) : "Não informada";
}

function formatMoney(value: string | null) {
  return value === null ? "—" : money.format(Number(value));
}

export function PortfolioImport() {
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  async function send(file: File, endpoint: string) {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(endpoint, { method: "POST", body: form });
    const body = (await response.json()) as MutationResponse & Preview;
    if (!response.ok)
      throw new Error(body.message ?? "Não foi possível ler o arquivo.");
    return body;
  }

  async function previewFiles(files: File[]) {
    setLoading(true);
    setItems(files.map((file) => ({ file })));
    const results = await Promise.all(
      files.map(async (file) => {
        try {
          const body = await send(file, "/api/imports/preview");
          return {
            file,
            preview: body.documentType
              ? (body as Preview)
              : {
                  documentType: "B3_POSITION_XLSX" as const,
                  positions:
                    (body as { positions?: Position[] }).positions ?? [],
                  count: (body as Partial<Preview>).count ?? 0,
                },
          };
        } catch (error) {
          return {
            file,
            error:
              error instanceof Error
                ? error.message
                : "Não foi possível comunicar com o servidor.",
          };
        }
      }),
    );
    setItems(results);
    setLoading(false);
  }

  async function confirm() {
    const ready = items.filter((item): item is Item & { preview: Preview } =>
      Boolean(item.preview),
    );
    setLoading(true);
    const results = await Promise.all(
      ready.map(async (item) => {
        try {
          const response = await send(item.file, "/api/imports/confirm");
          return { item, message: response.message };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Não foi possível salvar o arquivo.";
          toast.error(message);
          return { item: { ...item, error: message } };
        }
      }),
    );
    setLoading(false);
    const confirmedItems = results.map((result) => result.item);
    if (confirmedItems.every((item) => !item.error)) {
      results.forEach((result) =>
        toast.success(result.message ?? "Arquivo importado com sucesso."),
      );
      location.reload();
    } else setItems(confirmedItems);
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">Importar dados B3</h2>
          <p className="text-sm text-muted-foreground">
            Envie posições e movimentações juntas. O preview é gerado
            automaticamente antes de salvar.
          </p>
        </div>
        <Button
          className="w-full sm:w-auto"
          disabled={loading}
          onClick={() => input.current!.click()}
        >
          Importar carteira
        </Button>
      </div>
      <input
        ref={input}
        className="hidden"
        type="file"
        multiple
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) void previewFiles(files);
          event.target.value = "";
        }}
      />
      {loading && (
        <p className="mt-4 text-sm text-muted-foreground">Lendo arquivos...</p>
      )}
      <div className="mt-5 space-y-5">
        {items.map((item) => (
          <PreviewItem
            key={`${item.file.name}-${item.file.lastModified}`}
            item={item}
          />
        ))}
      </div>
      {items.some((item) => item.preview) && (
        <div className="mt-5 flex gap-3">
          <Button disabled={loading} onClick={confirm}>
            {loading
              ? "Salvando..."
              : `Confirmar ${items.filter((item) => item.preview).length} arquivo(s)`}
          </Button>
          <Button
            variant="ghost"
            disabled={loading}
            onClick={() => setItems([])}
          >
            Cancelar
          </Button>
        </div>
      )}
    </section>
  );
}

function PreviewItem({ item }: { item: Item }) {
  if (item.error)
    return (
      <p aria-live="polite" className="text-sm text-destructive">
        {item.file.name}: {item.error}
      </p>
    );
  if (!item.preview) return <p className="text-sm">{item.file.name}</p>;
  if (item.preview.documentType === "B3_POSITION_XLSX")
    return <PositionPreview fileName={item.file.name} preview={item.preview} />;

  return (
    <div>
      <h3 className="font-medium">
        {item.file.name} — {item.preview.count} movimentações encontradas
      </h3>
      <div className="mt-3 max-h-64 overflow-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <tbody>
            {item.preview.movements.map((record, index) => (
              <tr key={index} className="border-t">
                <td className="p-2">
                  {date.format(new Date(`${record.occurredAt}T00:00:00Z`))}
                </td>
                <td>{record.movementType}</td>
                <td>{record.product}</td>
                <td>{number.format(Number(record.quantity))}</td>
                <td className="p-2 text-right tabular-nums">
                  {record.operationValue
                    ? money.format(Number(record.operationValue))
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PositionPreview({
  fileName,
  preview,
}: {
  fileName: string;
  preview: Extract<Preview, { documentType: "B3_POSITION_XLSX" }>;
}) {
  const valuedPositions = preview.positions.filter(
    (position) => position.totalValue !== null,
  );
  const totalValue = valuedPositions.reduce(
    (total, position) => total + Number(position.totalValue),
    0,
  );
  const institutions = new Set(
    preview.positions
      .map((position) => position.institution)
      .filter((institution): institution is string => Boolean(institution)),
  );

  return (
    <Card className="overflow-hidden shadow-sm">
      <CardHeader className="gap-3 border-b bg-muted/20 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">{fileName}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Revise os valores extraídos antes de confirmar a importação.
            </p>
          </div>
          <Badge variant="secondary" className="w-fit">
            {preview.count} posição(ões)
          </Badge>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <SummaryItem
            label="Data-base B3"
            value={formatDate(preview.estimationBaseDate)}
          />
          <SummaryItem
            label="Total reconhecido"
            value={money.format(totalValue)}
          />
          <SummaryItem
            label="Com valor"
            value={`${valuedPositions.length} de ${preview.count}`}
          />
          <SummaryItem label="Instituições" value={String(institutions.size)} />
        </dl>
      </CardHeader>
      <CardContent className="p-0">
        {valuedPositions.length !== preview.count && (
          <Alert className="m-4 mb-0" aria-live="polite">
            <AlertTitle>Total parcial</AlertTitle>
            <AlertDescription>
              {preview.count - valuedPositions.length} posição(ões) sem valor
              total não foram incluídas no total reconhecido.
            </AlertDescription>
          </Alert>
        )}
        <Table className="min-w-240">
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Instituição</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Indexador</TableHead>
              <TableHead className="text-right">Quantidade</TableHead>
              <TableHead className="text-right">Preço unitário</TableHead>
              <TableHead>Critério</TableHead>
              <TableHead className="text-right">Valor total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.positions.map((position, index) => (
              <TableRow
                key={`${position.product}-${position.assetCode ?? index}`}
              >
                <TableCell className="min-w-48 font-medium">
                  {position.product}
                </TableCell>
                <TableCell>{position.institution ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">
                  {position.assetCode ?? "—"}
                </TableCell>
                <TableCell>{position.indexer ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {number.format(Number(position.quantity))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(position.unitPrice)}
                </TableCell>
                <TableCell>
                  {position.valuationSource ? (
                    <Badge variant="outline">{position.valuationSource}</Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatMoney(position.totalValue)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={7}>Total reconhecido no arquivo</TableCell>
              <TableCell className="text-right tabular-nums">
                {money.format(totalValue)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/60 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
