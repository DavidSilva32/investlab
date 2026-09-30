"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getApiMessage } from "@/lib/api-message";

type DocumentType = "B3_POSITION_XLSX" | "B3_MOVEMENT_XLSX";

type DeleteImportedDataButtonProps = {
  documentType: DocumentType;
  label: string;
};

export function DeleteImportedDataButton({
  documentType,
  label,
}: DeleteImportedDataButtonProps) {
  const [loading, setLoading] = useState(false);

  const remove = async () => {
    if (
      !window.confirm(
        `Excluir todas as ${label.toLowerCase()} importadas? Esta ação permitirá importar os mesmos arquivos novamente.`,
      )
    )
      return;
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
    } catch {
      toast.error("Não foi possível comunicar com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant="outline" size="sm" disabled={loading} onClick={remove}>
        <Trash2 aria-hidden="true" />
        {loading ? "Excluindo..." : `Excluir ${label}`}
      </Button>
    </div>
  );
}
