// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COOKIE_CONSENT_STORAGE_KEY,
  readCookieConsent,
} from "@/lib/cookie-consent";
import { COOKIE_POLICY_VERSION } from "@/lib/privacy-policy";
import { CookieConsentManager } from "@/components/cookie-consent-manager";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CookieConsentManager", () => {
  it("shows a bottom-level choice and saves rejection for the browser", async () => {
    const user = userEvent.setup();
    render(<CookieConsentManager />);

    const banner = await screen.findByRole("region", {
      name: /Prefer\u00eancias de cookies/,
    });
    expect(banner.textContent).toMatch(/necess\u00e1rios.*ficam ativos/i);
    expect(
      screen.getByRole("link", { name: /Leia a Pol\u00edtica de Cookies/ }),
    ).toHaveProperty("href", expect.stringMatching(/\/cookies$/));

    await user.click(
      screen.getByRole("button", { name: "Rejeitar opcionais" }),
    );

    expect(readCookieConsent(localStorage)).toBe("rejected");
    expect(
      screen.queryByRole("region", { name: /Prefer\u00eancias de cookies/ }),
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: /Abrir prefer\u00eancias de cookies/,
      }),
    ).toBeTruthy();
  });

  it("remembers acceptance and lets the user reopen and change the choice", async () => {
    const user = userEvent.setup();
    const firstRender = render(<CookieConsentManager />);
    await screen.findByRole("region", { name: /Prefer\u00eancias de cookies/ });
    await user.click(screen.getByRole("button", { name: "Aceitar opcionais" }));
    expect(readCookieConsent(localStorage)).toBe("accepted");
    firstRender.unmount();

    render(<CookieConsentManager />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /Abrir prefer\u00eancias de cookies/,
        }),
      ).toBeTruthy();
    });
    expect(
      screen.queryByRole("region", { name: /Prefer\u00eancias de cookies/ }),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", {
        name: /Abrir prefer\u00eancias de cookies/,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Rejeitar opcionais" }),
    );
    expect(readCookieConsent(localStorage)).toBe("rejected");
  });

  it("shows the banner again for an older policy version", async () => {
    localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify({ version: "previous-policy", choice: "accepted" }),
    );

    render(<CookieConsentManager />);

    expect(
      await screen.findByRole("region", {
        name: /Prefer\u00eancias de cookies/,
      }),
    ).toBeTruthy();
    expect(COOKIE_POLICY_VERSION).not.toBe("previous-policy");
  });

  it("keeps the banner and explains when browser storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    const user = userEvent.setup();
    render(<CookieConsentManager />);

    await user.click(
      await screen.findByRole("button", { name: "Aceitar opcionais" }),
    );

    expect(screen.getByRole("alert").textContent).toMatch(
      /n\u00e3o foi poss\u00edvel salvar sua escolha/i,
    );
    expect(
      screen.getByRole("region", { name: /Prefer\u00eancias de cookies/ }),
    ).toBeTruthy();
  });

  it("keeps the banner available after a storage read error", async () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage disabled");
      });
    const user = userEvent.setup();
    render(<CookieConsentManager />);

    await screen.findByRole("region", { name: /Prefer\u00eancias de cookies/ });
    expect(screen.getByRole("alert")).toBeTruthy();
    getItemSpy.mockRestore();

    await user.click(
      screen.getByRole("button", { name: "Rejeitar opcionais" }),
    );

    expect(readCookieConsent(localStorage)).toBe("rejected");
    expect(
      screen.queryByRole("region", { name: /Prefer\u00eancias de cookies/ }),
    ).toBeNull();
  });
});
