// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
});
