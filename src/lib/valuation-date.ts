const dateInSaoPaulo = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
});

export function todayInSaoPaulo() {
  return dateInSaoPaulo.format(new Date());
}

export function isValidValuationDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

export function isFutureValuationDate(value: string) {
  return value > todayInSaoPaulo();
}
