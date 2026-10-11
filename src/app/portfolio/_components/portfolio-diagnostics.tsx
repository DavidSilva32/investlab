"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  CircleHelp,
  Info,
  Layers,
  ListChecks,
  PiggyBank,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getPortfolioDiagnostics,
  type PortfolioDiagnostic,
  type PortfolioDiagnosticsInput,
} from "@/lib/portfolio-diagnostics";

const severityStyles = {
  missing: {
    label: "Dados incompletos",
    className:
      "border-status-warning/20 bg-status-warning/5 text-status-warning",
    icon: CircleAlert,
  },
  attention: {
    label: "Atenção",
    className:
      "border-status-warning/20 bg-status-warning/5 text-status-warning",
    icon: CircleAlert,
  },
  information: {
    label: "Informação",
    className: "border-primary/20 bg-primary/5 text-primary",
    icon: Info,
  },
};
const findingIcons = {
  values: Wallet,
  estimates: CircleAlert,
  classification: Layers,
  reserve: PiggyBank,
  allocation: Layers,
  maturity: CalendarDays,
};
const actionLabels = {
  positions: "Ver posições",
  classification: "Revisar classes",
  reserve: "Ver reserva",
  strategy: "Ver estratégia",
};

export function PortfolioDiagnostics({
  positionCount,
  onReviewClassification,
  ...input
}: PortfolioDiagnosticsInput & {
  positionCount: number;
  onReviewClassification?: (trigger: HTMLElement) => void;
}) {
  const findings = getPortfolioDiagnostics(input);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>
          <h2 className="flex items-center gap-2 text-base">
            <ListChecks className="size-4 text-primary" aria-hidden="true" />
            Revisão da carteira
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {positionCount === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
            <p className="text-sm text-muted-foreground">
              Adicione suas posições para começar.
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/imports">
                Importar posições{" "}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        ) : findings.length > 0 ? (
          <ul
            className="space-y-2"
            aria-label="Pontos para revisar na carteira"
          >
            {findings.map((finding) => (
              <DiagnosticRow
                key={finding.id}
                finding={finding}
                onReviewClassification={onReviewClassification}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
            Sem pontos de revisão nos dados disponíveis.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DiagnosticRow({
  finding,
  onReviewClassification,
}: {
  finding: PortfolioDiagnostic;
  onReviewClassification?: (trigger: HTMLElement) => void;
}) {
  const status = severityStyles[finding.severity];
  const Icon = findingIcons[finding.id];
  const StatusIcon = status.icon;
  return (
    <li className="motion-content-reveal flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${status.className}`}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 basis-36">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium">{finding.title}</p>
          {finding.count !== undefined && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums">
              {finding.count}
            </span>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label={`Entender: ${finding.title}`}
              >
                <CircleHelp
                  className="size-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="text-sm" align="end">
              {finding.detail}
            </PopoverContent>
          </Popover>
        </div>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <StatusIcon className="size-3" aria-hidden="true" />
          {status.label}
        </p>
      </div>
      {finding.action === "classification" && onReviewClassification ? (
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => onReviewClassification(event.currentTarget)}
        >
          {actionLabels[finding.action]}
        </Button>
      ) : (
        <Button variant="outline" size="sm" asChild>
          <Link href={finding.href ?? "/portfolio?panel=classification"}>
            {actionLabels[finding.action]}{" "}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Button>
      )}
    </li>
  );
}
