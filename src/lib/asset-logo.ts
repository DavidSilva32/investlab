/** Validate provider images without guessing an issuer from an instrument's name. */
export function resolveAssetLogoUrl(
  ticker?: string | null,
  logoUrl?: string | null,
): string | null {
  if (!ticker) return null;
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{0,11}$/.test(normalizedTicker)) return null;
  if (!logoUrl) {
    return /^[A-Z]{4}[0-9]{1,2}$/.test(normalizedTicker)
      ? `https://icons.brapi.dev/icons/${normalizedTicker}.svg`
      : null;
  }
  try {
    const url = new URL(logoUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "icons.brapi.dev" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== `/icons/${normalizedTicker}.svg`
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
