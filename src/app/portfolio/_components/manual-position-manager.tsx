"use client";

import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getApiMessage } from "@/lib/api-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AssetSubclassInput } from "@/components/ui/asset-subclass-input";
import {
  DatePickerField,
  getTodayDateIso,
} from "@/components/ui/date-picker-field";
import {
  portfolioAssetClassOptions,
  portfolioAssetGeographyOptions,
  portfolioAssetGeographyLabels,
  portfolioAssetGeographyHelpText,
} from "@/lib/portfolio-classification-options";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PortfolioPosition } from "./portfolio-overview";
import { formatCurrency, formatQuantity } from "@/lib/utils";
import {
  formatAmountInput,
  formatBrazilianAmountValue,
  getCurrencyInputSelection,
  parseBrazilianAmount,
  resolveCurrencyInputSelection,
  type CurrencyInputSelection,
} from "@/lib/currency-input";

type ManualPosition = PortfolioPosition & {
  source?: string;
  currency?: string;
  positionDate?: string;
  convertedValueBrl?: string | null;
  conversionDate?: string | null;
  valueBasis?: "unit_price" | "total_value";
  reportedTotalValue?: string | null;
  duplicateAssetCode?: boolean;
  classification?: {
    assetClass: string | null;
    subClass: string | null;
    geography: string | null;
  };
};

type FormValues = {
  product: string;
  assetClass: string;
  subClass: string;
  geography: string;
  assetCode: string;
  institution: string;
  quantity: string;
  currency: string;
  valueBasis: "unit_price" | "total_value";
  unitPrice: string;
  totalValue: string;
  positionDate: string;
  convertedValueBrl: string;
  conversionDate: string;
};

const emptyValues = (): FormValues => ({
  product: "",
  assetClass: "",
  subClass: "",
  geography: "__not_informed__",
  assetCode: "",
  institution: "",
  quantity: "1",
  currency: "BRL",
  valueBasis: "total_value",
  unitPrice: "",
  totalValue: "",
  positionDate: getTodayDateIso(),
  convertedValueBrl: "",
  conversionDate: "",
});

function fromPosition(position: ManualPosition): FormValues {
  return {
    product: position.product,
    assetClass: position.classification?.assetClass ?? "",
    subClass: position.classification?.subClass ?? "",
    geography: position.classification?.geography ?? "__not_informed__",
    assetCode: position.assetCode ?? "",
    institution: position.institution ?? "",
    quantity: position.quantity,
    currency: position.currency ?? "BRL",
    valueBasis: position.valueBasis ?? "total_value",
    unitPrice: position.unitPrice ?? "",
    totalValue: position.reportedTotalValue ?? position.totalValue ?? "",
    positionDate: position.positionDate ?? "",
    convertedValueBrl: position.convertedValueBrl ?? "",
    conversionDate: position.conversionDate ?? "",
  };
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
  step,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        required={required}
        step={step}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function currencyPrefix(currency: string) {
  if (currency === "BRL") return "R$ ";
  if (currency === "USD") return "US$ ";
  if (currency === "EUR") return "€ ";
  return `${currency} `;
}

function AmountField({
  id,
  label,
  value,
  onChange,
  prefix,
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  prefix: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<CurrencyInputSelection | null>(null);
  const displayValue = formatBrazilianAmountValue(value, prefix);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const selection = selectionRef.current;
    if (!input || !selection) return;
    const resolved = resolveCurrencyInputSelection(input.value, selection);
    input.setSelectionRange(resolved.start, resolved.end, resolved.direction);
    selectionRef.current = null;
  }, [displayValue]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={displayValue}
        required={required}
        onChange={(event) => {
          const rawValue = event.target.value;
          const nextValue = formatAmountInput(rawValue, prefix);
          const start = event.target.selectionStart!;
          const end = event.target.selectionEnd!;
          selectionRef.current = getCurrencyInputSelection(
            rawValue,
            nextValue,
            start,
            end,
            event.target.selectionDirection,
          );
          onChange(nextValue ? String(parseBrazilianAmount(nextValue)) : "");
        }}
      />
    </div>
  );
}

export function ManualPositionManager({
  positions,
}: {
  positions: PortfolioPosition[];
}) {
  const manualPositions = positions.filter(
    (position) => (position as ManualPosition).source === "MANUAL",
  ) as ManualPosition[];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ManualPosition | null>(null);
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [saving, setSaving] = useState(false);
  const [assetClassError, setAssetClassError] = useState(false);

  const set = (field: keyof FormValues, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  const startCreate = () => {
    setEditing(null);
    setValues(emptyValues());
    setOpen(true);
  };
  const startEdit = (position: ManualPosition) => {
    setEditing(position);
    setValues(fromPosition(position));
    setOpen(true);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!values.assetClass) {
      setAssetClassError(true);
      return;
    }
    setAssetClassError(false);
    setSaving(true);
    const payload = {
      product: values.product,
      assetClass: values.assetClass,
      subClass: values.subClass.trim() || null,
      geography:
        values.geography === "__not_informed__" ? null : values.geography,
      assetCode: values.assetCode || null,
      institution: values.institution || null,
      quantity: Number(values.quantity),
      currency: values.currency,
      valueBasis: values.valueBasis,
      unitPrice:
        values.valueBasis === "unit_price" ? Number(values.unitPrice) : null,
      totalValue:
        values.valueBasis === "total_value" ? Number(values.totalValue) : null,
      positionDate: values.positionDate,
      convertedValueBrl:
        values.currency === "BRL" || !values.convertedValueBrl
          ? null
          : Number(values.convertedValueBrl),
      conversionDate:
        values.currency === "BRL" || !values.conversionDate
          ? null
          : values.conversionDate,
    };
    try {
      const response = await fetch("/api/positions/manual", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          editing ? { ...payload, id: editing.id } : payload,
        ),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(getApiMessage(body, "Não foi possível salvar a posição."));
        return;
      }
      toast.success(
        getApiMessage(
          body,
          editing ? "Posição atualizada." : "Posição adicionada.",
        ),
      );
      setOpen(false);
      window.dispatchEvent(new Event("portfolio:updated"));
    } catch {
      toast.error("Não foi possível salvar a posição.");
    } finally {
      setSaving(false);
    }
  };
  const remove = async (position: ManualPosition) => {
    if (!window.confirm(`Remover a posição ${position.product}?`)) return;
    try {
      const response = await fetch("/api/positions/manual", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: position.id }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(getApiMessage(body, "Não foi possível remover a posição."));
        return;
      }
      toast.success(getApiMessage(body, "Posição removida."));
      window.dispatchEvent(new Event("portfolio:updated"));
    } catch {
      toast.error("Não foi possível remover a posição.");
    }
  };

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Posições manuais</h3>
          <p className="text-sm text-muted-foreground">
            Registre ativos não importados. Valores em moeda estrangeira só
            entram no patrimônio após informar uma conversão para reais.
          </p>
        </div>
        <Button type="button" onClick={startCreate}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar posição
        </Button>
      </div>
      {manualPositions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma posição manual cadastrada.
        </p>
      ) : (
        <Collapsible>
          <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span>{manualPositions.length} posições manuais cadastradas</span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 transition-transform group-data-[state=open]:rotate-180"
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 max-h-96 divide-y overflow-y-auto rounded-md border px-3">
              {manualPositions.map((position) => (
                <li
                  key={position.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {position.product}{" "}
                      {position.assetCode && (
                        <span className="text-muted-foreground">
                          · {position.assetCode}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatQuantity(Number(position.quantity))} unidades ·{" "}
                      {position.reportedTotalValue
                        ? `${Number(position.reportedTotalValue).toLocaleString("pt-BR")} ${position.currency ?? "BRL"}`
                        : "valor não informado"}
                      {position.totalValue && position.currency !== "BRL"
                        ? ` · ${formatCurrency(Number(position.totalValue))} em reais (conversão em ${position.conversionDate ?? "data não informada"})`
                        : ""}
                      {position.positionDate
                        ? ` · valor de ${new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${position.positionDate}T00:00:00Z`))}`
                        : ""}
                    </p>
                    {position.duplicateAssetCode && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Código repetido em outra posição manual; confira se os
                        ativos são distintos.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {position.classification?.assetClass && (
                      <Badge variant="secondary">
                        {position.classification.assetClass}
                      </Badge>
                    )}
                    <Badge variant="outline">Manual</Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Editar ${position.product}`}
                      onClick={() => startEdit(position)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Remover ${position.product}`}
                      onClick={() => remove(position)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar posição" : "Adicionar posição manual"}
            </DialogTitle>
            <DialogDescription>
              Informe o valor e a data observados. O InvestLab não consulta
              cotação nem converte moeda automaticamente.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="manual-product"
                label="Ativo ou produto"
                placeholder="Ex.: Vanguard S&P 500 ETF"
                value={values.product}
                onChange={(value) => set("product", value)}
                required
              />
              <div className="space-y-2">
                <Label htmlFor="manual-asset-class">Classe</Label>
                <Select
                  value={values.assetClass}
                  onValueChange={(value) => {
                    setValues((current) => ({
                      ...current,
                      assetClass: value,
                      subClass: "",
                    }));
                    setAssetClassError(false);
                  }}
                >
                  <SelectTrigger
                    id="manual-asset-class"
                    aria-invalid={assetClassError}
                    aria-describedby={
                      assetClassError ? "manual-asset-class-error" : undefined
                    }
                  >
                    <SelectValue placeholder="Selecione uma classe" />
                  </SelectTrigger>
                  <SelectContent>
                    {portfolioAssetClassOptions.map((assetClass) => (
                      <SelectItem key={assetClass} value={assetClass}>
                        {assetClass}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assetClassError && (
                  <p
                    id="manual-asset-class-error"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    Selecione a classe da posição.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-sub-class">Subclasse</Label>
                <AssetSubclassInput
                  id="manual-sub-class"
                  name="subClass"
                  assetClass={values.assetClass}
                  value={values.subClass}
                  onChange={(value) => set("subClass", value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-geography">Geografia</Label>
                <Select
                  value={values.geography}
                  onValueChange={(value) => set("geography", value)}
                >
                  <SelectTrigger id="manual-geography">
                    <SelectValue placeholder="Não informado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__not_informed__">
                      Não informado
                    </SelectItem>
                    {portfolioAssetGeographyOptions.map((geography) => (
                      <SelectItem key={geography} value={geography}>
                        {portfolioAssetGeographyLabels[geography]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {portfolioAssetGeographyHelpText}
                </p>
              </div>
              <Field
                id="manual-ticker"
                label="Ticker ou código (opcional)"
                placeholder="Ex.: VOO"
                value={values.assetCode}
                onChange={(value) => set("assetCode", value)}
              />
              <Field
                id="manual-institution"
                label="Instituição (opcional)"
                value={values.institution}
                onChange={(value) => set("institution", value)}
              />
              <Field
                id="manual-quantity"
                label="Quantidade"
                type="number"
                step="any"
                value={values.quantity}
                onChange={(value) => set("quantity", value)}
                required
              />
              <div className="space-y-2">
                <Label htmlFor="manual-currency">Moeda</Label>
                <Select
                  value={values.currency}
                  onValueChange={(value) => set("currency", value)}
                >
                  <SelectTrigger id="manual-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">BRL · Real</SelectItem>
                    <SelectItem value="USD">USD · Dólar</SelectItem>
                    <SelectItem value="EUR">EUR · Euro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-value-basis">
                  Como informar o valor
                </Label>
                <Select
                  value={values.valueBasis}
                  onValueChange={(value: FormValues["valueBasis"]) =>
                    set("valueBasis", value)
                  }
                >
                  <SelectTrigger id="manual-value-basis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total_value">Valor total</SelectItem>
                    <SelectItem value="unit_price">
                      Preço por unidade
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {values.valueBasis === "unit_price" ? (
                <AmountField
                  id="manual-unit-price"
                  label={`Preço por unidade (${values.currency})`}
                  prefix={currencyPrefix(values.currency)}
                  value={values.unitPrice}
                  onChange={(value) => set("unitPrice", value)}
                  required
                />
              ) : (
                <AmountField
                  id="manual-total-value"
                  label={`Valor total (${values.currency})`}
                  prefix={currencyPrefix(values.currency)}
                  value={values.totalValue}
                  onChange={(value) => set("totalValue", value)}
                  required
                />
              )}
              <DatePickerField
                id="manual-position-date"
                label="Data do valor"
                value={values.positionDate}
                onChange={(value) => set("positionDate", value)}
                required
              />
              {values.currency !== "BRL" && (
                <>
                  <AmountField
                    id="manual-converted-value"
                    label="Valor convertido para BRL (opcional)"
                    prefix="R$ "
                    value={values.convertedValueBrl}
                    onChange={(value) => set("convertedValueBrl", value)}
                  />
                  <DatePickerField
                    id="manual-conversion-date"
                    label="Data da conversão"
                    value={values.conversionDate}
                    onChange={(value) => set("conversionDate", value)}
                  />
                </>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar posição"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
