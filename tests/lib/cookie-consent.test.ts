import { describe, expect, it, vi } from "vitest";
import {
  COOKIE_CONSENT_STORAGE_KEY,
  hasOptionalCookieConsent,
  readCookieConsent,
  saveCookieConsent,
} from "@/lib/cookie-consent";
import { COOKIE_POLICY_VERSION } from "@/lib/privacy-policy";

function createStorage(initialValue: string | null = null) {
  let value = initialValue;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, nextValue: string) => {
      value = nextValue;
    }),
  };
}

describe("cookie consent", () => {
  it("has no saved choice when storage is empty", () => {
    expect(readCookieConsent(createStorage())).toBeNull();
  });

  it("reads accepted and rejected choices for the current policy version", () => {
    const acceptedStorage = createStorage(
      JSON.stringify({ version: COOKIE_POLICY_VERSION, choice: "accepted" }),
    );
    const rejectedStorage = createStorage(
      JSON.stringify({ version: COOKIE_POLICY_VERSION, choice: "rejected" }),
    );

    expect(readCookieConsent(acceptedStorage)).toBe("accepted");
    expect(hasOptionalCookieConsent(acceptedStorage)).toBe(true);
    expect(readCookieConsent(rejectedStorage)).toBe("rejected");
    expect(hasOptionalCookieConsent(rejectedStorage)).toBe(false);
  });

  it("asks again after a policy version changes or stored data is invalid", () => {
    expect(
      readCookieConsent(
        createStorage(JSON.stringify({ version: "old", choice: "accepted" })),
      ),
    ).toBeNull();
    expect(readCookieConsent(createStorage("not-json"))).toBeNull();
    expect(readCookieConsent(createStorage("null"))).toBeNull();
    expect(readCookieConsent(createStorage("[]"))).toBeNull();
    expect(
      readCookieConsent(
        createStorage(
          JSON.stringify({ version: COOKIE_POLICY_VERSION, choice: "other" }),
        ),
      ),
    ).toBeNull();
  });

  it("saves a choice together with the active policy version", () => {
    const storage = createStorage();
    saveCookieConsent(storage, "rejected");

    expect(storage.setItem).toHaveBeenCalledWith(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify({ version: COOKIE_POLICY_VERSION, choice: "rejected" }),
    );
    expect(readCookieConsent(storage)).toBe("rejected");
  });

  it("lets storage errors surface to the caller", () => {
    const readError = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(),
    };
    const writeError = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };

    expect(() => readCookieConsent(readError)).toThrow("blocked");
    expect(() => saveCookieConsent(writeError, "accepted")).toThrow("blocked");
  });
});
