"use client";

import { useState } from "react";
import { Link2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { getApiMessage } from "@/lib/api-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

type Link = {
  manualAssetKey: string;
  importedAssetKey: string;
  manualProduct: string;
  effectiveFrom: string;
  recordedAt: string;
};

export function PositionReconciliation() {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Link | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/positions/reconciliation");
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          getApiMessage(body, "Não foi possível consultar os vínculos."),
        );
      setLinks(body.links);
    } catch {
      setError("Não foi possível consultar os vínculos.");
    } finally {
      setLoading(false);
    }
  }

  async function reverse(selected: Link) {
    setLoading(true);
    try {
      const response = await fetch("/api/positions/reconciliation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualAssetKey: selected.manualAssetKey }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          getApiMessage(body, "Não foi possível desfazer o vínculo."),
        );
      setLinks((current) =>
        current!.filter(
          (link) => link.manualAssetKey !== selected.manualAssetKey,
        ),
      );
      toast.success("Vínculo desfeito. Revise os valores das posições.");
      window.dispatchEvent(new Event("portfolio:updated"));
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Não foi possível desfazer o vínculo.",
      );
    } finally {
      setSelected(null);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" disabled={loading} onClick={load}>
        <Link2 aria-hidden="true" className="size-4" />
        {loading ? "Consultando vínculos..." : "Revisar vínculos manual ↔ B3"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {links && links.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Nenhuma posição manual vinculada à B3.
        </p>
      )}
      {links?.map((link) => (
        <Card key={link.manualAssetKey}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">{link.manualProduct}</p>
              <p className="text-xs text-muted-foreground">
                Valor atual pela B3 · Histórico manual preservado
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => setSelected(link)}
            >
              <Undo2 aria-hidden="true" className="size-4" />
              Desfazer vínculo
            </Button>
          </CardContent>
        </Card>
      ))}
      <AlertDialog
        open={selected !== null}
        onOpenChange={() => setSelected(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Separar estas posições?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirme que são investimentos ou contas distintos. A posição
              manual voltará a compor o total com seu último valor, que pode
              estar desatualizado. O histórico anterior será preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => reverse(selected!)}>
              Confirmar posições distintas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
