// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  pathname: "/carteira",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

import { AdminSupportViewControl } from "@/components/admin-support-view-control";

const target = {
  id: "customer-1",
  name: "Marcos Paulo",
  email: "m@example.com",
};
const activeView = {
  target,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
};

describe("AdminSupportViewControl", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    mocks.pathname = "/carteira";
    vi.clearAllMocks();
  });

  it("selects an active customer and starts the read-only customer view", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ targets: [target], supportView: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ supportView: activeView }),
      });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const user = userEvent.setup();
    render(<AdminSupportViewControl />);

    const trigger = await screen.findByRole("button", {
      name: "Selecionar cliente para visualização de suporte",
    });
    await user.click(trigger);
    await user.click(
      await screen.findByRole("option", { name: /Marcos Paulo/ }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/support-view",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ targetUserId: target.id }),
        }),
      ),
    );
    expect(mocks.success).toHaveBeenCalledWith(
      "Visualização de suporte iniciada.",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the selector unavailable when the admin endpoint fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<AdminSupportViewControl />);
    await waitFor(() => expect(screen.queryByRole("button")).toBeNull());
  });

  it("keeps the selector hidden when the admin endpoint rejects the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: "Acesso negado." }),
      }),
    );
    render(<AdminSupportViewControl />);
    await waitFor(() => expect(screen.queryByRole("button")).toBeNull());
  });

  it("refreshes when the current support view expires", async () => {
    const expiredView = {
      target,
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
    render(<AdminSupportViewControl />);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports the server message when starting a support view is denied", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ targets: [target], supportView: null }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ message: "Conta indisponível." }),
        }),
    );
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const user = userEvent.setup();
    render(<AdminSupportViewControl />);
    await user.click(
      await screen.findByRole("button", {
        name: "Selecionar cliente para visualização de suporte",
      }),
    );
    await user.click(
      await screen.findByRole("option", { name: /Marcos Paulo/ }),
    );
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("Conta indisponível."),
    );
  });

  it("uses a safe fallback when starting the view rejects with a non-error value", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ targets: [target], supportView: null }),
      })
      .mockRejectedValueOnce("offline");
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const user = userEvent.setup();
    render(<AdminSupportViewControl />);
    await user.click(
      await screen.findByRole("button", {
        name: /Selecionar cliente para visualiza/,
      }),
    );
    await user.click(
      await screen.findByRole("option", { name: /Marcos Paulo/ }),
    );
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "Não foi possível abrir esta conta.",
      ),
    );
  });

  it("does not restore stale account choices when a load fails during a pending start", async () => {
    let resolveStart!: (response: {
      ok: boolean;
      json: () => Promise<{ supportView: typeof activeView }>;
    }) => void;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ targets: [target], supportView: null }),
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStart = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "Acesso negado." }),
      });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const user = userEvent.setup();
    const view = render(<AdminSupportViewControl />);
    await user.click(
      await screen.findByRole("button", {
        name: /Selecionar cliente para visualiza/,
      }),
    );
    await user.click(
      await screen.findByRole("option", { name: /Marcos Paulo/ }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    mocks.pathname = "/outra-pagina";
    view.rerender(<AdminSupportViewControl />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    resolveStart({ ok: true, json: async () => ({ supportView: activeView }) });

    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith(
        "Visualização de suporte iniciada.",
      ),
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("rejects target records without an identifier before issuing a request", async () => {
    const invalidTarget = {
      id: "",
      name: "Conta sem identificador",
      email: "",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ targets: [invalidTarget], supportView: null }),
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const user = userEvent.setup();
    render(<AdminSupportViewControl />);
    await user.click(
      await screen.findByRole("button", {
        name: "Selecionar cliente para visualização de suporte",
      }),
    );
    await user.click(
      await screen.findByRole("option", { name: /Conta sem identificador/ }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
