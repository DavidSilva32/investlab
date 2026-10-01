import Decimal from "decimal.js";

const PreciseDecimal = Decimal.clone({ precision: 50 });

export function estimatePostFixedCdb({
  officialValue,
  cdiPercentage,
  rates,
}: {
  officialValue: string;
  cdiPercentage: string;
  rates: Array<{ annualRate: string }>;
}) {
  const percentage = new PreciseDecimal(cdiPercentage).div(100);
  const value = rates.reduce((current, rate) => {
    const dailyCdi = new PreciseDecimal(1)
      .plus(new PreciseDecimal(rate.annualRate).div(100))
      .pow(new PreciseDecimal(1).div(252))
      .minus(1);
    return current.mul(new PreciseDecimal(1).plus(dailyCdi.mul(percentage)));
  }, new PreciseDecimal(officialValue));

  return {
    estimatedValue: Number(value.toFixed(8)),
    estimatedValueCents: value
      .mul(100)
      .toDecimalPlaces(0, PreciseDecimal.ROUND_HALF_UP)
      .toFixed(0),
  };
}
