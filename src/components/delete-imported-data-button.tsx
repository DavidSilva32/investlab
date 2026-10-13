"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import { getApiMessage } from "@/lib/api-message";

type DocumentType = "B3_POSITION_XLSX" | "B3_MOVEMENT_XLSX";

type DeleteImportedDataButtonProps = {
  documentType: DocumentType;
  label: string;
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function DeleteImportedDataButton({
  documentType,
  label,
  hideTrigger = false,
  open,
  onOpenChange,
}: DeleteImportedDataButtonProps) {
  const [loading, setLoading] = useState(false);
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);
  const dialogOpen = open ?? internalDialogOpen;
  const setDialogOpen = (value: boolean) => {
    setInternalDialogOpen(value);
    onOpenChange?.(value);
  };

  const remove = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/imports?documentType=${documentType}`,
        {
          method: "DELETE",
        },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(getApiMessage(body, "Não foi possível excluir os dados."));
        return;
      }
      toast.success(getApiMessage(body, "Dados importados excluídos."));
      window.dispatchEvent(new Event("portfolio:updated"));
      setDialogOpen(false);
    } catch {
      toast.error("Não foi possível comunicar com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!hideTrigger && (
        <div className="flex flex-col items-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => setDialogOpen(true)}
          >
            <Trash2 aria-hidden="true" />
            {loading ? "Excluindo..." : `Excluir ${label}`}
          </Button>
        </div>
      )}
      <ConfirmActionDialog
        hideTrigger
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={`Excluir ${label.toLowerCase()}?`}
        description={`Todos os registros de ${label.toLowerCase()} serão excluídos. Você poderá importar esses arquivos novamente.`}
        confirmLabel="Confirmar exclusão"
        loading={loading}
        onConfirm={remove}
      />
    </>
  );
}
