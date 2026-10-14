"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { getApiMessage } from "@/lib/api-message";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  manualInstitution: string | null;
  manualValue: string | null;
  importedProduct: string;
  importedInstitution: string | null;
  importedAssetCode: string | null;
  importedValue: string | null;
  effectiveFrom: string;
  recordedAt: string;
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatValue(value: string | null) {
  return value === null ? "Valor não informado" : money.format(Number(value));
}

export function PositionReconciliation() {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Link | null>(null);
  const [error, setError] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/positions/reconciliation");
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            getApiMessage(body, "Não foi possível carregar os vínculos ativos."),
          );
        if (!cancelled) setLinks(body.links);
      } catch {
        if (!cancelled)
          setError("Não foi possível carregar os vínculos ativos.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryAttempt]);

  async function reverse(link: Link) {
    setLoading(true);
    try {
      const response = await fetch("/api/positions/reconciliation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualAssetKey: link.manualAssetKey }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          getApiMessage(body, "Não foi possível desfazer o vínculo."),
        );
      setLinks((current) =>
        (current ?? []).filter(
          (entry) => entry.manualAssetKey !== link.manualAssetKey,
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
    <div className="space-y-2">
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 px-3 py-2">
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => setRetryAttempt((attempt) => attempt + 1)}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {loading && !links && (
        <p role="status" className="text-xs text-muted-foreground">
          Carregando vínculos ativos...
        </p>
      )}
      {links && links.length > 0 && (
        <Collapsible>
          <div className="rounded-lg border bg-muted/20 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {links.length} {links.length === 1 ? "vínculo ativo" : "vínculos ativos"} entre
                cadastro manual e B3
              </p>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="group"
                  aria-label="Revisar vínculos ativos"
                >
                  Revisar
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 transition-transform group-data-[state=open]:rotate-180"
                  />
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <ul className="mt-2 divide-y rounded-md border bg-card">
                {links.map((link) => (
                  <li
                    key={link.manualAssetKey}
                    className="flex flex-wrap items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0 text-xs">
                      <p className="font-medium">{link.manualProduct}</p>
                      <p className="text-muted-foreground">
                        Manual: {link.manualInstitution ?? "Instituição não informada"}
                        {" · "}{formatValue(link.manualValue)}
                      </p>
                      <p className="text-muted-foreground">
                        B3: {link.importedProduct} · {link.importedInstitution ?? "Instituição não informada"}
                        {" · Código: "}{link.importedAssetCode ?? "não informado"}
                        {" · "}{formatValue(link.importedValue)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      aria-label={`Desfazer vínculo entre ${link.manualProduct} e ${link.importedProduct}, código ${link.importedAssetCode ?? "não informado"}`}
                      onClick={() => setSelected(link)}
                    >
                      <Undo2 aria-hidden="true" className="size-4" />
                      Desfazer vínculo
                    </Button>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
      <AlertDialog open={selected !== null} onOpenChange={() => setSelected(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer este vínculo?</AlertDialogTitle>
            <AlertDialogDescription>
              A posição manual voltará a compor o total junto com a posição B3.
              O valor manual pode estar desatualizado; o histórico e o objetivo
              associados a ele serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => reverse(selected!)}>
              Desfazer vínculo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
