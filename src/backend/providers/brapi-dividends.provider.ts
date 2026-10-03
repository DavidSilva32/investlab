import { z } from "zod";

const responseSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            symbol: z.string(),
            data: z
              .object({
                cashDividends: z
                  .array(
                    z
                      .object({
                        rate: z.number().finite().positive(),
                        paymentDate: z.string(),
                        label: z.string().optional(),
                      })
                      .passthrough(),
                  )
                  .optional(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

export type TwelveMonthDividends = {
  value: number | null;
  windowStart: string;
  windowEnd: string;
  observedPayments: number;
  coverageComplete: false;
  source: "BRAPI";
  unavailableReason: string | null;
};

function subtractYear(date: Date) {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() - 1);
  return next.toISOString().slice(0, 10);
}

function isCashDividend(label: string | undefined) {
  const normalized = label?.trim().toLocaleUpperCase("pt-BR");
  return normalized === "DIVIDENDO" || normalized === "JCP";
}

export class BrapiDividendsProvider {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiToken = process.env.BRAPI_TOKEN,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getLastTwelveMonths(ticker: string): Promise<TwelveMonthDividends> {
    const observedAt = this.now();
    const end = observedAt.toISOString().slice(0, 10);
    const start = subtractYear(observedAt);
    const unavailable = (
      reason: string,
      observedPayments = 0,
    ): TwelveMonthDividends => ({
      value: null,
      windowStart: start,
      windowEnd: end,
      observedPayments,
      coverageComplete: false,
      source: "BRAPI",
      unavailableReason: reason,
    });
    try {
      const url = new URL("https://brapi.dev/api/v2/stocks/dividends");
      url.searchParams.set("symbols", ticker);
      url.searchParams.set("startDate", start);
      url.searchParams.set("endDate", end);
      const response = await this.fetcher(url, {
        headers: this.apiToken
          ? { Authorization: `Bearer ${this.apiToken}` }
          : {},
      });
      if (!response.ok)
        return unavailable(
          "A consulta à BRAPI falhou; use uma fonte verificável ou tente mais tarde.",
        );
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success)
        return unavailable(
          "A resposta da BRAPI não trouxe eventos de proventos em formato reconhecido.",
        );
      const result = parsed.data.results.find(
        (item) => item.symbol.toUpperCase() === ticker.toUpperCase(),
      );
      if (!result)
        return unavailable("A BRAPI não retornou eventos para este ticker.");
      const payments = (result.data.cashDividends ?? []).filter(
        (payment) =>
          payment.paymentDate >= start &&
          payment.paymentDate <= end &&
          isCashDividend(payment.label),
      );
      const total = payments.reduce((sum, payment) => sum + payment.rate, 0);
      return {
        value:
          payments.length && Number.isFinite(total) && total > 0 ? total : null,
        windowStart: start,
        windowEnd: end,
        observedPayments: payments.length,
        coverageComplete: false,
        source: "BRAPI",
        unavailableReason:
          "A BRAPI retornou eventos de proventos em 12 meses, mas não confirmou que a série esteja completa; o valor automático é apenas uma observação e não libera o cálculo Bazin.",
      };
    } catch {
      return unavailable(
        "Não foi possível consultar proventos da BRAPI agora.",
      );
    }
  }
}

export const brapiDividendsProvider = new BrapiDividendsProvider();
