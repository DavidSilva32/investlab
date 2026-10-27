"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
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

type Kind = "INCOME" | "EXPENSE";
type Category = { id: string; kind: Kind; name: string; active: boolean };
type Entry = {
  id: string;
  kind: Kind;
  description: string;
  categoryId: string;
  categoryName: string;
  expectedAmount: string | null;
  expectedDate: string | null;
  actualAmount: string | null;
  actualDate: string | null;
};
export function FinancialEntryDialog({
  open,
  onOpenChange,
  categories,
  entry,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  entry: Entry | null;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<Kind>(entry?.kind ?? "EXPENSE");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [categoryId, setCategoryId] = useState(entry?.categoryId ?? "");
  const [expectedAmount, setExpectedAmount] = useState(
    entry?.expectedAmount ?? "",
  );
  const [expectedDate, setExpectedDate] = useState(entry?.expectedDate ?? "");
  const [actualAmount, setActualAmount] = useState(entry?.actualAmount ?? "");
  const [actualDate, setActualDate] = useState(entry?.actualDate ?? "");
  const [busy, setBusy] = useState(false);
  const expectedPairValid = Boolean(expectedAmount) === Boolean(expectedDate);
  const actualPairValid = Boolean(actualAmount) === Boolean(actualDate);
  const hasAmount = Boolean(expectedAmount || actualAmount);
  const available = categories.filter(
    (category) => category.kind === kind && category.active,
  );
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...(entry ? { id: entry.id } : {}),
        kind,
        description,
        categoryId,
        expectedAmount: expectedAmount ? Number(expectedAmount) : null,
        expectedDate: expectedDate || null,
        actualAmount: actualAmount ? Number(actualAmount) : null,
        actualDate: actualDate || null,
      };
      await apiRequest(
        "/api/financial-entries",
        { method: entry ? "PATCH" : "POST", body: JSON.stringify(payload) },
        "Não foi possível salvar o lançamento.",
      );
      toast.success(
        entry ? "Lançamento atualizado." : "Lançamento cadastrado.",
      );
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o lançamento.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {entry ? "Editar lançamento" : "Novo lançamento"}
          </DialogTitle>
          <DialogDescription>
            Registre o previsto, o realizado ou os dois valores com suas datas.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void save(event)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Movimento</Label>
              <Select
                value={kind}
                onValueChange={(value: Kind) => {
                  setKind(value);
                  setCategoryId("");
                }}
              >
                <SelectTrigger aria-label="Tipo de lançamento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">Entrada</SelectItem>
                  <SelectItem value="EXPENSE">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-description">Descrição</Label>
              <Input
                id="entry-description"
                required
                maxLength={120}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId} required>
              <SelectTrigger aria-label="Categoria">
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {available.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3 rounded-xl border p-4">
              <p className="text-sm font-medium">Previsto</p>
              <div className="space-y-2">
                <Label htmlFor="expected-amount">Valor (R$)</Label>
                <Input
                  id="expected-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={expectedAmount}
                  onChange={(event) => setExpectedAmount(event.target.value)}
                />
              </div>
              <DatePickerField
                id="expected-date"
                label="Data prevista"
                value={expectedDate}
                onChange={setExpectedDate}
              />
            </div>
            <div className="space-y-3 rounded-xl border p-4">
              <p className="text-sm font-medium">Realizado</p>
              <div className="space-y-2">
                <Label htmlFor="actual-amount">Valor (R$)</Label>
                <Input
                  id="actual-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={actualAmount}
                  onChange={(event) => setActualAmount(event.target.value)}
                />
              </div>
              <DatePickerField
                id="actual-date"
                label="Data realizada"
                value={actualDate}
                onChange={setActualDate}
              />
            </div>
          </div>
          {!expectedAmount && !actualAmount && (
            <p role="alert" className="text-sm text-destructive">
              Informe ao menos um valor e a data correspondente.
            </p>
          )}
          {expectedAmount && !expectedDate && (
            <p role="alert" className="text-sm text-destructive">
              Informe a data prevista para este valor.
            </p>
          )}
          {!expectedAmount && expectedDate && (
            <p role="alert" className="text-sm text-destructive">
              Informe o valor previsto para esta data.
            </p>
          )}
          {actualAmount && !actualDate && (
            <p role="alert" className="text-sm text-destructive">
              Informe a data realizada para este valor.
            </p>
          )}
          {!actualAmount && actualDate && (
            <p role="alert" className="text-sm text-destructive">
              Informe o valor realizado para esta data.
            </p>
          )}
          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between">
            <div>
              {entry && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await apiRequest(
                        `/api/financial-entries?id=${encodeURIComponent(entry.id)}`,
                        { method: "DELETE" },
                        "Não foi possível excluir o lançamento.",
                      );
                      toast.success("Lançamento excluído.");
                      onSaved();
                      onOpenChange(false);
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Não foi possível excluir o lançamento.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Excluir
                </Button>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                disabled={
                  busy ||
                  !hasAmount ||
                  !expectedPairValid ||
                  !actualPairValid ||
                  !categoryId
                }
              >
                {busy ? "Salvando…" : "Salvar lançamento"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
