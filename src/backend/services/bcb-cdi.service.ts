import { ApplicationError } from "@/backend/errors/application-error";
import { logger } from "@/infrastructure/logging/logger";
type BcbRate = { data: string; valor: string };
export class BcbCdiService {
  async fetchRates(from: string, to: string) {
    logger.info("bcb_cdi_rates_requested", { from, to });
    const params = new URLSearchParams({
      formato: "json",
      dataInicial: from.split("-").reverse().join("/"),
      dataFinal: to.split("-").reverse().join("/"),
    });
    const response = await fetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados?${params}`,
      { next: { revalidate: 3600 } },
    );
    if (!response.ok) {
      logger.warn("bcb_cdi_rates_unavailable", {
        from,
        to,
        status: response.status,
      });
      throw new ApplicationError(
        "Não foi possível consultar a taxa CDI oficial.",
        503,
      );
    }
    const rates = ((await response.json()) as BcbRate[]).flatMap((rate) => {
      const [day, month, year] = rate.data.split("/");
      const annualRate = rate.valor.replace(",", ".");
      if (!day || !month || !year || !/^\d+(\.\d+)?$/.test(annualRate))
        return [];
      return [{ date: `${year}-${month}-${day}`, annualRate }];
    });
    logger.info("bcb_cdi_rates_received", { from, to, rates: rates.length });
    return rates;
  }
}
export const bcbCdiService = new BcbCdiService();
