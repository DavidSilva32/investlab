"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  assetCode?: string;
  currentPercentage?: string | null;
  assetCodes?: string[];
  missingAssetCodes?: string[];
};

export function CdbRateConfiguration({
  assetCode,
  currentPercentage,
  assetCodes,
  missingAssetCodes = [],
}: Props) {
  const router = useRouter();
  const [percentage, setPercentage] = useState(currentPercentage ?? "100");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const isMassAction = !assetCode;
  const targetAssetCodes = assetCodes ?? missingAssetCodes;

  async function save() {
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/cdb-rates", {
      method: isMassAction ? "POST" : "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        isMassAction
          ? { assetCodes: targetAssetCodes, cdiPercentage: percentage }
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
          ? `${data.configured ?? 0} CDB(s) atualizado(s).`
          : "Taxa CDI atualizada."
        : (data.message ?? "Não foi possível salvar a configuração."),
    );
    if (response.ok) {
      setEditing(false);
      router.refresh();
    }
  }

  if (isMassAction && !targetAssetCodes.length) return null;
  const actionLabel = isMassAction ? "Ajustar taxas" : "Ajustar taxa";
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label={
        isMassAction ? "Configurar taxas dos CDBs" : `Configurar ${assetCode}`
      }
    >
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-1.5 px-2 text-muted-foreground"
        aria-label={actionLabel}
        aria-expanded={editing}
        onClick={() => setEditing((value) => !value)}
      >
        <Settings2 />
        <span className="hidden sm:inline">{actionLabel}</span>
      </Button>
      {editing && (
        <div className="flex w-full flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-2 sm:w-auto">
          <label className="grid min-w-28 gap-1 text-xs font-medium text-muted-foreground">
            {isMassAction ? "% do CDI para os CDBs" : "% do CDI"}
            <Input
              aria-label={
                isMassAction
                  ? "% do CDI para os CDBs"
                  : `% do CDI para ${assetCode}`
              }
              className="h-8 w-full"
              inputMode="decimal"
              value={percentage}
              onChange={(event) => setPercentage(event.target.value)}
            />
          </label>
          <Button type="button" size="sm" disabled={saving} onClick={save}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      )}
      {message && (
        <p className="basis-full text-xs text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
