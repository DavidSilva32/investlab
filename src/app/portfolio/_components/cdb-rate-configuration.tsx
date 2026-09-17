"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  assetCode?: string;
  currentPercentage?: string | null;
  missingAssetCodes?: string[];
};

export function CdbRateConfiguration({
  assetCode,
  currentPercentage,
  missingAssetCodes = [],
}: Props) {
  const [percentage, setPercentage] = useState(currentPercentage ?? "100");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isMassAction = !assetCode;

  async function save() {
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/cdb-rates", {
      method: isMassAction ? "POST" : "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        isMassAction
          ? { assetCodes: missingAssetCodes, cdiPercentage: percentage }
          : { assetCode, cdiPercentage: percentage },
      ),
    });
    const data = (await response.json()) as {
      message?: string;
      configured?: number;
    };
    setSaving(false);
    setMessage(
      response.ok
        ? isMassAction
          ? `${data.configured ?? 0} CDB(s) configurado(s). Atualize a página para ver as estimativas.`
          : "Taxa CDI salva. Atualize a página para ver a estimativa."
        : (data.message ?? "Não foi possível salvar a configuração."),
    );
  }

  if (isMassAction && !missingAssetCodes.length) return null;
  return (
    <div
      className="flex flex-wrap items-end gap-2"
      aria-label={
        isMassAction ? "Configurar CDBs sem taxa" : `Configurar ${assetCode}`
      }
    >
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        {isMassAction ? "Percentual para CDBs sem taxa" : "% do CDI"}
        <Input
          aria-label={
            isMassAction
              ? "Percentual para CDBs sem taxa"
              : `% do CDI para ${assetCode}`
          }
          className="h-8 w-24"
          inputMode="decimal"
          value={percentage}
          onChange={(event) => setPercentage(event.target.value)}
        />
      </label>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={saving}
        onClick={save}
      >
        {saving ? "Salvando..." : isMassAction ? "Aplicar" : "Configurar taxa"}
      </Button>
      {message && (
        <p className="basis-full text-xs text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
