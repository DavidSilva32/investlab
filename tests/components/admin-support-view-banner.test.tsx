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

import { AdminSupportViewBanner } from "@/components/admin-support-view-banner";

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
    await user.click(
      screen.getByRole("button", { name: "Encerrar visualização" }),
    );

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
});
