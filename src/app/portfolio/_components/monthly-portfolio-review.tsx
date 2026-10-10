import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Minus,
} from "lucide-react";
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

function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

function formatMonth(value: string) {
  return monthFormatter.format(new Date(`${value}-01T00:00:00Z`));
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
        {!loading &&
          !error &&
          (review?.untrackedManualPositionCount ?? 0) > 0 && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
              {review!.untrackedManualPositionCount} posição
              {review!.untrackedManualPositionCount === 1
                ? " manual"
                : "s manuais"}{" "}
              sem histórico de alterações. O último valor salvo entra a partir
              da data registrada; valores substituídos antes desse ponto não
              podem ser recuperados. Cada novo salvamento será guardado.
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
                {review.untrackedManualPositionCount > 0
                  ? "Comparação parcial: há posições manuais sem histórico completo; saldos anteriores não estão disponíveis."
                  : review.current.positionCount === 0 ||
                      review.previous?.positionCount === 0
                    ? "Comparação parcial: um dos fechamentos não tem posições registradas com valor conhecido. A diferença não representa toda a carteira."
                    : review.dateAlignment === "aligned"
                      ? "Comparação parcial. Há posições sem valor em pelo menos um dos fechamentos; a diferença não representa toda a carteira."
                      : "Comparação parcial; as datas das fontes precisam ser conferidas."}
              </p>
            )}
            {review.dateAlignment === "outdated" && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                Comparação parcial: pelo menos uma fonte não tem valor
                atualizado para o mês selecionado. Confira as datas exibidas.
              </p>
            )}
            {review.dateAlignment === "different_dates" && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                Comparação parcial: as fontes usam datas de referência
                diferentes. Confira as datas exibidas antes de comparar.
              </p>
            )}
            {review.gapMonths > 0 && (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <CalendarDays
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                Não há registro de posições para {review.gapMonths} mês
                {review.gapMonths === 1 ? "" : "es"} entre essas datas.
              </p>
            )}
            {review.previous &&
              changedMethods(
                review.previous.valuationMethods,
                review.current.valuationMethods,
              ) && (
                <p className="text-sm text-muted-foreground">
                  Os arquivos registram critérios de avaliação diferentes.
                </p>
              )}
            {(review.current.valuationMethods.includes("MANUAL_CONVERTED") ||
              review.previous?.valuationMethods.includes(
                "MANUAL_CONVERTED",
              )) && (
              <p className="text-sm text-muted-foreground">
                Ativos em outra moeda usam o valor em reais informado por você.
                A variação também pode refletir a cotação que você registrou.
              </p>
            )}
            <p className="border-t pt-3 text-sm text-muted-foreground">
              {review.flowSeparation.explanation}
            </p>
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
  const partial = snapshot.unvaluedPositionCount > 0;
  const formatDates = (dates: string[]) => dates.map(formatDate).join(", ");
  return (
    <div className="min-w-0 rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <p className="mt-1 break-words text-lg font-semibold tabular-nums">
        {formatCurrencyCents(snapshot.knownValueCents)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {snapshot.sourceReferences
          .map(({ source, referenceDate, recordedAt }) =>
            source === "Valor informado"
              ? `Último valor manual: em ${formatDate(referenceDate)}${recordedAt ? `, salvo em ${formatDate(recordedAt)}` : ""}`
              : `${source} · ${formatDate(referenceDate)}`,
          )
          .join(" · ")}
      </p>
      {snapshot.manualPositionDates.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Datas dos valores manuais: {formatDates(snapshot.manualPositionDates)}
        </p>
      )}
      {snapshot.manualConversionDates.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Conversão para reais em: {formatDates(snapshot.manualConversionDates)}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {snapshot.valuedPositionCount} de {snapshot.positionCount} posições com
        valor
        {partial && ` · ${snapshot.unvaluedPositionCount} sem valor`}
      </p>
    </div>
  );
}
