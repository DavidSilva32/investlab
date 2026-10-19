// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpConsentForm } from "@/app/(public)/mcp/consent/mcp-consent-form";

describe("McpConsentForm", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("submits explicit approval and follows the provider redirect", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        redirect: true,
        url: "https://chat.example/callback",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<McpConsentForm oauthQuery="client_id=client&sig=signed" />);

    fireEvent.click(screen.getByRole("button", { name: "Autorizar conexão" }));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://chat.example/callback"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/oauth2/consent",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
          accept: true,
          oauth_query: "client_id=client&sig=signed",
        }),
      }),
    );
  });

  it("submits rejection and announces a failed response accessibly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: "Failed" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<McpConsentForm oauthQuery="client_id=client&sig=signed" />);

    fireEvent.click(screen.getByRole("button", { name: "Recusar" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível concluir sua escolha. Tente novamente.",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/oauth2/consent",
      expect.objectContaining({
        body: JSON.stringify({
          accept: false,
          oauth_query: "client_id=client&sig=signed",
        }),
      }),
    );
  });
});
