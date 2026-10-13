"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getApiMessage } from "@/lib/api-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const initialPercentage = (value: string | null | undefined) => {
  if (value === null || value === undefined || value.trim() === "") {
    return "100";
  }
  const percentage = Number(value);
  return Number.isFinite(percentage) ? String(percentage) : "100";
};

type Props = {
  assetCode?: string;
  currentPercentage?: string | null;
  assetCodes?: string[];
  missingAssetCodes?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CdbRateConfiguration({
  assetCode,
  currentPercentage,
  assetCodes,
  missingAssetCodes = [],
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [percentage, setPercentage] = useState(() =>
    initialPercentage(currentPercentage),
  );
  const [saving, setSaving] = useState(false);
  const isMassAction = !assetCode;
  const targetAssetCodes = assetCodes ?? missingAssetCodes;

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/cdb-rates", {
        method: isMassAction ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          isMassAction
            ? { assetCodes: targetAssetCodes, cdiPercentage: percentage }
            : { assetCode, cdiPercentage: percentage },
        ),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        toast.error(
          getApiMessage(data, "Não foi possível salvar a configuração."),
        );
        return;
      }

      toast.success(getApiMessage(data, "Configuração salva com sucesso."));
      onOpenChange(false);
      window.dispatchEvent(new Event("portfolio:updated"));
      router.refresh();
    } catch {
      toast.error("Não foi possível comunicar com o servidor.");
    } finally {
      setSaving(false);
    }
  }

  if (isMassAction && !targetAssetCodes.length) return null;
  const actionLabel = isMassAction ? "Ajustar taxas" : "Ajustar taxa";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{actionLabel}</DialogTitle>
          <DialogDescription>
            {isMassAction
              ? `Informe a taxa do CDI para ${targetAssetCodes.length} CDBs DI/CDI.`
              : `Informe a taxa do CDI para o CDB ${assetCode}.`}
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-2 text-sm font-medium">
          {isMassAction ? "% do CDI para os CDBs" : "% do CDI"}
          <Input
            aria-label={
              isMassAction
                ? "% do CDI para os CDBs"
                : `% do CDI para ${assetCode}`
            }
            inputMode="decimal"
            value={percentage}
            onChange={(event) => setPercentage(event.target.value)}
          />
        </label>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={saving} onClick={save}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
