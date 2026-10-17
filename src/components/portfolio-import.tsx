"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import {
  Building2,
  ChevronDown,
  CircleDollarSign,
  ExternalLink,
  FileSpreadsheet,
  Layers3,
  Link2,
  Split,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { getApiMessage } from "@/lib/api-message";
import type { InstrumentKind } from "@/lib/instrument-kind";
import {
  TradingReconciliationReview,
  type B3ReconciliationSummary,
} from "@/components/trading-reconciliation-review";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  instrumentKind?: InstrumentKind;
  sourceType?: string | null;
  sourceSheet?: string;
  originalAssetCode?: string | null;
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
  direction?: string;
  assetCode?: string | null;
};
type TradingRecord = {
  side: "BUY" | "SELL";
  tradingDate: string;
  settlementDate: string | null;
  movementType: string;
  market: string | null;
  product: string;
  assetCode: string | null;
  originalAssetCode: string | null;
  institution: string | null;
  quantity: string;
  unitPrice: string | null;
  grossValue: string | null;
  fees: string | null;
  sourceRow: number;
};
type DuplicateCandidate = {
  identityFingerprint: string;
  sourceRows: number[];
  existingCount: number;
  occurrenceCount: number;
  status: "ambiguous";
};
export type ReconciliationCandidate = {
  manualAssetKey: string;
  importedAssetKey: string;
  status: "probable" | "unequivocal" | "conflict";
  manualUpdatedAt: string;
  manualProduct: string;
  importedProduct: string;
  manualAssetCode: string | null;
  importedAssetCode: string | null;
  manualInstitution: string | null;
  manualValue: string | null;
  importedValue: string | null;
  institution: string | null;
  valueDifferenceCents: string | null;
  closestValue: boolean;
};
type ReconciliationDecision = Pick<
  ReconciliationCandidate,
  "manualAssetKey" | "importedAssetKey" | "manualUpdatedAt"
> & { action: "link" | "separate" };
type ReconciliationGroup = {
  manualAssetKey: string;
  manualUpdatedAt: string;
  manualProduct: string;
  manualAssetCode: string | null;
  manualInstitution: string | null;
  manualValue: string | null;
  candidates: ReconciliationCandidate[];
};
type Preview =
  | {
      documentType: "B3_POSITION_XLSX";
      positions: Position[];
      count: number;
      duplicateImportMessage?: string;
      existingReferenceDate?: string | null;
      referenceDateNeedsSelection?: boolean;
      referenceDateConflict?: boolean;
      identityConflicts?: IdentityConflict[];
      reconciliationCandidates?: ReconciliationCandidate[];
    }
  | {
      documentType: "B3_MOVEMENT_XLSX";
      movements: Movement[];
      count: number;
    }
  | {
      documentType: "B3_TRADING_XLSX";
      trades: TradingRecord[];
      count: number;
      history: { complete: boolean; reasons: string[] };
      duplicateCandidates: DuplicateCandidate[];
      reconciliation: {
        candidates: unknown[];
        confirmed: unknown[];
        ambiguous: unknown[];
        unmatched: unknown[];
      };
      batchReconciliationPending: boolean;
    };
type Item = {
  file: File;
  preview?: Preview;
  error?: string;
  referenceDate?: string;
  reconciliationDecisions?: ReconciliationDecision[];
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

function groupReconciliationCandidates(
  candidates: ReconciliationCandidate[],
): ReconciliationGroup[] {
  const groups = new Map<string, ReconciliationGroup>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.manualAssetKey);
    if (group) group.candidates.push(candidate);
    else
      groups.set(candidate.manualAssetKey, {
        manualAssetKey: candidate.manualAssetKey,
        manualUpdatedAt: candidate.manualUpdatedAt,
        manualProduct: candidate.manualProduct,
        manualAssetCode: candidate.manualAssetCode,
        manualInstitution: candidate.manualInstitution,
        manualValue: candidate.manualValue,
        candidates: [candidate],
      });
  }
  return [...groups.values()];
}

export function PortfolioImport({
  readOnly = false,
}: {
  readOnly?: boolean;
} = {}) {
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [importCompleted, setImportCompleted] = useState(false);
  const [reconciliationSummary, setReconciliationSummary] =
    useState<B3ReconciliationSummary | null>(null);
  const [
    reconciliationSummaryUnavailable,
    setReconciliationSummaryUnavailable,
  ] = useState(false);

  async function send(
    file: File,
    endpoint: string,
    referenceDate?: string,
    reconciliationDecisions?: ReconciliationDecision[],
  ) {
    const form = new FormData();
    form.append("file", file);
    if (referenceDate) form.append("referenceDate", referenceDate);
    if (reconciliationDecisions?.length)
      form.append(
        "reconciliationDecisions",
        JSON.stringify(reconciliationDecisions),
      );
    const response = await fetch(endpoint, { method: "POST", body: form });
    const body = (await response.json()) as MutationResponse & Preview;
    if (!response.ok)
      throw new ApiMessageError(
        getApiMessage(body, "Não foi possível ler o arquivo."),
      );
    return body;
  }

  async function previewFiles(files: File[]) {
    if (files.length === 0) return;
    setImportCompleted(false);
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
            referenceDate:
              body.documentType === "B3_POSITION_XLSX"
                ? (body.existingReferenceDate ?? undefined)
                : undefined,
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
            item.reconciliationDecisions,
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
      setImportCompleted(true);
      toast.success(successes.map((result) => result.message).join(" · "));
      window.dispatchEvent(new Event("portfolio:updated"));
      if (
        successes.some(
          (result) => result.item.preview.documentType === "B3_TRADING_XLSX",
        )
      ) {
        try {
          const summaryResponse = await fetch("/api/imports");
          if (!summaryResponse.ok) throw new Error("summary unavailable");
          setReconciliationSummary(
            (await summaryResponse.json()) as B3ReconciliationSummary,
          );
          setReconciliationSummaryUnavailable(false);
        } catch {
          setReconciliationSummaryUnavailable(true);
        }
      }
    }
    if (failures.length > 0)
      toast.error(failures.map((result) => result.notification).join(" · "));
    setItems(failures.map((result) => result.item));
  }

  const hasMissingPositionReferenceDate = items.some(
    (item) =>
      item.preview?.documentType === "B3_POSITION_XLSX" && !item.referenceDate,
  );
  const hasReferenceDateConflict = items.some(
    (item) =>
      item.preview?.documentType === "B3_POSITION_XLSX" &&
      Boolean(item.preview.referenceDateConflict),
  );
  const hasIdentityConflicts = items.some(
    (item) =>
      item.preview?.documentType === "B3_POSITION_XLSX" &&
      Boolean(item.preview.identityConflicts?.length),
  );

  const hasUnresolvedReconciliation = items.some(
    (item) =>
      item.preview?.documentType === "B3_POSITION_XLSX" &&
      item.preview.reconciliationCandidates?.some(
        (candidate) =>
          !item.reconciliationDecisions?.some(
            (decision) =>
              decision.manualAssetKey === candidate.manualAssetKey &&
              decision.importedAssetKey === candidate.importedAssetKey,
          ),
      ),
  );

  function updateReconciliation(
    file: File,
    group: ReconciliationGroup,
    selectedImportedAssetKey: string | null,
  ) {
    setItems((current) =>
      current.map((item) =>
        item.file !== file
          ? item
          : {
              ...item,
              reconciliationDecisions: [
                ...(item.reconciliationDecisions ?? []).filter(
                  (decision) =>
                    decision.manualAssetKey !== group.manualAssetKey,
                ),
                ...group.candidates.map((candidate) => ({
                  manualAssetKey: candidate.manualAssetKey,
                  importedAssetKey: candidate.importedAssetKey,
                  manualUpdatedAt: candidate.manualUpdatedAt,
                  action:
                    candidate.importedAssetKey === selectedImportedAssetKey
                      ? ("link" as const)
                      : ("separate" as const),
                })),
              ],
            },
      ),
    );
  }

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
        disabled={readOnly}
        multiple
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => {
          if (readOnly) {
            event.target.value = "";
            return;
          }
          const files = Array.from(event.target.files ?? []);
          void previewFiles(files);
          event.target.value = "";
        }}
      />
      <div className="space-y-5">
        <div className="flex flex-col gap-4 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-background p-1 sm:size-16">
              <Image
                src="/brands/b3/logo-vibrante.png"
                alt="Logo da B3"
                width={64}
                height={64}
                className="size-full object-contain dark:hidden"
              />
              <Image
                src="/brands/b3/logo-negativo.png"
                alt="Logo da B3"
                width={64}
                height={64}
                className="hidden size-full object-contain dark:block"
              />
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
          {!readOnly && (
            <a
              href="https://www.investidor.b3.com.br/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Acessar Área do Investidor da B3
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          )}
          {!readOnly && (
            <Button
              className="w-full shrink-0 sm:w-auto"
              disabled={loading}
              onClick={() => input.current?.click()}
            >
              <Upload aria-hidden="true" className="size-4" />
              Importar arquivos XLSX
            </Button>
          )}
        </div>

        {loading && (
          <p role="status" aria-live="polite" className="text-sm text-primary">
            Lendo arquivos...
          </p>
        )}
        {items.length === 0 && !loading && importCompleted ? (
          <p
            role="status"
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm"
          >
            Importação concluída. Os registros permanecem disponíveis na
            carteira e no resumo de conciliação.
          </p>
        ) : items.length === 0 && !loading ? (
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
                readOnly={readOnly}
                onReferenceDateChange={updateReferenceDate}
                onReconciliationChange={updateReconciliation}
              />
            ))}
          </div>
        )}
        {reconciliationSummary && (
          <TradingReconciliationReview
            summary={reconciliationSummary}
            onSummaryChange={setReconciliationSummary}
          />
        )}
        {reconciliationSummaryUnavailable && (
          <Alert aria-live="polite">
            <AlertTitle>Negociações importadas</AlertTitle>
            <AlertDescription>
              O arquivo foi salvo, mas não foi possível atualizar o resumo de
              conciliação. Os vínculos não foram confirmados automaticamente.
            </AlertDescription>
          </Alert>
        )}
        {!readOnly && items.some((item) => item.preview) && (
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
                hasReferenceDateConflict ||
                hasIdentityConflicts ||
                hasUnresolvedReconciliation
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
  readOnly,
  onReferenceDateChange,
  onReconciliationChange,
}: {
  item: Item;
  readOnly: boolean;
  onReferenceDateChange: (file: File, referenceDate: string) => void;
  onReconciliationChange: (
    file: File,
    group: ReconciliationGroup,
    selectedImportedAssetKey: string | null,
  ) => void;
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
      <div className="space-y-3">
        <PositionPreview
          fileName={item.file.name}
          preview={item.preview}
          referenceDate={item.referenceDate ?? ""}
          reconciliationGroups={groupReconciliationCandidates(
            item.preview.reconciliationCandidates ?? [],
          )}
          reconciliationDecisions={item.reconciliationDecisions ?? []}
          readOnly={readOnly}
          onReconciliationChange={(group, selectedImportedAssetKey) =>
            onReconciliationChange(item.file, group, selectedImportedAssetKey)
          }
          onReferenceDateChange={(referenceDate) =>
            onReferenceDateChange(item.file, referenceDate)
          }
        />
      </div>
    );

  if (item.preview.documentType === "B3_TRADING_XLSX")
    return <TradingPreview fileName={item.file.name} preview={item.preview} />;

  return (
    <Card className="motion-content-reveal overflow-hidden shadow-sm">
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
        {item.preview.movements.some((record) => record.direction) && (
          <Alert className="m-4 mb-0">
            <AlertTitle>Créditos e débitos da B3</AlertTitle>
            <AlertDescription>
              A direção do lançamento é preservada. Um crédito ou débito, por si
              só, não é tratado como compra ou venda de ativo.
            </AlertDescription>
          </Alert>
        )}
        <div className="overflow-x-auto">
          <Table aria-label="Prévia de movimentações" className="min-w-[48rem]">
            <TableHeader className="bg-muted/90">
              <TableRow>
                <TableHead scope="col" className="whitespace-nowrap">
                  Data
                </TableHead>
                <TableHead scope="col" className="whitespace-nowrap">
                  Tipo de movimentação
                </TableHead>
                <TableHead scope="col" className="whitespace-nowrap">
                  Direção
                </TableHead>
                <TableHead scope="col">Produto</TableHead>
                <TableHead scope="col">Código</TableHead>
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
                  <TableCell className="whitespace-nowrap">
                    {record.direction ?? "—"}
                  </TableCell>
                  <TableCell className="min-w-48 font-medium">
                    {record.product}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {record.assetCode ?? "—"}
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

function TradingPreview({
  fileName,
  preview,
}: {
  fileName: string;
  preview: Extract<Preview, { documentType: "B3_TRADING_XLSX" }>;
}) {
  const duplicateCount = preview.duplicateCandidates.length;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);

  return (
    <Card className="motion-content-reveal overflow-hidden shadow-sm">
      <CardHeader className="gap-3 border-b bg-muted/20 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{fileName}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Confira as operações identificadas antes de importar.
            </p>
          </div>
          <Badge variant="secondary" className="w-fit shrink-0">
            {preview.count} negociações
          </Badge>
        </div>
        <Alert className="py-3">
          <AlertTitle>Histórico parcial</AlertTitle>
          <AlertDescription>
            A importação não comprova o histórico completo nem estima dados
            ausentes.
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-8 px-2"
                >
                  Detalhes do histórico
                  <ChevronDown
                    aria-hidden="true"
                    className={`size-4 transition-transform ${historyOpen ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 space-y-1">
                <p>
                  Este arquivo não informa todas as taxas nem a data de
                  liquidação. Compras e vendas continuam separadas dos snapshots
                  de posição.
                </p>
                {preview.batchReconciliationPending && (
                  <p>
                    A conciliação com movimentações será calculada após a
                    importação; qualquer vínculo continuará pendente de revisão.
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
          </AlertDescription>
        </Alert>
        {duplicateCount > 0 && (
          <Alert>
            <AlertTitle>Possíveis duplicidades para revisar</AlertTitle>
            <AlertDescription>
              {duplicateCount} grupo(s) com linhas possivelmente repetidas;
              todas as ocorrências foram preservadas.
              <Collapsible
                open={duplicatesOpen}
                onOpenChange={setDuplicatesOpen}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-8 px-2"
                  >
                    Ver linhas para revisar
                    <ChevronDown
                      aria-hidden="true"
                      className={`size-4 transition-transform ${duplicatesOpen ? "rotate-180" : ""}`}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {preview.duplicateCandidates.map((candidate, index) => (
                      <li key={`${candidate.sourceRows.join("-")}-${index}`}>
                        Linhas {candidate.sourceRows.join(", ")}:{" "}
                        {candidate.occurrenceCount} ocorrências
                        {candidate.existingCount > 0 &&
                          `, ${candidate.existingCount} já importadas`}
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            </AlertDescription>
          </Alert>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table aria-label="Prévia de negociações" className="min-w-[72rem]">
            <TableHeader className="bg-muted/90">
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Operação</TableHead>
                <TableHead>Mercado</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Instituição</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Preço unitário</TableHead>
                <TableHead className="text-right">Valor bruto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.trades.map((trade) => (
                <TableRow key={`${trade.sourceRow}-${trade.tradingDate}`}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {date.format(new Date(`${trade.tradingDate}T00:00:00Z`))}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {trade.side === "BUY" ? "Compra" : "Venda"}
                    <span className="block text-xs text-muted-foreground">
                      {trade.movementType}
                    </span>
                  </TableCell>
                  <TableCell>{trade.market ?? "—"}</TableCell>
                  <TableCell className="min-w-40">{trade.product}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {trade.assetCode ?? "—"}
                    {trade.originalAssetCode &&
                      trade.originalAssetCode !== trade.assetCode && (
                        <span className="block font-sans text-muted-foreground">
                          Original: {trade.originalAssetCode}
                        </span>
                      )}
                  </TableCell>
                  <TableCell>{trade.institution ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number.format(Number(trade.quantity))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(trade.unitPrice)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                    {formatMoney(trade.grossValue)}
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
  reconciliationGroups,
  reconciliationDecisions,
  readOnly,
  onReconciliationChange,
  onReferenceDateChange,
}: {
  fileName: string;
  preview: Extract<Preview, { documentType: "B3_POSITION_XLSX" }>;
  referenceDate: string;
  reconciliationGroups: ReconciliationGroup[];
  reconciliationDecisions: ReconciliationDecision[];
  readOnly: boolean;
  onReconciliationChange: (
    group: ReconciliationGroup,
    selectedImportedAssetKey: string | null,
  ) => void;
  onReferenceDateChange: (referenceDate: string) => void;
}) {
  const [expandedCandidates, setExpandedCandidates] = useState<string[]>([]);
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
    <Card className="motion-content-reveal overflow-hidden shadow-sm">
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
          {readOnly ||
          (preview.duplicateImportMessage &&
            !preview.referenceDateNeedsSelection) ? (
            <p className="text-sm text-muted-foreground">
              Data exibida na B3:{" "}
              {referenceDate
                ? date.format(new Date(`${referenceDate}T00:00:00Z`))
                : "não informada"}
            </p>
          ) : (
            <DatePickerField
              id={`reference-date-${fileName}`}
              label="Data exibida na B3 para estas posições"
              value={referenceDate}
              required
              onChange={onReferenceDateChange}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Informe a data mostrada pela B3. Ela será usada para registrar os
            valores importados e para iniciar a estimativa dos CDBs no próximo
            dia CDI aplicável.
          </p>
        </div>
        {preview.referenceDateNeedsSelection && !readOnly ? (
          <Alert aria-live="polite">
            <AlertTitle>Data ausente no snapshot legado</AlertTitle>
            <AlertDescription>
              Escolha a data exibida pela B3. Ela será registrada apenas porque
              as datas do arquivo e do snapshot estão vazias.
            </AlertDescription>
          </Alert>
        ) : null}
        {preview.referenceDateConflict ? (
          <Alert variant="destructive" aria-live="polite">
            <AlertTitle>Datas inconsistentes</AlertTitle>
            <AlertDescription>
              As datas do arquivo e do snapshot divergem. Atualize a prévia ou
              peça suporte antes de reprocessar este arquivo.
            </AlertDescription>
          </Alert>
        ) : null}
        {reconciliationGroups.length > 0 && (
          <section
            aria-labelledby={`candidate-review-${fileName}`}
            className="space-y-3 border-t pt-4"
          >
            <div>
              <h3
                id={`candidate-review-${fileName}`}
                className="text-sm font-semibold"
              >
                Correspondências possíveis
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Escolher uma vincula essa e marca as demais como distintas; a
                ordem não confirma identidade.
              </p>
            </div>
            {reconciliationGroups.map((group) => {
              const decisions = group.candidates.map((candidate) =>
                reconciliationDecisions.find(
                  (entry) =>
                    entry.manualAssetKey === candidate.manualAssetKey &&
                    entry.importedAssetKey === candidate.importedAssetKey,
                ),
              );
              const resolved = decisions.every(Boolean);
              const selectedImportedAssetKey =
                decisions.find((decision) => decision?.action === "link")
                  ?.importedAssetKey ?? null;
              const isExpanded = expandedCandidates.includes(
                group.manualAssetKey,
              );
              const visibleCandidates = group.candidates.slice(0, 3);
              const additionalCandidates = group.candidates.slice(3);
              const renderCandidate = (candidate: ReconciliationCandidate) => {
                const sharesInstitution =
                  Boolean(group.manualInstitution) &&
                  Boolean(candidate.institution) &&
                  group.manualInstitution?.trim().toLocaleUpperCase("pt-BR") ===
                    candidate.institution?.trim().toLocaleUpperCase("pt-BR");
                return (
                  <li
                    key={candidate.importedAssetKey}
                    className={`flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between ${candidate.closestValue ? "border-l-2 border-l-primary bg-primary/5" : ""}`}
                  >
                    <div className="min-w-0 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 break-words font-medium">
                          {candidate.importedProduct}
                        </p>
                        {candidate.closestValue && (
                          <Badge className="border-primary/30 bg-primary/10 text-primary">
                            Valor mais próximo
                          </Badge>
                        )}
                      </div>
                      <p
                        className={`break-words text-xs ${sharesInstitution ? "font-medium text-primary" : "text-muted-foreground"}`}
                      >
                        {candidate.institution ?? "Instituição não informada"}
                        {" · "}Código: {candidate.importedAssetCode ?? "—"}
                      </p>
                      <p className="font-medium tabular-nums">
                        {formatMoney(candidate.importedValue)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="w-full shrink-0 sm:w-auto"
                      variant={
                        selectedImportedAssetKey === candidate.importedAssetKey
                          ? "default"
                          : "outline"
                      }
                      aria-pressed={
                        selectedImportedAssetKey === candidate.importedAssetKey
                      }
                      disabled={readOnly}
                      aria-label={
                        "Usar " +
                        candidate.importedProduct +
                        ", código " +
                        (candidate.importedAssetCode ?? "não informado") +
                        ", valor " +
                        formatMoney(candidate.importedValue) +
                        ", como a mesma posição de " +
                        group.manualProduct
                      }
                      onClick={() =>
                        onReconciliationChange(
                          group,
                          candidate.importedAssetKey,
                        )
                      }
                    >
                      <Link2 aria-hidden="true" className="size-4" />
                      Mesma posição
                    </Button>
                  </li>
                );
              };
              return (
                <Card key={group.manualAssetKey} className="border-primary/20">
                  <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Link2
                        aria-hidden="true"
                        className="size-4 text-primary"
                      />
                      <span className="min-w-0 break-words">
                        {group.manualProduct}
                      </span>
                      <Badge variant="secondary">Manual</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 p-3 pt-0 sm:p-4 sm:pt-0">
                    <p className="break-words text-xs text-muted-foreground">
                      {group.manualInstitution ?? "Instituição não informada"}
                      {" · "}Código: {group.manualAssetCode ?? "—"}
                      {" · "}
                      {formatMoney(group.manualValue)}
                    </p>
                    <ul className="divide-y rounded-md border">
                      {visibleCandidates.map(renderCandidate)}
                    </ul>
                    {additionalCandidates.length > 0 && (
                      <Collapsible
                        open={isExpanded}
                        onOpenChange={(open) =>
                          setExpandedCandidates((current) =>
                            open
                              ? [...new Set([...current, group.manualAssetKey])]
                              : current.filter(
                                  (key) => key !== group.manualAssetKey,
                                ),
                          )
                        }
                      >
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="group h-auto min-h-9 px-2 text-primary"
                            aria-label={
                              isExpanded
                                ? "Ocultar candidatos adicionais"
                                : "Mostrar outros " +
                                  additionalCandidates.length +
                                  " candidatos"
                            }
                          >
                            <ChevronDown
                              aria-hidden="true"
                              className="size-4 transition-transform group-data-[state=open]:rotate-180"
                            />
                            {isExpanded
                              ? "Ocultar opções"
                              : "Mostrar outros " + additionalCandidates.length}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <ul className="mt-2 divide-y rounded-md border">
                            {additionalCandidates.map(renderCandidate)}
                          </ul>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                    <Button
                      size="sm"
                      aria-label={`Nenhuma posição da B3 corresponde a ${group.manualProduct}`}
                      variant={
                        resolved && selectedImportedAssetKey === null
                          ? "default"
                          : "outline"
                      }
                      aria-pressed={
                        resolved && selectedImportedAssetKey === null
                      }
                      disabled={readOnly}
                      onClick={() => onReconciliationChange(group, null)}
                    >
                      <Split aria-hidden="true" className="size-4" />
                      Nenhuma destas
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        )}
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
        {preview.duplicateImportMessage ? (
          <Alert aria-live="polite">
            <AlertTitle>Arquivo já importado</AlertTitle>
            <AlertDescription>
              {preview.duplicateImportMessage}
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
                <TableHead>Classe</TableHead>
                <TableHead>Tipo na B3</TableHead>
                <TableHead>Aba</TableHead>
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
                  <TableCell>
                    {position.instrumentKind ? (
                      <Badge variant="outline">
                        {
                          {
                            EQUITY: "Ação",
                            FII: "FII",
                            ETF: "ETF",
                            FIXED_INCOME: "Renda fixa",
                            INVESTMENT_FUND: "Fundo de investimento",
                            UNKNOWN: "Não identificado",
                          }[position.instrumentKind]
                        }
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{position.sourceType ?? "—"}</TableCell>
                  <TableCell>{position.sourceSheet ?? "—"}</TableCell>
                  <TableCell>{position.institution ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {position.assetCode ?? "—"}
                    {position.originalAssetCode &&
                      position.originalAssetCode !== position.assetCode && (
                        <span className="block font-sans text-muted-foreground">
                          Original: {position.originalAssetCode}
                        </span>
                      )}
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
                <TableCell colSpan={10}>Total reconhecido no arquivo</TableCell>
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
