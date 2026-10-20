"use client";

import { Copy, Download } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const fields = [
  {
    label: "Nome do servidor (Name)",
    feedbackLabel: "Nome do servidor",
    value: "InvestLab",
  },
  {
    label: "Descrição (Description)",
    feedbackLabel: "Descrição",
    value:
      "Consulta somente leitura de carteira, operações, objetivos, estratégia, simulações e cotações B3 no InvestLab.",
  },
] as const;

function CopyValueButton({
  feedbackLabel,
  value,
}: {
  feedbackLabel: string;
  value: string;
}) {
  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${feedbackLabel} copiado.`);
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
      aria-label={`Copiar ${feedbackLabel.toLocaleLowerCase("pt-BR")}`}
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
      {fields.map(({ label, feedbackLabel, value }) => (
        <div
          key={feedbackLabel}
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
          <CopyValueButton feedbackLabel={feedbackLabel} value={value} />
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Endereço do servidor (Server URL)
          </p>
          <p className="mt-1 break-all font-mono text-sm text-foreground">
            {endpoint}
          </p>
        </div>
        <CopyValueButton
          feedbackLabel="Endereço do servidor"
          value={endpoint}
        />
      </div>
      <div className="rounded-xl border border-border bg-background p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Autenticação (Authentication)
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">
          OAuth · descoberta automática
        </p>
      </div>
      <div className="grid gap-4 rounded-xl border border-primary/15 bg-primary/5 p-4 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center sm:p-5">
        <span className="grid size-16 place-items-center rounded-2xl border border-border bg-background p-2">
          <Image
            src="/investlab-logo.png"
            alt="Logo do InvestLab"
            width={48}
            height={48}
            unoptimized
          />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Ícone do servidor · opcional
          </p>
          <p className="mt-1 font-semibold text-foreground">
            Reconheça o InvestLab na sua lista
          </p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Baixe a imagem e envie pelo botão “Choose icon” no ChatGPT. É
            opcional; a conexão funciona sem ela.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <a href="/investlab-logo.png" download="investlab-logo.png">
            <Download aria-hidden="true" className="size-4" />
            Baixar logo do InvestLab
          </a>
        </Button>
      </div>
      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="font-semibold text-foreground">
          Escolha a autenticação OAuth
        </p>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          O ChatGPT encontra as configurações automaticamente. Deixe as opções
          avançadas no modo automático; você entrará no InvestLab para revisar e
          autorizar o acesso.
        </p>
      </div>
    </div>
  );
}
