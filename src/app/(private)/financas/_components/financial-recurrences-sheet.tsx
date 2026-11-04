"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CircleStop, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  FinancialRecurrenceForm,
  type RecurrenceFormValues,
  type RecurrenceFormModel,
} from "@/app/(private)/financas/_components/financial-recurrence-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency } from "@/lib/utils";

type Kind = "INCOME" | "EXPENSE";
type Category = { id: string; kind: Kind; name: string; active: boolean };
type Recurrence = RecurrenceFormModel;
type RecurrenceOverview = { recurrences: Recurrence[] };
const frequencyLabel = (frequency: string) =>
  ({
    WEEKLY: "Semanal",
    BIWEEKLY: "Quinzenal",
    MONTHLY: "Mensal",
    BIMONTHLY: "A cada dois meses",
    QUARTERLY: "Trimestral",
    SEMIANNUALLY: "Semestral",
    YEARLY: "Anual",
  })[frequency] ?? "Periodicidade cadastrada";

export function FinancialRecurrencesSheet({
  open,
  onOpenChange,
  month,
  data,
  loading,
  error,
  retry,
  categories,
  onSaved,
  readOnly,
  editRecurrenceId,
  onEditRecurrenceHandled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  data?: RecurrenceOverview;
  loading: boolean;
  error: string | null;
  retry: () => void;
  categories: Category[];
  onSaved: () => void;
  readOnly: boolean;
  editRecurrenceId?: string | null;
  onEditRecurrenceHandled?: () => void;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState<Recurrence | null>(null);
  const [removing, setRemoving] = useState<Recurrence | null>(null);
  const [busy, setBusy] = useState(false);
  const requestedEditing = data?.recurrences?.find(
    (item) => item.id === editRecurrenceId,
  );
  const activeEditing =
    editing ??
    (open && !readOnly && requestedEditing ? requestedEditing : null);

  useEffect(() => {
    if (!open || !editRecurrenceId || readOnly || !data?.recurrences) return;
    if (!requestedEditing) return;
    onEditRecurrenceHandled?.();
  }, [
    data?.recurrences,
    editRecurrenceId,
    onEditRecurrenceHandled,
    open,
    requestedEditing,
    readOnly,
  ]);

  async function saveRecurrence(values: RecurrenceFormValues) {
    await apiRequest(
      "/api/financial-recurrences",
      { method: "PATCH", body: JSON.stringify(values) },
      "Não foi possível salvar a recorrência.",
    );
    toast.success("Recorrência atualizada.");
    setEditing(null);
    onSaved();
    void client.invalidateQueries({
      queryKey: queryKeys.finances.recurrences(month),
    });
  }

  async function removeRecurrence() {
    setBusy(true);
    try {
      const result = await apiRequest<{ action: "deleted" | "ended" }>(
        `/api/financial-recurrences?id=${encodeURIComponent(removing!.id)}`,
        { method: "DELETE" },
        "Não foi possível remover a recorrência.",
      );
      toast.success(
        result.action === "deleted"
          ? "Recorrência excluída."
          : "Recorrência encerrada. O histórico foi mantido.",
      );
      setRemoving(null);
      onSaved();
      void client.invalidateQueries({
        queryKey: queryKeys.finances.recurrences(month),
      });
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Não foi possível remover a recorrência.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reactivate(item: Recurrence) {
    try {
      await apiRequest(
        "/api/financial-recurrences",
        {
          method: "PATCH",
          body: JSON.stringify({
            ...item,
            categoryId: item.categoryId,
            active: true,
          }),
        },
        "Não foi possível reativar a recorrência.",
      );
      toast.success("Recorrência reativada.");
      onSaved();
      void client.invalidateQueries({
        queryKey: queryKeys.finances.recurrences(month),
      });
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Não foi possível reativar a recorrência.",
      );
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) {
          setEditing(null);
          setRemoving(null);
        }
      }}
    >
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-2xl"
      >
        <SheetHeader className="pr-8">
          <SheetTitle>Gerenciar recorrências</SheetTitle>
          <SheetDescription>
            Crie recorrências junto com o lançamento. Aqui você pode editar ou
            remover as existentes.
          </SheetDescription>
        </SheetHeader>
        <section className="mt-6 space-y-3">
          <h3 className="font-semibold">Recorrências cadastradas</h3>
          {error ? (
            <div className="rounded-lg border border-destructive/30 p-4">
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                onClick={retry}
              >
                Tentar novamente
              </Button>
            </div>
          ) : loading ? (
            <p
              className="rounded-lg border p-4 text-sm text-muted-foreground"
              role="status"
            >
              Carregando recorrências…
            </p>
          ) : data?.recurrences?.length ? (
            data.recurrences.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.kind === "INCOME" ? "Entrada" : "Saída"} ·{" "}
                    {formatCurrency(Number(item.amount))} ·{" "}
                    {frequencyLabel(item.frequency)}
                    {item.essential ? " · Essencial" : ""}
                    {!item.active ? " · Encerrada" : ""}
                  </p>
                </div>
                {!readOnly && (
                  <div className="flex gap-1">
                    {item.active ? (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Editar ${item.description}`}
                          onClick={() => setEditing(item)}
                        >
                          <Pencil aria-hidden="true" className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Excluir ${item.description}`}
                          onClick={() => setRemoving(item)}
                        >
                          <CircleStop
                            aria-hidden="true"
                            className="size-4 text-status-danger"
                          />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Reativar ${item.description}`}
                          onClick={() => void reactivate(item)}
                        >
                          <RotateCcw aria-hidden="true" className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Excluir ${item.description}`}
                          onClick={() => setRemoving(item)}
                        >
                          <CircleStop
                            aria-hidden="true"
                            className="size-4 text-status-danger"
                          />
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nenhuma recorrência cadastrada. Ative a opção de recorrência ao
              criar um lançamento.
            </p>
          )}
        </section>
        {!readOnly && (
          <Dialog
            open={Boolean(activeEditing)}
            onOpenChange={() => {
              setEditing(null);
              onEditRecurrenceHandled?.();
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Editar recorrência</DialogTitle>
                <DialogDescription>
                  Atualize os dados das próximas ocorrências.
                </DialogDescription>
              </DialogHeader>
              {activeEditing && (
                <FinancialRecurrenceForm
                  key={activeEditing.id}
                  month={month}
                  categories={categories}
                  editing={activeEditing}
                  onSave={saveRecurrence}
                  onCancelEdit={() => setEditing(null)}
                />
              )}
            </DialogContent>
          </Dialog>
        )}
        <AlertDialog
          open={Boolean(removing)}
          onOpenChange={(value) => !value && setRemoving(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir recorrência?</AlertDialogTitle>
              <AlertDialogDescription>
                {removing?.description}. Sem valores realizados, o modelo será
                excluído. Se houver histórico realizado, ele será encerrado e o
                histórico será mantido.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={(event) => {
                  event.preventDefault();
                  void removeRecurrence();
                }}
              >
                {busy ? "Removendo…" : "Excluir recorrência"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
