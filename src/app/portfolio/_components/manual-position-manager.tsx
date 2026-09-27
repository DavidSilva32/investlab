"use client";

import { useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PortfolioPosition } from "./portfolio-overview";
import { formatCurrency, formatQuantity } from "@/lib/utils";

type ManualPosition = PortfolioPosition & {
  source?: string;
  currency?: string;
  positionDate?: string;
  convertedValueBrl?: string | null;
  conversionDate?: string | null;
  valueBasis?: "unit_price" | "total_value";
  reportedTotalValue?: string | null;
  duplicateAssetCode?: boolean;
};

type FormValues = {
  product: string;
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
  assetCode: "",
  institution: "",
  quantity: "1",
  currency: "BRL",
  valueBasis: "total_value",
  unitPrice: "",
  totalValue: "",
  positionDate: new Date().toISOString().slice(0, 10),
  convertedValueBrl: "",
  conversionDate: "",
});

function fromPosition(position: ManualPosition): FormValues {
  return {
    product: position.product,
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
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  step?: string;
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
        onChange={(event) => onChange(event.target.value)}
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
    setSaving(true);
    const payload = {
      product: values.product,
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
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      toast.success(editing ? "Posição atualizada." : "Posição adicionada.");
      setOpen(false);
      window.dispatchEvent(new Event("portfolio:updated"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a posição.",
      );
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
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      toast.success("Posição removida.");
      window.dispatchEvent(new Event("portfolio:updated"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível remover a posição.",
      );
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
        <ul className="divide-y">
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
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
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
                value={values.product}
                onChange={(value) => set("product", value)}
                required
              />
              <Field
                id="manual-ticker"
                label="Ticker ou código (opcional)"
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
                <Label>Moeda</Label>
                <Select
                  value={values.currency}
                  onValueChange={(value) => set("currency", value)}
                >
                  <SelectTrigger>
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
                <Label>Como informar o valor</Label>
                <Select
                  value={values.valueBasis}
                  onValueChange={(value: FormValues["valueBasis"]) =>
                    set("valueBasis", value)
                  }
                >
                  <SelectTrigger>
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
                <Field
                  id="manual-unit-price"
                  label={`Preço por unidade (${values.currency})`}
                  type="number"
                  step="any"
                  value={values.unitPrice}
                  onChange={(value) => set("unitPrice", value)}
                  required
                />
              ) : (
                <Field
                  id="manual-total-value"
                  label={`Valor total (${values.currency})`}
                  type="number"
                  step="any"
                  value={values.totalValue}
                  onChange={(value) => set("totalValue", value)}
                  required
                />
              )}
              <Field
                id="manual-position-date"
                label="Data do valor"
                type="date"
                value={values.positionDate}
                onChange={(value) => set("positionDate", value)}
                required
              />
              {values.currency !== "BRL" && (
                <>
                  <Field
                    id="manual-converted-value"
                    label="Valor convertido para BRL (opcional)"
                    type="number"
                    step="any"
                    value={values.convertedValueBrl}
                    onChange={(value) => set("convertedValueBrl", value)}
                  />
                  <Field
                    id="manual-conversion-date"
                    label="Data da conversão"
                    type="date"
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
