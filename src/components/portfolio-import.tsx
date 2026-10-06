"use client";

import { useRef, useState } from "react";
import {
  Building2,
  CircleDollarSign,
  FileSpreadsheet,
  Layers3,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { getApiMessage } from "@/lib/api-message";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
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
  issuer?: string | null;
  regimeType?: string | null;
  issuedAt?: string | null;
  maturityAt?: string | null;
};
type IdentityConflict = {
  assetKey: string;
  objectiveName: string;
  position: Pick<Position, "product" | "assetCode" | "institution"> &
    Partial<
      Pick<
        Position,
        "issuer" | "indexer" | "regimeType" | "issuedAt" | "maturityAt"
      >
    >;
  possibleIncomingDifferences: Array<{
    position: Pick<Position, "product" | "assetCode" | "institution"> &
      Partial<
        Pick<
          Position,
          "issuer" | "indexer" | "regimeType" | "issuedAt" | "maturityAt"
        >
      >;
    changedFields: string[];
  }>;
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
      identityConflicts?: IdentityConflict[];
    }
  | { documentType: "B3_MOVEMENT_XLSX"; movements: Movement[]; count: number };
type Item = {
  file: File;
  preview?: Preview;
  error?: string;
  referenceDate?: string;
};
type MutationResponse = { message?: string };
type ConfirmationItem = Item & { preview: Preview };
type ConfirmationResult =
  | { status: "success"; item: ConfirmationItem; message: string }
  | {
      status: "failure";
      item: ConfirmationItem & { error: string };
      notification: string;
    };
class ApiMessageError extends Error {}
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 });
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

function formatMoney(value: string | null) {
  return value === null ? "—" : money.format(Number(value));
}

export function PortfolioImport() {
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  async function send(file: File, endpoint: string, referenceDate?: string) {
    const form = new FormData();
    form.append("file", file);
    if (referenceDate) form.append("referenceDate", referenceDate);
    const response = await fetch(endpoint, { method: "POST", body: form });
    const body = (await response.json()) as MutationResponse & Preview;
    if (!response.ok)
      throw new ApiMessageError(
        getApiMessage(body, "Não foi possível ler o arquivo."),
      );
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
            error: "Prévia indisponível.",
            notification:
              error instanceof ApiMessageError
                ? `${file.name}: ${error.message}`
                : `${file.name}: Não foi possível comunicar com o servidor.`,
          };
        }
      }),
    );
    const previewFailures = results.flatMap((result) =>
      "notification" in result ? [result.notification] : [],
    );
    if (previewFailures.length > 0) toast.error(previewFailures.join(" · "));
    setItems(results.map(({ notification: _notification, ...item }) => item));
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
          const response = await send(
            item.file,
            "/api/imports/confirm",
            item.preview.documentType === "B3_POSITION_XLSX"
              ? item.referenceDate
              : undefined,
          );
          return {
            status: "success" as const,
            item,
            message: getApiMessage(response, "Arquivo importado com sucesso."),
          };
        } catch (error) {
          const message =
            error instanceof ApiMessageError
              ? error.message
              : "Não foi possível salvar o arquivo.";
          return {
            status: "failure" as const,
            item: {
              ...item,
              error: "Importação não concluída.",
            },
            notification: `${item.file.name}: ${message}`,
          };
        }
      }),
    );
    setLoading(false);
    const successes = results.filter(
      (result): result is Extract<ConfirmationResult, { status: "success" }> =>
        result.status === "success",
    );
    const failures = results.filter(
      (result): result is Extract<ConfirmationResult, { status: "failure" }> =>
        result.status === "failure",
    );
    if (successes.length > 0) {
      toast.success(successes.map((result) => result.message).join(" · "));
      window.dispatchEvent(new Event("portfolio:updated"));
    }
    if (failures.length > 0)
      toast.error(failures.map((result) => result.notification).join(" · "));
    setItems(failures.map((result) => result.item));
  }

  const hasMissingPositionReferenceDate = items.some(
    (item) =>
      item.preview?.documentType === "B3_POSITION_XLSX" && !item.referenceDate,
  );
  const hasIdentityConflicts = items.some(
    (item) =>
      item.preview?.documentType === "B3_POSITION_XLSX" &&
      Boolean(item.preview.identityConflicts?.length),
  );

  function updateReferenceDate(file: File, referenceDate: string) {
    setItems((current) =>
      current.map((item) =>
        item.file === file ? { ...item, referenceDate } : item,
      ),
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-6">
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
      <div className="space-y-5">
        <div className="flex flex-col gap-4 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <FileSpreadsheet aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Importação da B3
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Selecione os arquivos para revisar
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A importação só é concluída depois da sua confirmação.
              </p>
            </div>
          </div>
          <Button
            className="w-full shrink-0 sm:w-auto"
            disabled={loading}
            onClick={() => input.current!.click()}
          >
            <Upload aria-hidden="true" className="size-4" />
            Importar arquivos XLSX
          </Button>
        </div>

        {loading && (
          <p role="status" aria-live="polite" className="text-sm text-primary">
            Lendo arquivos...
          </p>
        )}
        {items.length === 0 && !loading ? (
          <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed px-5 py-6 text-center">
            <FileSpreadsheet
              aria-hidden="true"
              className="size-6 text-muted-foreground"
            />
            <p className="mt-2 text-sm font-medium">A prévia aparecerá aqui</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Selecione uma ou mais planilhas. Você poderá revisar posições e
              movimentações antes de confirmar.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {items.map((item) => (
              <PreviewItem
                key={`${item.file.name}-${item.file.lastModified}`}
                item={item}
                onReferenceDateChange={updateReferenceDate}
              />
            ))}
          </div>
        )}
        {items.some((item) => item.preview) && (
          <div className="flex flex-col justify-end gap-3 border-t pt-4 sm:flex-row">
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              disabled={loading}
              onClick={() => setItems([])}
            >
              Cancelar
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={
                loading ||
                hasMissingPositionReferenceDate ||
                hasIdentityConflicts
              }
              onClick={confirm}
            >
              {loading
                ? "Salvando..."
                : `Confirmar ${items.filter((item) => item.preview).length} arquivo(s)`}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function PreviewItem({
  item,
  onReferenceDateChange,
}: {
  item: Item;
  onReferenceDateChange: (file: File, referenceDate: string) => void;
}) {
  if (item.error)
    return (
      <p aria-live="polite" className="text-sm text-destructive">
        {item.file.name}: {item.error}
      </p>
    );
  if (!item.preview) return <p className="text-sm">{item.file.name}</p>;
  if (item.preview.documentType === "B3_POSITION_XLSX")
    return (
      <PositionPreview
        fileName={item.file.name}
        preview={item.preview}
        referenceDate={item.referenceDate ?? ""}
        onReferenceDateChange={(referenceDate) =>
          onReferenceDateChange(item.file, referenceDate)
        }
      />
    );

  return (
    <Card className="overflow-hidden shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-muted/20 p-4 sm:p-5">
        <div className="min-w-0">
          <CardTitle className="truncate text-base">{item.file.name}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Revise os dados extraídos antes de confirmar.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {item.preview.count} movimentação(ões)
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-64 overflow-auto">
          <Table aria-label="Prévia de movimentações" className="min-w-[48rem]">
            <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
              <TableRow>
                <TableHead scope="col" className="whitespace-nowrap">
                  Data
                </TableHead>
                <TableHead scope="col" className="whitespace-nowrap">
                  Tipo de movimentação
                </TableHead>
                <TableHead scope="col">Produto</TableHead>
                <TableHead scope="col" className="text-right">
                  Quantidade
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Valor da operação
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {item.preview.movements.map((record, index) => (
                <TableRow key={index}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {date.format(new Date(`${record.occurredAt}T00:00:00Z`))}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {record.movementType}
                  </TableCell>
                  <TableCell className="min-w-48 font-medium">
                    {record.product}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number.format(Number(record.quantity))}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                    {record.operationValue
                      ? money.format(Number(record.operationValue))
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function PositionPreview({
  fileName,
  preview,
  referenceDate,
  onReferenceDateChange,
}: {
  fileName: string;
  preview: Extract<Preview, { documentType: "B3_POSITION_XLSX" }>;
  referenceDate: string;
  onReferenceDateChange: (referenceDate: string) => void;
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
      <CardHeader className="gap-4 border-b bg-muted/20 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <FileSpreadsheet aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{fileName}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Revise os dados extraídos antes de confirmar.
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="w-fit">
            {preview.count} posição(ões)
          </Badge>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          <SummaryItem
            icon={CircleDollarSign}
            label="Total reconhecido"
            value={money.format(totalValue)}
          />
          <SummaryItem
            icon={Layers3}
            label="Posições com valor"
            value={`${valuedPositions.length} de ${preview.count}`}
          />
          <SummaryItem
            icon={Building2}
            label="Instituições"
            value={String(institutions.size)}
          />
        </dl>
        <div className="grid gap-2 sm:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] sm:items-end">
          <DatePickerField
            id={`reference-date-${fileName}`}
            label="Data exibida na B3 para estas posições"
            value={referenceDate}
            required
            onChange={onReferenceDateChange}
          />
          <p className="text-xs text-muted-foreground">
            Informe a data mostrada pela B3. Ela será usada para registrar os
            valores importados e para iniciar a estimativa dos CDBs no próximo
            dia CDI aplicável.
          </p>
        </div>
        {preview.identityConflicts?.length ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>
              Importação bloqueada por divergência de identidade
            </AlertTitle>
            <AlertDescription>
              <p>
                As posições atribuídas abaixo não aparecem com a mesma
                identidade no arquivo. Revise as diferenças antes de importar;
                nenhuma atribuição será transferida automaticamente.
              </p>
              <ul className="mt-2 list-disc space-y-2 pl-5">
                {preview.identityConflicts.map((conflict) => (
                  <li key={conflict.assetKey}>
                    <span className="font-medium">
                      {conflict.position.product} — {conflict.objectiveName}
                    </span>
                    {conflict.possibleIncomingDifferences.length ? (
                      <ul className="mt-1 list-[circle] pl-5">
                        {conflict.possibleIncomingDifferences.map(
                          (candidate, index) => (
                            <li key={index}>
                              Possível posição correspondente (não vinculada):{" "}
                              {candidate.changedFields.join("; ")}
                            </li>
                          ),
                        )}
                      </ul>
                    ) : (
                      <span> — sem identidade correspondente no arquivo.</span>
                    )}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
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
        <div className="overflow-x-auto">
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
                      <Badge variant="outline">
                        {position.valuationSource}
                      </Badge>
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
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-background/60 p-3 sm:p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-1 truncate text-lg font-semibold tabular-nums sm:text-xl">
          {value}
        </dd>
      </div>
    </div>
  );
}
