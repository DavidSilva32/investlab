import { COOKIE_POLICY_VERSION } from "@/lib/privacy-policy";

export const COOKIE_CONSENT_STORAGE_KEY = "investlab-cookie-consent";

export type CookieConsentChoice = "accepted" | "rejected";

type CookieConsentRecord = {
  version: string;
  choice: CookieConsentChoice;
};

type CookieConsentStorage = Pick<Storage, "getItem" | "setItem">;

export function readCookieConsent(
  storage: CookieConsentStorage,
): CookieConsentChoice | null {
  const storedValue = storage.getItem(COOKIE_CONSENT_STORAGE_KEY);
  if (!storedValue) return null;

  let record: unknown;
  try {
    record = JSON.parse(storedValue) as unknown;
  } catch {
    return null;
  }

  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    return null;
  }

  const consent = record as Partial<CookieConsentRecord>;
  if (
    consent.version !== COOKIE_POLICY_VERSION ||
    (consent.choice !== "accepted" && consent.choice !== "rejected")
  ) {
    return null;
  }

  return consent.choice;
}

export function saveCookieConsent(
  storage: CookieConsentStorage,
  choice: CookieConsentChoice,
): void {
  const record: CookieConsentRecord = {
    version: COOKIE_POLICY_VERSION,
    choice,
  };
  storage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(record));
}

export function hasOptionalCookieConsent(
  storage: CookieConsentStorage,
): boolean {
  return readCookieConsent(storage) === "accepted";
}
