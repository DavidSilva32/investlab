export function getApiMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("message" in payload)
  ) {
    return fallback;
  }

  const message = payload.message;
  return typeof message === "string" && message.trim().length > 0
    ? message.trim()
    : fallback;
}
