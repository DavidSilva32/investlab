export const recurringExpenseFrequencies = [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "BIMONTHLY",
  "QUARTERLY",
  "SEMIANNUALLY",
  "YEARLY",
] as const;

export type RecurringExpenseFrequency =
  (typeof recurringExpenseFrequencies)[number];

const dayMilliseconds = 24 * 60 * 60 * 1000;

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day));
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function isFrequency(value: string): value is RecurringExpenseFrequency {
  return recurringExpenseFrequencies.includes(
    value as RecurringExpenseFrequency,
  );
}

function monthlyInterval(frequency: RecurringExpenseFrequency) {
  switch (frequency) {
    case "MONTHLY":
      return 1;
    case "BIMONTHLY":
      return 2;
    case "QUARTERLY":
      return 3;
    case "SEMIANNUALLY":
      return 6;
    case "YEARLY":
      return 12;
    case "WEEKLY":
    case "BIWEEKLY":
      return null;
  }
}

export function getRecurringExpenseOccurrenceDates(
  firstDueDate: string,
  frequencyValue: string,
  year: number,
  month: number,
) {
  if (
    !isValidIsoDate(firstDueDate) ||
    !isFrequency(frequencyValue) ||
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 9998 ||
    !Number.isInteger(month) ||
    month < 0 ||
    month > 11
  ) {
    return [];
  }

  const anchor = new Date(`${firstDueDate}T00:00:00.000Z`);
  const monthStart = utcDate(year, month, 1);
  const nextMonthStart = utcDate(year, month + 1, 1);
  const interval = monthlyInterval(frequencyValue);
  if (interval !== null) {
    const monthDifference =
      (year - anchor.getUTCFullYear()) * 12 + month - anchor.getUTCMonth();
    if (monthDifference < 0 || monthDifference % interval !== 0) return [];
    const dueDay = Math.min(anchor.getUTCDate(), lastDayOfMonth(year, month));
    return [utcDate(year, month, dueDay).toISOString().slice(0, 10)];
  }

  const intervalDays = frequencyValue === "WEEKLY" ? 7 : 14;
  const offsetDays = Math.ceil(
    (monthStart.getTime() - anchor.getTime()) / dayMilliseconds,
  );
  const firstCycle = Math.max(0, Math.ceil(offsetDays / intervalDays));
  const result: string[] = [];
  for (let cycle = firstCycle; ; cycle += 1) {
    const occurrence = new Date(
      anchor.getTime() + cycle * intervalDays * dayMilliseconds,
    );
    if (occurrence >= nextMonthStart) break;
    result.push(occurrence.toISOString().slice(0, 10));
  }
  return result;
}
