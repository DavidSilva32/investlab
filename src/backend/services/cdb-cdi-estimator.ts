export function estimatePostFixedCdb({
  officialValue,
  cdiPercentage,
  rates,
}: {
  officialValue: string;
  cdiPercentage: string;
  rates: Array<{ annualRate: string }>;
}) {
  const percentage = Number(cdiPercentage) / 100;
  const value = rates.reduce((current, rate) => {
    const dailyCdi = (1 + Number(rate.annualRate) / 100) ** (1 / 252) - 1;
    return current * (1 + dailyCdi * percentage);
  }, Number(officialValue));
  return Number(value.toFixed(8));
}
