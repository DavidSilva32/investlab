"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ChevronDown, Plus, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { getApiMessage } from "@/lib/api-message";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type Operation = {
  id: string;
  side: "BUY" | "SELL";
  effectiveDate: string;
  product: string;
  assetCode: string | null;
  quantity: string;
  unitPrice: string;
  currency: string;
  fees: string | null;
};
type Movement = {
  id: string;
  occurredAt: string;
  movementType: string;
  product: string;
  assetCode: string | null;
  quantity: string;
  unitPrice: string | null;
  operationValue: string | null;
  direction: string;
};
type Candidate = {
  operationId: string;
  movementId: string;
  operationSide: "BUY" | "SELL";
  operationProduct: string;
  operationAssetCode: string | null;
  operationQuantity: string;
  operationUnitPrice: string;
  operationCurrency: string;
  operationFees: string | null;
  movement: Movement;
  monetaryValuesComparable: false;
  limitation: string;
};
type Data = {
  operations: Operation[];
  movements: Movement[];
  pendingMovements: Movement[];
  candidates: Candidate[];
  links: Array<{ operationId: string; movementId: string }>;
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const money = (value: string, currency: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(
    Number(value),
  );
const rawAmount = (value: string | null) => value ?? "Não informado";
const sideLabel = (side: Operation["side"]) =>
  side === "BUY" ? "Compra" : "Venda";
class ClientSafeApiError extends Error {}
const emptyData: Data = {
  operations: [],
  movements: [],
  pendingMovements: [],
  candidates: [],
  links: [],
};

export function ManualPortfolioOperations({
  showTrigger = true,
  initiallyCollapsed = false,
}: {
  showTrigger?: boolean;
  initiallyCollapsed?: boolean;
}) {
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<Candidate | null>(null);
  const [unlinking, setUnlinking] = useState<{
    operationId: string;
    movementId: string;
  } | null>(null);
  const [form, setForm] = useState({
    side: "BUY",
    effectiveDate: "",
    product: "",
    assetCode: "",
    quantity: "",
    unitPrice: "",
    currency: "",
    fees: "",
  });
  const createAttempt = useRef<{ payload: string; key: string } | null>(null);
  const linkedByOperation = useMemo(
    () =>
      new Map(data.links.map((link) => [link.operationId, link.movementId])),
    [data.links],
  );

  const load = useCallback(async (): Promise<Data | ClientSafeApiError> => {
    try {
      const response = await fetch("/api/portfolio/operations");
      const body: unknown = await response.json();
      if (!response.ok)
        return new ClientSafeApiError(
          getApiMessage(
            body,
            "Não foi possível carregar as operações manuais.",
          ),
        );
      return body as Data;
    } catch {
      return new ClientSafeApiError(
        "Não foi possível carregar as operações manuais.",
      );
    }
  }, []);

  const refresh = useCallback(
    async (isActive: () => boolean = () => true) => {
      setLoading(true);
      try {
        const result = await load();
        if (!isActive()) return;
        if (result instanceof ClientSafeApiError) {
          setLoadError(result.message);
          return;
        }
        setData(result);
        setLoadError(null);
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [load],
  );

  useEffect(() => {
    let active = true;
    const refreshCurrent = () => void refresh(() => active);
    const openCreateDialog = () => setOpen(true);
    refreshCurrent();
    window.addEventListener("portfolio:updated", refreshCurrent);
    window.addEventListener(
      "portfolio:manual-operation:create",
      openCreateDialog,
    );
    return () => {
      active = false;
      window.removeEventListener("portfolio:updated", refreshCurrent);
      window.removeEventListener(
        "portfolio:manual-operation:create",
        openCreateDialog,
      );
    };
  }, [refresh]);

  const create = async () => {
    setSaving(true);
    try {
      const payload = JSON.stringify({
        side: form.side,
        effectiveDate: form.effectiveDate,
        product: form.product,
        assetCode: form.assetCode || null,
        quantity: form.quantity,
        unitPrice: form.unitPrice,
        currency: form.currency.toUpperCase(),
        fees: form.fees || null,
      });
      if (createAttempt.current?.payload !== payload) {
        createAttempt.current = { payload, key: crypto.randomUUID() };
      }
      const attempt = createAttempt.current;
      const response = await fetch("/api/portfolio/operations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.key,
        },
        body: payload,
      });
      const body: unknown = await response.json();
      if (!response.ok)
        throw new ClientSafeApiError(
          getApiMessage(body, "Não foi possível salvar a operação manual."),
        );
      toast.success("Operação manual registrada.");
      createAttempt.current = null;
      setOpen(false);
      setForm({
        side: "BUY",
        effectiveDate: "",
        product: "",
        assetCode: "",
        quantity: "",
        unitPrice: "",
        currency: "",
        fees: "",
      });
      void refresh();
    } catch (error) {
      toast.error(
        error instanceof ClientSafeApiError
          ? error.message
          : "Não foi possível salvar a operação manual.",
      );
    } finally {
      setSaving(false);
    }
  };

  const reconcile = async (
    operationId: string,
    movementId: string,
    action: "LINK" | "UNLINK",
  ) => {
    try {
      const response = await fetch("/api/portfolio/operations/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId, movementId, action }),
      });
      const body: unknown = await response.json();
      if (!response.ok)
        throw new ClientSafeApiError(
          getApiMessage(body, "Não foi possível atualizar a conciliação."),
        );
      toast.success(
        action === "LINK"
          ? "Vínculo confirmado e registrado no histórico."
          : "Vínculo desfeito; a operação e a movimentação foram preservadas.",
      );
      setDecision(null);
      setUnlinking(null);
      void refresh();
    } catch (error) {
      toast.error(
        error instanceof ClientSafeApiError
          ? error.message
          : "Não foi possível atualizar a conciliação.",
      );
    }
  };

  return (
    <>
      <Collapsible defaultOpen={!initiallyCollapsed}>
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/10 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CollapsibleTrigger
                aria-label="Registros manuais e conciliação"
                className="group flex min-h-10 min-w-0 items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div>
                  <CardTitle className="text-base">
                    Registros manuais e conciliação
                  </CardTitle>
                  <CardDescription>
                    Operações manuais não alteram posições ou cálculos de
                    rentabilidade.
                  </CardDescription>
                </div>
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
                />
              </CollapsibleTrigger>
              {showTrigger ? (
                <Button type="button" onClick={() => setOpen(true)}>
                  <Plus aria-hidden="true" />
                  Registrar operação
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-5 p-4 sm:p-6">
              {loading ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Carregando operações...
                </p>
              ) : null}
              {loadError ? (
                <Alert role="alert" variant="destructive">
                  <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>{loadError}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void refresh()}
                    >
                      Tentar novamente
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
              {!loading && !loadError && data.operations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma compra ou venda manual registrada.
                </p>
              ) : null}
              {data.operations.map((operation) => {
                const linkedMovementId = linkedByOperation.get(operation.id);
                const linkedMovement = linkedMovementId
                  ? data.movements.find(
                      (movement) => movement.id === linkedMovementId,
                    )
                  : null;
                return (
                  <div
                    key={operation.id}
                    className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {sideLabel(operation.side)}
                        </Badge>
                        <span className="font-medium">{operation.product}</span>
                        {operation.assetCode ? (
                          <span className="text-sm text-muted-foreground">
                            {operation.assetCode}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {dateFormatter.format(
                          new Date(`${operation.effectiveDate}T00:00:00Z`),
                        )}{" "}
                        · {operation.quantity} un. ·{" "}
                        {money(operation.unitPrice, operation.currency)}
                        {operation.fees !== null
                          ? ` · taxas ${money(operation.fees, operation.currency)}`
                          : ""}
                      </p>
                    </div>
                    {linkedMovementId ? (
                      <div className="flex items-center gap-2">
                        <Badge>Conciliada</Badge>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setUnlinking({
                              operationId: operation.id,
                              movementId: linkedMovementId,
                            })
                          }
                        >
                          <Unlink aria-hidden="true" />
                          Desfazer vínculo
                        </Button>
                        {linkedMovement ? (
                          <span className="sr-only">
                            {linkedMovement.product}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {data.candidates.length ? (
                <section
                  aria-labelledby="operation-candidates-title"
                  className="space-y-3 border-t pt-5"
                >
                  <div>
                    <h3
                      id="operation-candidates-title"
                      className="font-semibold"
                    >
                      Possíveis correspondências
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Data, identidade do ativo e quantidade coincidem. Cada
                      vínculo exige sua confirmação.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Tipo e direção da B3 são dados brutos; cada
                      correspondência é apenas uma sugestão para revisão humana,
                      não identifica compra ou venda.
                    </p>
                  </div>
                  {data.candidates.map((candidate) => (
                    <div
                      key={`${candidate.operationId}:${candidate.movementId}`}
                      className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[1fr_auto_1fr_auto] lg:items-center"
                    >
                      <div>
                        <p className="text-xs font-medium uppercase text-muted-foreground">
                          Registro manual
                        </p>
                        <p className="font-medium">
                          {sideLabel(candidate.operationSide)} ·{" "}
                          {candidate.operationProduct}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {candidate.operationQuantity} un. ·{" "}
                          {money(
                            candidate.operationUnitPrice,
                            candidate.operationCurrency,
                          )}
                        </p>
                      </div>
                      <ArrowLeftRight
                        aria-hidden="true"
                        className="hidden size-4 text-muted-foreground lg:block"
                      />
                      <div>
                        <p className="text-xs font-medium uppercase text-muted-foreground">
                          Movimentação B3 original
                        </p>
                        <p className="font-medium">
                          {candidate.movement.product}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {candidate.movement.direction} ·{" "}
                          {candidate.movement.movementType} ·{" "}
                          {candidate.movement.quantity} un.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDecision(candidate)}
                      >
                        Revisar e confirmar
                      </Button>
                      <p className="text-sm text-status-warning lg:col-span-4">
                        {candidate.limitation} Preço unitário B3:{" "}
                        {rawAmount(candidate.movement.unitPrice)}; valor
                        informado pela B3:{" "}
                        {rawAmount(candidate.movement.operationValue)}. Esses
                        valores não foram usados para decidir a correspondência.
                      </p>
                    </div>
                  ))}
                </section>
              ) : null}
              {!loading && data.pendingMovements.length ? (
                <p className="border-t pt-4 text-sm text-muted-foreground">
                  {data.pendingMovements.length === 1
                    ? "1 movimentação B3 continua sem vínculo manual."
                    : `${data.pendingMovements.length} movimentações B3 continuam sem vínculo manual.`}{" "}
                  Os registros originais permanecem na tabela abaixo; nenhuma
                  direção da B3 foi interpretada como compra ou venda.
                </p>
              ) : null}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Registrar compra ou venda</DialogTitle>
            <DialogDescription>
              Este registro documenta uma operação manual e não altera posições
              nem rentabilidade. Informe a moeda para manter preço e taxas com
              contexto.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="operation-side">Operação</Label>
              <Select
                value={form.side}
                onValueChange={(side) => setForm({ ...form, side })}
              >
                <SelectTrigger id="operation-side">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">Compra</SelectItem>
                  <SelectItem value="SELL">Venda</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="operation-date">Data efetiva</Label>
              <Input
                id="operation-date"
                type="date"
                value={form.effectiveDate}
                onChange={(event) =>
                  setForm({ ...form, effectiveDate: event.target.value })
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="operation-product">Ativo ou produto</Label>
              <Input
                id="operation-product"
                value={form.product}
                onChange={(event) =>
                  setForm({ ...form, product: event.target.value })
                }
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operation-code">Código do ativo (opcional)</Label>
              <Input
                id="operation-code"
                value={form.assetCode}
                onChange={(event) =>
                  setForm({ ...form, assetCode: event.target.value })
                }
                maxLength={24}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operation-quantity">Quantidade</Label>
              <Input
                id="operation-quantity"
                type="number"
                min="0.00000001"
                step="any"
                value={form.quantity}
                onChange={(event) =>
                  setForm({ ...form, quantity: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operation-unit-price">Preço unitário</Label>
              <Input
                id="operation-unit-price"
                type="number"
                min="0"
                step="any"
                value={form.unitPrice}
                onChange={(event) =>
                  setForm({ ...form, unitPrice: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operation-currency">Moeda (código ISO)</Label>
              <Input
                id="operation-currency"
                autoCapitalize="characters"
                placeholder="BRL"
                maxLength={3}
                value={form.currency}
                onChange={(event) =>
                  setForm({
                    ...form,
                    currency: event.target.value.toUpperCase(),
                  })
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="operation-fees">
                Taxas (opcional, na mesma moeda)
              </Label>
              <Input
                id="operation-fees"
                type="number"
                min="0"
                step="any"
                value={form.fees}
                onChange={(event) =>
                  setForm({ ...form, fees: event.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void create()}
            >
              {saving ? "Salvando..." : "Salvar operação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {decision ? (
        <ConfirmActionDialog
          open
          onOpenChange={() => setDecision(null)}
          hideTrigger
          title="Confirmar vínculo entre registros?"
          description={`Confirma que a operação ${sideLabel(decision.operationSide).toLocaleLowerCase("pt-BR")} “${decision.operationProduct}” e a movimentação B3 “${decision.movement.product}” representam o mesmo evento? O vínculo ficará no histórico. A B3 não informa a moeda, então os valores monetários não são comparáveis. Nenhum registro será substituído ou excluído.`}
          confirmLabel="Confirmar vínculo"
          onConfirm={() =>
            void reconcile(decision.operationId, decision.movementId, "LINK")
          }
        />
      ) : null}
      {unlinking ? (
        <ConfirmActionDialog
          open
          onOpenChange={() => setUnlinking(null)}
          hideTrigger
          title="Desfazer vínculo?"
          description="O vínculo será encerrado com registro de auditoria. A operação manual e a movimentação B3 permanecerão preservadas."
          confirmLabel="Desfazer vínculo"
          onConfirm={() =>
            void reconcile(
              unlinking.operationId,
              unlinking.movementId,
              "UNLINK",
            )
          }
        />
      ) : null}
    </>
  );
}
