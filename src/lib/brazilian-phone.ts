export function brazilianPhoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^\s*\+55/.test(value) && digits.startsWith("55")) {
    const nationalDigits = digits.slice(2);
    if (nationalDigits.length === 10 || nationalDigits.length === 11) {
      return nationalDigits;
    }
  }
  return digits;
}

export function formatBrazilianPhone(value: string | null | undefined) {
  const rawValue = value ?? "";
  const rawDigits = rawValue.replace(/\D/g, "");
  const digits = brazilianPhoneDigits(rawValue);
  const countryCodeRemainder = rawDigits.startsWith("55")
    ? rawDigits.slice(2)
    : "";
  const hasIncompleteCountryCode =
    /^\s*\+55/.test(rawValue) &&
    countryCodeRemainder.length !== 10 &&
    countryCodeRemainder.length !== 11;
  if (digits.length > 11 || hasIncompleteCountryCode) return rawValue;
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;

  const areaCode = digits.slice(0, 2);
  const localNumber = digits.slice(2);
  const isMobile = digits.length > 10 || localNumber.startsWith("9");
  const prefixLength = isMobile ? 5 : 4;
  const prefix = localNumber.slice(0, prefixLength);
  const suffix = localNumber.slice(prefixLength, prefixLength + 4);

  return `(${areaCode}) ${prefix}${suffix ? `-${suffix}` : ""}`;
}

export function isValidBrazilianPhoneDigits(value: string) {
  return value === "" || value.length === 10 || value.length === 11;
}

export function normalizeBrazilianPhone(value: string | null | undefined) {
  if (value === null || value === undefined || value.trim() === "") return null;
  if (/^\s*\+55/.test(value)) {
    const internationalDigits = value.replace(/\D/g, "");
    const nationalDigits = internationalDigits.slice(2);
    return isValidBrazilianPhoneDigits(nationalDigits)
      ? nationalDigits
      : undefined;
  }
  const digits = brazilianPhoneDigits(value);
  if (!isValidBrazilianPhoneDigits(digits)) return undefined;
  return digits;
}
