import { logger } from "@/infrastructure/logging/logger";

type BcbRate = { data: string; valor: string };

export type BcbReferenceRates = {
  selic: { annualRate: string; date: string } | null;
  cdi: { annualRate: string; date: string } | null;
  ipca: {
    monthlyRate: string;
    rollingAnnualRate: string;
    date: string;
  } | null;
};

export class BcbReferenceRatesService {
  async getReferenceRates(): Promise<BcbReferenceRates> {
    if (process.env.NODE_ENV === "test")
      return { selic: null, cdi: null, ipca: null };
    logger.info("bcb_reference_rates_loading");
    const [selic, cdi, ipca] = await Promise.all([
      this.fetchLatestRate(432),
      this.fetchLatestRate(4389),
      this.fetchLatestIpca(),
    ]);
    logger.info("bcb_reference_rates_loaded", {
      hasSelic: Boolean(selic),
      hasCdi: Boolean(cdi),
      hasIpca: Boolean(ipca),
    });
    return { selic, cdi, ipca };
  }

  private parseLatestRate(values: BcbRate[], series: number) {
    const rate = values.at(0);
    if (!rate) return null;
    const [day, month, year] = rate.data.split("/");
    const annualRate = rate.valor.replace(",", ".");
    if (!day || !month || !year || !/^\d+(\.\d+)?$/.test(annualRate))
      return null;
    const date = `${year}-${month}-${day}`;
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    return date > today && series !== 432 ? null : { date, annualRate };
  }

  private parseIpca(values: BcbRate[]) {
    if (values.length !== 12) return null;

    const observations = values.map((observation) => {
      const [day, month, year] = observation.data.split("/");
      const monthlyRate = observation.valor.replace(",", ".");
      if (!day || !month || !year || !/^-?\d+(\.\d+)?$/.test(monthlyRate)) {
        return null;
      }
      const parsedDate = new Date(`${year}-${month}-${day}T00:00:00Z`);
      if (
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== `${year}-${month}-${day}`
      ) {
        return null;
      }
      return {
        date: `${year}-${month}-${day}`,
        monthIndex: Number(year) * 12 + Number(month),
        monthlyRate: Number(monthlyRate),
      };
    });

    if (observations.some((observation) => observation === null)) return null;
    const validObservations = observations.filter(
      (observation): observation is NonNullable<typeof observation> =>
        observation !== null,
    );
    if (
      validObservations.some(
        (observation, index) =>
          index > 0 &&
          observation.monthIndex !==
            validObservations[index - 1]!.monthIndex + 1,
      )
    ) {
      return null;
    }
    const latest = validObservations.at(-1)!;

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    if (latest.date > today) return null;

    const rollingAnnualRate =
      (validObservations.reduce(
        (accumulated, observation) =>
          accumulated * (1 + observation.monthlyRate / 100),
        1,
      ) -
        1) *
      100;

    return {
      date: latest.date,
      monthlyRate: latest.monthlyRate.toString(),
      rollingAnnualRate: rollingAnnualRate.toFixed(2),
    };
  }

  private async fetchLatestIpca() {
    const series = 433;
    try {
      logger.info("bcb_reference_rate_requested", { series });
      const response = await fetch(
        `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${series}/dados/ultimos/12?formato=json`,
        { next: { revalidate: 3600 } },
      );
      if (!response.ok) {
        logger.warn("bcb_reference_rate_unavailable", {
          series,
          status: response.status,
        });
        return null;
      }
      const rate = this.parseIpca((await response.json()) as BcbRate[]);
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

  private async fetchLatestRate(series: number) {
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
      const rate = this.parseLatestRate(
        (await response.json()) as BcbRate[],
        series,
      );
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
}

export const bcbReferenceRatesService = new BcbReferenceRatesService();
