"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

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
  const [error, setError] = useState<string>();

  const remove = async () => {
    if (
      !window.confirm(
        `Excluir todas as ${label.toLowerCase()} importadas? Esta ação permitirá importar os mesmos arquivos novamente.`,
      )
    )
      return;
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/imports?documentType=${documentType}`,
        {
          method: "DELETE",
        },
      );
      const body = await response.json();
      if (!response.ok) {
        setError(body.message ?? "Não foi possível excluir os dados.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Não foi possível comunicar com o servidor.");
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
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
