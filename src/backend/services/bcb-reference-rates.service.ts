import { logger } from "@/infrastructure/logging/logger";
type BcbRate = { data: string; valor: string };
export type BcbReferenceRates = {
  selic: { annualRate: string; date: string } | null;
  cdi: { annualRate: string; date: string } | null;
};
const parseLatestRate = (values: BcbRate[]) => {
  const todayInSaoPaulo = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      new Date(),
    );
  const rate = values.at(0);
  if (!rate) return null;
  const [day, month, year] = rate.data.split("/");
  const annualRate = rate.valor.replace(",", ".");
  if (!day || !month || !year || !/^\d+(\.\d+)?$/.test(annualRate)) return null;
  const date = `${year}-${month}-${day}`;
  return date > todayInSaoPaulo() ? null : { date, annualRate };
};
async function fetchLatestRate(series: number) {
  try {
    logger.info("bcb_reference_rate_requested", { series });
    const response = await fetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${series}/dados/ultimos/1?formato=json`,
      { next: { revalidate: 3600 } },
    );
    if (!response.ok) {
      logger.warn("bcb_reference_rate_unavailable", {
        series,
        status: response.status,
      });
      return null;
    }
    const rate = parseLatestRate((await response.json()) as BcbRate[]);
    logger.info("bcb_reference_rate_received", {
      series,
      available: Boolean(rate),
      date: rate?.date,
    });
    return rate;
  } catch (error) {
    logger.warn("bcb_reference_rate_failed", { series, error });
    return null;
  }
}
export async function getBcbReferenceRates(): Promise<BcbReferenceRates> {
  if (process.env.NODE_ENV === "test") return { selic: null, cdi: null };
  logger.info("bcb_reference_rates_loading");
  const [selic, cdi] = await Promise.all([
    fetchLatestRate(432),
    fetchLatestRate(4389),
  ]);
  logger.info("bcb_reference_rates_loaded", {
    hasSelic: Boolean(selic),
    hasCdi: Boolean(cdi),
  });
  return { selic, cdi };
}
