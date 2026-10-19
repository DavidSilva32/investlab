// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CookieConsentPreferencesButton } from "@/components/cookie-consent-preferences-button";
import { COOKIE_CONSENT_OPEN_EVENT } from "@/lib/cookie-consent";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CookieConsentPreferencesButton", () => {
  it("requests the cookie choice when activated", async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    window.addEventListener(COOKIE_CONSENT_OPEN_EVENT, listener);
    render(<CookieConsentPreferencesButton />);

    await user.click(
      screen.getByRole("button", { name: "Rever preferências de cookies" }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(COOKIE_CONSENT_OPEN_EVENT, listener);
  });
});
