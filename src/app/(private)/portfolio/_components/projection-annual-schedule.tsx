"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import type { ObjectiveProjectionResult } from "@/lib/objective-projection";

type Props = {
  result: Pick<ObjectiveProjectionResult, "horizonYears" | "months">;
};

export function ProjectionAnnualSchedule({ result }: Props) {
  const [requestedDetailYear, setRequestedDetailYear] = useState(1);
  const [monthlyDetailOpen, setMonthlyDetailOpen] = useState(false);
  const detailYear = Math.min(requestedDetailYear, result.horizonYears);
  const annualSchedule = Array.from(
    { length: result.horizonYears },
    (_, index) => {
      const year = index + 1;
      const months = result.months.filter((month) => month.year === year);
      const firstMonth = months[0]!;
      const lastMonth = months.at(-1)!;
      return {
        year,
        months,
        monthlyContribution: firstMonth.monthlyContribution,
        annualContribution: months.reduce(
          (total, month) => total + month.monthlyContribution,
          0,
        ),
        nominalAmount: lastMonth.nominalAmount,
        purchasingPowerAmount: lastMonth.purchasingPowerAmount,
      };
    },
  );
  const selectedYear = annualSchedule[detailYear - 1]!;

  return (
    <section aria-label="Evolução da projeção por ano" className="space-y-3">
      <h3 className="text-sm font-semibold">Evolução por ano</h3>
      <div className="max-h-80 overflow-auto rounded-md border">
        <Table
          aria-label="Evolução anual da projeção"
          className="min-w-[680px]"
        >
          <TableHeader>
            <TableRow>
              <TableHead>Ano</TableHead>
              <TableHead className="text-right">Aporte mensal</TableHead>
              <TableHead className="text-right">Aportes no ano</TableHead>
              <TableHead className="text-right">Patrimônio nominal</TableHead>
              <TableHead className="text-right">Poder de compra hoje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {annualSchedule.map((year) => (
              <TableRow key={year.year}>
                <TableCell className="font-medium">Ano {year.year}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(year.monthlyContribution)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(year.annualContribution)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCurrency(year.nominalAmount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(year.purchasingPowerAmount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Collapsible open={monthlyDetailOpen} onOpenChange={setMonthlyDetailOpen}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="projection-month-detail">Detalhar meses</Label>
          <Select
            value={String(detailYear)}
            onValueChange={(value) => setRequestedDetailYear(Number(value))}
          >
            <SelectTrigger
              id="projection-month-detail"
              aria-label="Ano para detalhamento mensal"
              className="w-36"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {annualSchedule.map(({ year }) => (
                <SelectItem key={year} value={String(year)}>
                  Ano {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-between px-2 text-muted-foreground [&[data-state=open]>svg]:rotate-180"
          >
            {monthlyDetailOpen ? "Ocultar meses" : "Ver evolução mensal"}
            <ChevronDown
              aria-hidden="true"
              className="size-4 transition-transform"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 overflow-auto rounded-md border">
          <Table
            aria-label={`Evolução mensal do ano ${detailYear}`}
            className="min-w-[520px]"
          >
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Aporte</TableHead>
                <TableHead className="text-right">Patrimônio nominal</TableHead>
                <TableHead className="text-right">
                  Poder de compra hoje
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedYear.months.map((month) => (
                <TableRow key={month.month}>
                  <TableCell className="font-medium">
                    Mês {((month.month - 1) % 12) + 1}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(month.monthlyContribution)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(month.nominalAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(month.purchasingPowerAmount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
