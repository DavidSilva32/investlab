"use client";

import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const fields = [
  {
    label: "Name",
    value: "InvestLab",
  },
  {
    label: "Description",
    value:
      "Consulta somente leitura de carteira, operações, objetivos, estratégia, simulações e cotações B3 no InvestLab.",
  },
] as const;

function CopyValueButton({ label, value }: { label: string; value: string }) {
  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado.`);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie o valor.");
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={copyValue}
      aria-label={`Copiar ${label}`}
      className="shrink-0"
    >
      <Copy aria-hidden="true" className="size-4" />
      <span>Copiar</span>
    </Button>
  );
}

export function McpConnectionValues({ endpoint }: { endpoint: string }) {
  return (
    <div className="space-y-3">
      {fields.map(({ label, value }) => (
        <div
          key={label}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 break-words text-sm font-medium text-foreground">
              {value}
            </p>
          </div>
          <CopyValueButton label={label} value={value} />
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Server URL
          </p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">
            {endpoint}
          </p>
        </div>
        <CopyValueButton label="URL do servidor" value={endpoint} />
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Authentication
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">OAuth</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            O servidor publica a configuração OAuth. Deixe os campos avançados
            no modo descoberto automaticamente.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <a href="/investlab-logo.png" download="investlab-logo.png">
            <Download aria-hidden="true" className="size-4" />
            Baixar ícone PNG
          </a>
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Este é o mesmo símbolo do InvestLab usado na navegação lateral. O PNG é
        opcional e tem menos de 10 KB; envie-o pelo botão “Choose icon”.
      </p>
    </div>
  );
}
