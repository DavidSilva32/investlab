import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { MonthlyPortfolioReview as MonthlyPortfolioReviewData } from "@/backend/services/monthly-portfolio-review";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrencyCents } from "@/lib/portfolio-money";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const timestampFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

function formatMonth(value: string) {
  return monthFormatter.format(new Date(`${value}-01T00:00:00Z`));
}

function formatTimestamp(value: string) {
  return timestampFormatter.format(new Date(value));
}

function formatChange(value: string) {
  const cents = BigInt(value);
  return `${cents > 0n ? "+" : ""}${formatCurrencyCents(cents)}`;
}

function changedMethods(current: string[], previous: string[]) {
  if (current.length !== previous.length) return true;
  return current.some((method, index) => method !== previous[index]);
}

export function MonthlyPortfolioReview({
  review,
  selectedPeriod,
  loading,
  error,
  onPeriodChange,
  onRetry,
}: {
  review: MonthlyPortfolioReviewData | undefined;
  selectedPeriod: string | null;
  loading: boolean;
  error?: string;
  onPeriodChange: (period: string) => void;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold leading-none tracking-tight">
            Fechamento mensal
          </h2>
          <CardDescription>
            O que mudou entre os valores registrados na carteira.
          </CardDescription>
        </div>
        {review && review.availablePeriods.length > 0 && (
          <div className="grid min-w-40 gap-1.5">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor="monthly-review-period"
            >
              Mês do fechamento
            </label>
            <Select
              value={selectedPeriod ?? review.selectedPeriod ?? undefined}
              onValueChange={onPeriodChange}
            >
              <SelectTrigger id="monthly-review-period">
                <SelectValue placeholder="Escolha um mês" />
              </SelectTrigger>
              <SelectContent>
                {review.availablePeriods.map((period) => (
                  <SelectItem key={period} value={period}>
                    {formatMonth(period)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <p className="text-sm text-muted-foreground" role="status">
            Carregando fechamentos importados…
          </p>
        )}
        {error && (
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          </div>
        )}
        {!loading && !error && review?.status === "no_history" && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Ainda não há valores históricos de posições importadas ou manuais
            para comparar.
          </p>
        )}
        {!loading && !error && review?.status === "missing_snapshot" && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Não há um registro de posições para este mês.
          </p>
        )}
        {!loading && !error && review?.current && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SnapshotAmount
                title={
                  review.previous ? "Fechamento anterior" : "Último fechamento"
                }
                snapshot={review.previous ?? review.current}
              />
              {review.previous && (
                <SnapshotAmount
                  title="Fechamento selecionado"
                  snapshot={review.current}
                />
              )}
            </div>
            {review.status === "no_previous_close" && (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Ainda não há outro fechamento importado para comparar.
              </p>
            )}
            {review.status === "insufficient_values" && (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Faltam valores conhecidos em um dos fechamentos para calcular
                uma variação comparável.
              </p>
            )}
            {review.observedChangeCents !== null && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                {BigInt(review.observedChangeCents) < 0n ? (
                  <ArrowDownRight
                    aria-hidden="true"
                    className="size-5 shrink-0 text-muted-foreground"
                  />
                ) : BigInt(review.observedChangeCents) > 0n ? (
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-5 shrink-0 text-muted-foreground"
                  />
                ) : (
                  <Minus
                    aria-hidden="true"
                    className="size-5 shrink-0 text-muted-foreground"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {review.status === "partial"
                      ? "Diferença entre valores conhecidos"
                      : "Variação observada"}
                  </p>
                  <p className="font-semibold tabular-nums">
                    {formatChange(review.observedChangeCents)}
                  </p>
                </div>
              </div>
            )}
            {review.status === "partial" && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                {partialExplanation(review)} A diferença considera apenas os
                valores conhecidos.
              </p>
            )}
            <details className="group rounded-lg border px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium">
                Ver datas, fontes e limites
              </summary>
              <div className="mt-3 space-y-3 text-muted-foreground">
                {review.untrackedManualPositionCount > 0 && (
                  <p>
                    {review.untrackedManualPositionCount === 1
                      ? "1 posição manual"
                      : `${review.untrackedManualPositionCount} posições manuais`}{" "}
                    sem histórico anterior. Valores substituídos antes do
                    primeiro registro não podem ser recuperados.
                  </p>
                )}
                {review.previous && (
                  <p>
                    Fontes iguais:{" "}
                    {review.compositionCoverage === "equivalent"
                      ? "sim"
                      : "não comprovado"}
                    .
                    {review.gapMonths > 0 && (
                      <>
                        {" "}
                        Há {review.gapMonths}{" "}
                        {review.gapMonths === 1 ? "mês" : "meses"} sem
                        fechamento entre os períodos.
                      </>
                    )}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <SnapshotSources
                    title={
                      review.previous
                        ? "Período anterior"
                        : "Período selecionado"
                    }
                    snapshot={review.previous ?? review.current}
                  />
                  {review.previous && (
                    <SnapshotSources
                      title="Período selecionado"
                      snapshot={review.current}
                    />
                  )}
                </div>
                {review.previous &&
                  changedMethods(
                    review.previous.valuationMethods,
                    review.current.valuationMethods,
                  ) && (
                    <p>
                      Os critérios de avaliação registrados mudaram entre os
                      períodos.
                    </p>
                  )}
                {(review.current.valuationMethods.includes(
                  "MANUAL_CONVERTED",
                ) ||
                  review.previous?.valuationMethods.includes(
                    "MANUAL_CONVERTED",
                  )) && (
                  <p>
                    Para ativos em outra moeda, usamos o valor em reais
                    informado. Ele pode refletir uma cotação de data diferente.
                  </p>
                )}
                <p className="border-t pt-3">
                  {review.flowSeparation.explanation}
                </p>
              </div>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SnapshotAmount({
  title,
  snapshot,
}: {
  title: string;
  snapshot: NonNullable<MonthlyPortfolioReviewData["current"]>;
}) {
  return (
    <div className="min-w-0 rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <p className="mt-1 break-words text-lg font-semibold tabular-nums">
        {formatCurrencyCents(snapshot.knownValueCents)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {snapshot.valuedPositionCount} de {snapshot.positionCount} posições com
        valor conhecido
        {snapshot.unvaluedPositionCount > 0 &&
          ` · ${snapshot.unvaluedPositionCount} sem valor`}
      </p>
    </div>
  );
}

function SnapshotSources({
  title,
  snapshot,
}: {
  title: string;
  snapshot: NonNullable<MonthlyPortfolioReviewData["current"]>;
}) {
  return (
    <section className="min-w-0 space-y-1">
      <h3 className="font-medium text-foreground">{title}</h3>
      {snapshot.sourceReferences.map((reference, index) => (
        <p key={`${reference.source}-${reference.referenceDate}-${index}`}>
          {reference.source}: posição avaliada em{" "}
          {formatDate(reference.referenceDate)}
          {reference.recordedAt &&
            ` · ${reference.source === "Valor informado" ? "salvo" : "registro"} em ${formatTimestamp(reference.recordedAt)}`}
          {reference.importedAt &&
            ` · importada em ${formatTimestamp(reference.importedAt)}`}
        </p>
      ))}
      {snapshot.manualPositionDates.length > 0 && (
        <p>
          Datas dos valores manuais:{" "}
          {snapshot.manualPositionDates.map(formatDate).join(", ")}
        </p>
      )}
      {snapshot.manualConversionDates.length > 0 && (
        <p>
          Conversão para reais:{" "}
          {snapshot.manualConversionDates.map(formatDate).join(", ")}
        </p>
      )}
    </section>
  );
}

function partialExplanation(review: MonthlyPortfolioReviewData) {
  if (review.untrackedManualPositionCount > 0)
    return "O histórico manual ainda não cobre os dois períodos.";
  if (
    (review.current && review.current.unvaluedPositionCount > 0) ||
    (review.previous && review.previous.unvaluedPositionCount > 0)
  ) {
    return "Há posições sem valor conhecido.";
  }
  if (
    review.dateAlignment === "outdated" ||
    review.dateAlignment === "different_dates"
  ) {
    return "As datas de avaliação não coincidem.";
  }
  if (review.compositionCoverage === "changed")
    return "As fontes ou posições mudaram entre os períodos.";
  if (review.compositionCoverage === "unknown")
    return "Não foi possível confirmar todas as posições nos dois períodos.";
  if (review.gapMonths > 0)
    return "Faltam fechamentos em meses intermediários.";
  return "A cobertura da carteira não pode ser confirmada.";
}
