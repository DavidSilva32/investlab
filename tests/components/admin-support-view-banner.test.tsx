// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/carteira",
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

import {
  ADMIN_SUPPORT_VIEW_RETRY_EVENT,
  AdminSupportViewBanner,
} from "@/components/admin-support-view-banner";

const target = {
  id: "customer-1",
  name: "Marcos Paulo",
  email: "m@example.com",
};
const activeView = {
  target,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
};

describe("AdminSupportViewBanner", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("identifies the customer and clears the local support cookie when ended", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ targets: [target], supportView: activeView }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ supportView: null }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AdminSupportViewBanner />);

    expect((await screen.findByRole("status")).textContent).toContain(
      "Cliente: Marcos Paulo (m@example.com)",
    );
    expect(screen.getByText("Somente leitura.")).toBeTruthy();
    await user.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/support-view",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(mocks.success).toHaveBeenCalledWith(
      "Visualização de suporte encerrada.",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("does not show a banner when there is no active support view", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ targets: [target], supportView: null }),
      }),
    );
    render(<AdminSupportViewBanner />);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("shows a retryable error when loading returns an unsuccessful response", async () => {
    const onSupportViewChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: "Acesso negado." }),
      }),
    );
    render(
      <AdminSupportViewBanner onSupportViewChange={onSupportViewChange} />,
    );

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeTruthy();
    expect(onSupportViewChange).toHaveBeenCalledWith("error");
  });

  it("retries a failed support status request and reports the confirmed mode", async () => {
    const onSupportViewChange = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "Acesso negado." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ supportView: activeView }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <AdminSupportViewBanner onSupportViewChange={onSupportViewChange} />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Tentar novamente" }),
    );

    expect(await screen.findByText("Visualização de suporte")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onSupportViewChange).toHaveBeenCalledWith("error");
    expect(onSupportViewChange).toHaveBeenCalledWith(true);
  });

  it("retries support status when the dashboard dispatches the retry event", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ supportView: null }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminSupportViewBanner />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    window.dispatchEvent(new Event(ADMIN_SUPPORT_VIEW_RETRY_EVENT));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("refreshes the page when the signed support view expires", async () => {
    const expiredView = {
      ...activeView,
      expiresAt: new Date(Date.now() - 1).toISOString(),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ targets: [target], supportView: expiredView }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ targets: [target], supportView: null }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminSupportViewBanner />);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows an API error and keeps the support banner available", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ targets: [target], supportView: activeView }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ message: "Ação recusada." }),
        }),
    );
    const user = userEvent.setup();
    render(<AdminSupportViewBanner />);
    await user.click(
      await screen.findByRole("button", { name: "Encerrar visualização" }),
    );
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("Ação recusada."),
    );
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("uses a safe fallback when the end request rejects with a non-error value", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ targets: [target], supportView: activeView }),
        })
        .mockRejectedValueOnce("offline"),
    );
    const user = userEvent.setup();
    render(<AdminSupportViewBanner />);
    await user.click(
      await screen.findByRole("button", { name: "Encerrar visualização" }),
    );
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "Não foi possível encerrar a visualização.",
      ),
    );
  });

  it("updates its banner when the shell broadcasts an active view", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ targets: [target], supportView: null }),
      }),
    );
    render(<AdminSupportViewBanner />);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    fireEvent(
      window,
      new CustomEvent("admin-support-view-changed", { detail: activeView }),
    );
    expect(await screen.findByText("Visualização de suporte")).toBeTruthy();
  });
  it("reports active and ended support mode to the shell", async () => {
    const onSupportViewChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ targets: [target], supportView: activeView }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ supportView: null }),
        }),
    );
    const user = userEvent.setup();
    render(
      <AdminSupportViewBanner onSupportViewChange={onSupportViewChange} />,
    );

    await waitFor(() => expect(onSupportViewChange).toHaveBeenCalledWith(true));
    await user.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(onSupportViewChange).toHaveBeenCalledWith(false),
    );
  });
});
