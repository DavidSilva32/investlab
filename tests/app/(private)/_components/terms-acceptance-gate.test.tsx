// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "@/lib/api-client";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { TermsAcceptanceGate } from "@/app/(private)/_components/terms-acceptance-gate";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  mocks.refresh.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TermsAcceptanceGate", () => {
  it("shows the full current version and cannot be dismissed with Escape", () => {
    render(<TermsAcceptanceGate version="termos-2026-10-19.1" />);

    const dialog = screen.getByRole("dialog", {
      name: "Leia e aceite os Termos de Uso",
    });
    expect(dialog.textContent).toContain("termos-2026-10-19.1");
    expect(dialog.textContent).toContain(
      "7. Atualizações e encerramento do acesso",
    );
    expect(dialog.textContent).toContain("O InvestLab não envia ordens");
    expect(
      screen
        .getByRole("link", { name: /Abrir os Termos/ })
        .getAttribute("href"),
    ).toBe("/termos-de-uso");

    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.hasAttribute("open")).toBe(true);
  });

  it("does not reopen a dialog that is already open", () => {
    const openDescriptor = Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      "open",
    );
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    Object.defineProperty(HTMLDialogElement.prototype, "open", {
      configurable: true,
      get: () => true,
    });

    try {
      render(<TermsAcceptanceGate version="termos-2026-10-19.1" />);

      expect(showModal).not.toHaveBeenCalled();
    } finally {
      if (openDescriptor) {
        Object.defineProperty(
          HTMLDialogElement.prototype,
          "open",
          openDescriptor,
        );
      } else {
        Reflect.deleteProperty(HTMLDialogElement.prototype, "open");
      }
    }
  });

  it("does not close the dialog during cleanup when it is no longer open", () => {
    const openDescriptor = Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      "open",
    );
    const close = vi.spyOn(HTMLDialogElement.prototype, "close");
    Object.defineProperty(HTMLDialogElement.prototype, "open", {
      configurable: true,
      get: () => false,
    });

    try {
      const { unmount } = render(
        <TermsAcceptanceGate version="termos-2026-10-19.1" />,
      );
      unmount();

      expect(close).not.toHaveBeenCalled();
    } finally {
      if (openDescriptor) {
        Object.defineProperty(
          HTMLDialogElement.prototype,
          "open",
          openDescriptor,
        );
      } else {
        Reflect.deleteProperty(HTMLDialogElement.prototype, "open");
      }
    }
  });

  it("records the exact displayed version and refreshes private content", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ recorded: true }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<TermsAcceptanceGate version="termos-2026-10-19.1" />);

    await user.click(
      screen.getByRole("button", { name: "Li e aceito os Termos de Uso" }),
    );

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/privacy/terms-acceptances",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ termsVersion: "termos-2026-10-19.1" }),
      }),
    );
  });

  it("keeps the gate open and reports a failed acceptance", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: "Atualize a página." }, { status: 409 }),
        ),
    );
    const user = userEvent.setup();
    render(<TermsAcceptanceGate version="termos-2026-10-19.1" />);

    await user.click(
      screen.getByRole("button", { name: "Li e aceito os Termos de Uso" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Atualize a página.",
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog").hasAttribute("open")).toBe(true);
  });

  it("shows a fallback message when acceptance fails without an Error", async () => {
    vi.spyOn(apiClient, "apiRequest").mockRejectedValueOnce(
      "network unavailable",
    );
    const user = userEvent.setup();
    render(<TermsAcceptanceGate version="termos-2026-10-19.1" />);

    await user.click(
      screen.getByRole("button", { name: "Li e aceito os Termos de Uso" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Não foi possível registrar seu aceite. Tente novamente.",
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
