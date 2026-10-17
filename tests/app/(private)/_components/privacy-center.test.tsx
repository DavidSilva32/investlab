// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import { PrivacyCenter } from "@/app/(private)/_components/privacy-center";
import PrivacyCenterPage from "@/app/(private)/privacidade-conta/page";
import * as apiClient from "@/lib/api-client";

function renderPrivacyCenter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PrivacyCenter />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PrivacyCenter", () => {
  it("shows the authenticated user's recorded acceptance and document links", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        currentTermsVersion: "rascunho-2026-10-17.1",
        termsAcceptances: [
          {
            termsVersion: "rascunho-2026-10-17.1",
            acceptedAt: "2026-10-17T12:00:00.000Z",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPrivacyCenter();

    expect(
      screen.getByRole("heading", { name: "Privacidade e dados" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText(/versão rascunho-2026-10-17.1/)).toBeTruthy(),
    );
    expect(screen.getByText(/Aceitos em/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Termos de Uso" }).getAttribute("href"),
    ).toBe("/termos-de-uso");
    expect(
      screen
        .getByRole("link", { name: "Política de Privacidade" })
        .getAttribute("href"),
    ).toBe("/privacidade");
    expect(
      screen
        .getByRole("link", { name: "Política de Cookies" })
        .getAttribute("href"),
    ).toBe("/cookies");
    expect(
      screen.getByRole("navigation", { name: "Documentos de privacidade" }),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/privacy/terms-acceptances");
  });

  it("explains that existing accounts without a record are not backfilled", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ currentTermsVersion: "v2", termsAcceptances: [] }),
        ),
    );
    renderPrivacyCenter();

    await waitFor(() =>
      expect(
        screen.getByText(
          /o histórico não é presumido nem preenchido retroativamente/,
        ),
      ).toBeTruthy(),
    );
  });

  it("shows an inline error and retry action when the history cannot load", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: "Falha de leitura." }, { status: 500 }),
        ),
    );
    renderPrivacyCenter();

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Falha de leitura.",
      ),
    );
    expect(
      screen.getByRole("button", { name: /Tentar novamente/ }),
    ).toBeTruthy();
  });

  it("retries loading the acceptance history and replaces the error on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: "Falha de leitura." }, { status: 500 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          currentTermsVersion: "v2",
          termsAcceptances: [
            { termsVersion: "v1", acceptedAt: "2026-10-17T12:00:00.000Z" },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPrivacyCenter();

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Falha de leitura.",
      ),
    );
    await user.click(screen.getByRole("button", { name: /Tentar novamente/ }));

    await waitFor(() => expect(screen.getByText(/versão v1/)).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses a safe fallback when the query rejects a non-Error value", async () => {
    vi.spyOn(apiClient, "apiRequest").mockRejectedValue("internal detail");
    renderPrivacyCenter();

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Não foi possível carregar o histórico de aceite.",
      ),
    );
    expect(screen.getByRole("alert").textContent).not.toContain(
      "internal detail",
    );
  });

  it("shows the raw timestamp when the server returns an invalid date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          currentTermsVersion: "v2",
          termsAcceptances: [{ termsVersion: "v2", acceptedAt: "not-a-date" }],
        }),
      ),
    );
    renderPrivacyCenter();

    await waitFor(() =>
      expect(screen.getByText("Aceitos em not-a-date")).toBeTruthy(),
    );
  });

  it("renders the authenticated route page wrapper", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        {PrivacyCenterPage()}
      </QueryClientProvider>,
    );
    expect(screen.getByRole("main")).toBeTruthy();
  });
});
