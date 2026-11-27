const callbackOrigin = "https://investlab.invalid";

export function getMcpLoginCallback(callbackURL: unknown): string | undefined {
  if (typeof callbackURL !== "string") return undefined;

  try {
    const callback = new URL(callbackURL, callbackOrigin);
    if (
      callback.origin !== callbackOrigin ||
      callback.pathname !== "/mcp/consent" ||
      callback.search.length === 0 ||
      callback.hash.length > 0
    ) {
      return undefined;
    }

    return `${callback.pathname}${callback.search}`;
  } catch {
    return undefined;
  }
}
