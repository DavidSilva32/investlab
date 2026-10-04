"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft, LoaderCircle, Search, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApiMessage } from "@/lib/api-message";
import { formatAmountInput, parseBrazilianAmount } from "@/lib/currency-input";
import {
  centsToDecimalString,
  formatCurrencyCents,
} from "@/lib/portfolio-money";
import { isFutureValuationDate, todayInSaoPaulo } from "@/lib/valuation-date";

type Objective = { id: string; name: string };

type BalanceReference = {
  objectiveId: string;
  amountCents: string;
  observedDate: string;
};

type Preview = {
  valuationDate: string;
  effectiveValuationDates: string[];
  optimal: boolean;
  exploredStates: number;
  stateLimit: number;
  canConfirm: boolean;
  allocation: Record<string, string | null>;
  expectedOwners: Record<string, string | null>;
  expectedValueCents: Record<string, string>;
  expectedValuationDates: Record<string, string | null>;
  expectedSourceFingerprint: string;
  objectives: Array<{
    objectiveId: string;
    name: string;
    observedBalanceCents: string;
    proposedValueCents: string;
    differenceCents: string;
    assetKeys: string[];
  }>;
  transfers: Array<{
    assetKey: string;
    product: string;
    assetCode: string | null;
    maturityAt: string | null;
    fromObjectiveId: string;
    fromObjectiveName: string;
    toObjectiveId: string;
    toObjectiveName: string;
    valueCents: string;
  }>;
  unassignedPositions: Array<{
    assetKey: string;
    product: string;
    valueCents: string;
  }>;
  unassignmentTransfers: Array<{
    assetKey: string;
    product: string;
    assetCode: string | null;
    maturityAt: string | null;
    fromObjectiveId: string;
    fromObjectiveName: string;
    valueCents: string;
  }>;
  preservedPositions?: Array<{
    assetKey: string;
    product: string;
    ownerObjectiveId: string | null;
    ownerObjectiveName: string | null;
    valueCents: string | null;
    reasons: Array<
      | { code: "value_unavailable"; limitation: string | null }
      | { code: "objective_balance_not_provided" }
    >;
  }>;
  limitations: string[];
};

type Props = {
  objectives: Objective[];
  balanceReferences?: BalanceReference[];
  onCancel: () => void;
  onCompleted: () => void;
};

const invalidAmountMessage = "Informe um saldo válido em reais.";
const previewErrorMessage = "Não foi possível buscar uma distribuição.";
const confirmErrorMessage = "Não foi possível confirmar a distribuição.";

function formatBalanceInput(value: string) {
  if (!value.trim()) return "";
  if (/\d/.test(value) && !/[1-9]/.test(value)) return "R$ 0,00";
  return formatAmountInput(value);
}

function parseCents(value: string) {
  const amount = parseBrazilianAmount(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? BigInt(cents) : null;
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return day + "/" + month + "/" + year;
}

export function PortfolioObjectiveOrganizer({
  objectives,
  balanceReferences = [],
  onCancel,
  onCompleted,
}: Props) {
  const latestReferences = useMemo(
    () =>
      new Map(
        balanceReferences.map((reference) => [
          reference.objectiveId,
          reference,
        ]),
      ),
    [balanceReferences],
  );
  const [valuationDate, setValuationDate] = useState(todayInSaoPaulo);
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(objectives.map((objective) => [objective.id, ""])),
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function collectBalances() {
    const balances: Array<{ objectiveId: string; amount: number }> = [];
    for (const objective of objectives) {
      const input = (amounts[objective.id] ?? "").trim();
      if (!input) continue;
      const cents = parseCents(input);
      if (cents === null) {
        setFormError(objective.name + ": " + invalidAmountMessage);
        return null;
      }
      balances.push({
        objectiveId: objective.id,
        amount: Number(centsToDecimalString(cents)),
      });
    }
    if (!valuationDate) {
      setFormError("Informe a data comum da consulta ao banco.");
      return null;
    }
    if (isFutureValuationDate(valuationDate)) {
      setFormError("A data da consulta não pode estar no futuro.");
      return null;
    }
    if (balances.length === 0) {
      setFormError("Informe o saldo observado de pelo menos um objetivo.");
      return null;
    }
    setFormError(null);
    return balances;
  }

  async function searchAllocation() {
    const balances = collectBalances();
    if (!balances) return;
    setBusy(true);
    setPreview(null);
    try {
      const response = await fetch(
        "/api/portfolio/objectives/allocation/preview",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ valuationDate, balances }),
        },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(getApiMessage(body, previewErrorMessage));
        return;
      }
      setPreview(body as Preview);
    } catch {
      toast.error(previewErrorMessage);
    } finally {
      setBusy(false);
    }
  }

  async function confirmAllocation(acceptPartial = false) {
    const confirmedPreview = preview!;
    const balances = collectBalances()!;
    setBusy(true);
    try {
      const response = await fetch(
        "/api/portfolio/objectives/allocation/confirm",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            valuationDate,
            balances,
            allocation: confirmedPreview.allocation,
            expectedOwners: confirmedPreview.expectedOwners,
            expectedValueCents: confirmedPreview.expectedValueCents,
            expectedValuationDates: confirmedPreview.expectedValuationDates,
            expectedSourceFingerprint:
              confirmedPreview.expectedSourceFingerprint,
            ...(acceptPartial ? { acceptPartial: true } : {}),
          }),
        },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(getApiMessage(body, confirmErrorMessage));
        return;
      }
      toast.success(
        getApiMessage(body, "Distribuição dos objetivos atualizada."),
      );
      window.dispatchEvent(new Event("portfolio:updated"));
      onCompleted();
    } catch {
      toast.error(confirmErrorMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="objective-organizer-title" className="space-y-4">
      <Card className="shadow-none">
        <CardHeader className="space-y-1 pb-3">
          <CardTitle id="objective-organizer-title" className="text-base">
            Saldos observados no banco
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Informe o saldo atual de cada objetivo que deseja incluir.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 rounded-lg border bg-muted/20 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_15rem] md:items-end">
            <div className="space-y-1">
              <p className="text-sm font-medium">Saldos para comparar</p>
              <p className="text-xs text-muted-foreground">
                Deixe em branco os objetivos que não entram nesta distribuição.
              </p>
            </div>
            <DatePickerField
              id="objective-organizer-date"
              label="Data comum da consulta ao banco"
              value={valuationDate}
              onChange={(value) => {
                setValuationDate(value);
                setPreview(null);
                setFormError(null);
              }}
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {objectives.map((objective) => {
              const reference = latestReferences.get(objective.id);
              const inputId = "objective-balance-" + objective.id;
              return (
                <div
                  className="min-w-0 space-y-2 rounded-lg border bg-card p-3"
                  key={objective.id}
                >
                  <Label className="block" htmlFor={inputId}>
                    {objective.name}
                  </Label>
                  <Input
                    id={inputId}
                    inputMode="decimal"
                    placeholder="R$ 0,00"
                    value={amounts[objective.id] ?? ""}
                    aria-describedby={
                      reference ? inputId + "-reference" : undefined
                    }
                    onChange={(event) => {
                      setAmounts((current) => ({
                        ...current,
                        [objective.id]: formatBalanceInput(event.target.value),
                      }));
                      setPreview(null);
                      setFormError(null);
                    }}
                  />
                  {reference && (
                    <p
                      id={inputId + "-reference"}
                      className="text-xs text-muted-foreground"
                    >
                      Última referência:{" "}
                      {formatCurrencyCents(reference.amountCents)} em{" "}
                      {formatDate(reference.observedDate)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Estes saldos são referências informadas por você, não valores
            calculados pelo InvestLab. A distribuição matemática ajuda a
            organizar as posições, mas não comprova quais notas formam cada
            saldo no banco.
          </p>
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
            <Button
              type="button"
              onClick={() => void searchAllocation()}
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Search aria-hidden="true" />
              )}
              Buscar distribuição
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={busy}
            >
              Voltar
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <AllocationPreview
          preview={preview}
          busy={busy}
          onConfirm={(acceptPartial) => void confirmAllocation(acceptPartial)}
          onCancel={onCancel}
        />
      )}
    </section>
  );
}

function AllocationPreview({
  preview,
  busy,
  onConfirm,
  onCancel,
}: {
  preview: Preview;
  busy: boolean;
  onConfirm: (acceptPartial: boolean) => void;
  onCancel: () => void;
}) {
  const effectiveDates = [...new Set(preview.effectiveValuationDates)];
  return (
    <Card aria-label="Prévia da distribuição" className="shadow-none">
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Revise a distribuição</CardTitle>
          <Badge
            variant="outline"
            className={
              preview.optimal
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-status-warning/40 bg-status-warning/10 text-status-warning"
            }
          >
            {preview.optimal ? "Busca concluída" : "Busca parcial"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Comparação solicitada para {formatDate(preview.valuationDate)}.
          {effectiveDates.length > 0 && (
            <>
              {" "}
              Valores efetivamente disponíveis até{" "}
              {effectiveDates.map(formatDate).join(", ")}.
            </>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {(!preview.optimal || !preview.canConfirm) && (
          <Alert className="border-status-warning/40 bg-status-warning/5 [&>svg]:text-status-warning">
            <Shuffle aria-hidden="true" />
            <AlertTitle>
              {preview.optimal
                ? "Distribuição indisponível para confirmação"
                : "Busca parcial"}
            </AlertTitle>
            <AlertDescription>
              {preview.optimal
                ? "Esta prévia não pode ser confirmada. Consulte as limitações abaixo ou use a organização manual."
                : "A busca atingiu o limite de processamento. Esta candidata pode não ser a melhor distribuição global. Revise as diferenças e transferências; a confirmação exige sua autorização explícita."}
            </AlertDescription>
          </Alert>
        )}
        <section
          aria-label="Resumo por objetivo"
          className="overflow-hidden rounded-lg border"
        >
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Objetivo</TableHead>
                <TableHead className="text-right">Saldo informado</TableHead>
                <TableHead className="text-right">Total proposto</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.objectives.map((objective) => (
                <TableRow key={objective.objectiveId}>
                  <TableCell>
                    <h4 className="font-medium">{objective.name}</h4>
                    <span className="text-xs text-muted-foreground">
                      {objective.assetKeys.length} posições
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrencyCents(objective.observedBalanceCents)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatCurrencyCents(objective.proposedValueCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrencyCents(objective.differenceCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
        {preview.transfers.length > 0 && (
          <section
            aria-labelledby="allocation-transfers-title"
            className="space-y-2"
          >
            <h4
              id="allocation-transfers-title"
              className="text-sm font-semibold"
            >
              Posições que serão transferidas
            </h4>
            <ul className="space-y-2">
              {preview.transfers.map((transfer) => (
                <li
                  key={transfer.assetKey}
                  className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <span className="min-w-0">
                    <span className="block break-words font-medium">
                      {transfer.product}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {transfer.assetCode ?? "Código não informado"}
                      {transfer.maturityAt
                        ? " · vence em " + formatDate(transfer.maturityAt)
                        : " · vencimento não informado"}
                    </span>
                    <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <ArrowRightLeft aria-hidden="true" className="size-3.5" />
                      {transfer.fromObjectiveName} → {transfer.toObjectiveName}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums sm:text-right">
                    {formatCurrencyCents(transfer.valueCents)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {(preview.preservedPositions?.length ?? 0) > 0 && (
          <section
            aria-labelledby="allocation-preserved-title"
            className="space-y-2"
          >
            <div>
              <h4
                id="allocation-preserved-title"
                className="text-sm font-semibold"
              >
                Posições preservadas fora da otimização
              </h4>
              <p className="text-xs text-muted-foreground">
                Estas posições mantêm seu destino atual e não participam da
                busca.
              </p>
            </div>
            <ul className="space-y-2">
              {preview.preservedPositions?.map((position) => (
                <li
                  key={position.assetKey}
                  className="space-y-2 rounded-lg border p-3 text-sm"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="min-w-0 flex-1 break-all font-medium">
                      {position.assetKey}
                    </span>
                    <span className="text-muted-foreground">
                      {position.product}
                    </span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {position.ownerObjectiveName
                        ? "Objetivo atual: " + position.ownerObjectiveName
                        : "Sem objetivo atual"}
                    </span>
                    <span>
                      {position.valueCents === null
                        ? "Valor não disponível"
                        : "Valor canônico: " +
                          formatCurrencyCents(position.valueCents)}
                    </span>
                  </div>
                  <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                    {position.reasons.map((reason, index) => (
                      <li key={position.assetKey + "-" + index}>
                        {reason.code === "value_unavailable"
                          ? "Fora da otimização porque o valor não está disponível."
                          : "O saldo de referência desse objetivo não foi informado; a posição foi preservada."}
                        {reason.code === "value_unavailable" &&
                          reason.limitation &&
                          " " + reason.limitation}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section
          aria-labelledby="allocation-unassigned-title"
          className="space-y-2"
        >
          <h4
            id="allocation-unassigned-title"
            className="text-sm font-semibold"
          >
            Sem objetivo
          </h4>
          {preview.unassignedPositions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todas as posições elegíveis foram distribuídas ou mantiveram seu
              destino.
            </p>
          ) : (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {preview.unassignedPositions.map((position) => (
                <li
                  key={position.assetKey}
                  className="flex justify-between gap-3"
                >
                  <span className="min-w-0 truncate">{position.product}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatCurrencyCents(position.valueCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {preview.limitations.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-status-warning/30 bg-status-warning/5 p-3 text-sm text-muted-foreground">
            {preview.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          A distribuição reorganiza os vínculos no InvestLab. Ela não identifica
          as notas originais de cada objetivo no aplicativo do banco.
        </p>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {preview.canConfirm && preview.optimal && (
            <Button
              type="button"
              onClick={() => onConfirm(false)}
              disabled={busy}
            >
              {busy && (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              )}
              Confirmar distribuição
            </Button>
          )}
          {preview.canConfirm && !preview.optimal && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" disabled={busy}>
                  Revisar confirmação parcial
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Aplicar esta candidata parcial?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    A busca não provou que esta é a melhor distribuição global.
                    Ao continuar, você aceita as diferenças abaixo e autoriza as
                    transferências listadas.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                  {preview.objectives.map((objective) => (
                    <li
                      className="flex flex-wrap justify-between gap-x-3"
                      key={objective.objectiveId}
                    >
                      <span>{objective.name}</span>
                      <span className="tabular-nums">
                        {formatCurrencyCents(objective.proposedValueCents)}
                        {" · diferença "}
                        {formatCurrencyCents(objective.differenceCents)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3 text-sm">
                  <p className="font-medium">
                    {preview.transfers.length === 0
                      ? "Nenhuma transferência"
                      : "Transferências autorizadas"}
                  </p>
                  {preview.transfers.map((transfer) => (
                    <p
                      className="flex flex-wrap justify-between gap-2"
                      key={transfer.assetKey}
                    >
                      <span>
                        {transfer.product} ({transfer.assetCode ?? "sem código"}
                        )
                        {transfer.maturityAt
                          ? " · vence em " + formatDate(transfer.maturityAt)
                          : ""}
                        {" · "}
                        {transfer.fromObjectiveName} →{" "}
                        {transfer.toObjectiveName}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatCurrencyCents(transfer.valueCents)}
                      </span>
                    </p>
                  ))}
                </div>
                {preview.unassignmentTransfers.length > 0 && (
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3 text-sm">
                    <p className="font-medium">
                      Posições que ficarão sem objetivo
                    </p>
                    {preview.unassignmentTransfers.map((position) => (
                      <p
                        className="flex flex-wrap justify-between gap-2"
                        key={position.assetKey}
                      >
                        <span>
                          {position.product} (
                          {position.assetCode ?? "sem código"})
                          {position.maturityAt
                            ? " · vence em " + formatDate(position.maturityAt)
                            : ""}
                          {" · "}
                          {position.fromObjectiveName} → Sem objetivo
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatCurrencyCents(position.valueCents)}
                        </span>
                      </p>
                    ))}
                  </div>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>
                    Voltar e revisar
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={busy}
                    onClick={() => onConfirm(true)}
                  >
                    {busy && (
                      <LoaderCircle
                        aria-hidden="true"
                        className="mr-2 size-4 animate-spin"
                      />
                    )}
                    Confirmar candidata parcial
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
