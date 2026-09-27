/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvestorContextSettings } from "@/app/settings/_components/investor-context-settings";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  };
}

describe("InvestorContextSettings", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows optional missing values and loads saved context", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        context: { objective: null, targetMonth: null, updatedAt: null },
      }),
    );
    render(<InvestorContextSettings />);
    expect(
      (
        await screen.findAllByText(
          "Ainda não informado. Essa resposta é opcional.",
        )
      ).length,
    ).toBe(2);
    expect(
      screen.getByRole("textbox", { name: /O que você quer alcançar/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Quando pretende usar esse dinheiro?",
      }),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/investor-context", {
      cache: "no-store",
    });
  });

  it("announces loading while retrieving the context", async () => {
    let resolveLoad: (value: ReturnType<typeof jsonResponse>) => void = () =>
      undefined;
    const pending = new Promise<ReturnType<typeof jsonResponse>>((resolve) => {
      resolveLoad = resolve;
    });
    fetchMock.mockReturnValueOnce(pending);
    render(<InvestorContextSettings />);
    expect(screen.getByRole("status").textContent).toBe(
      "Carregando seu contexto...",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Quando pretende usar esse dinheiro?",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    await act(async () => {
      resolveLoad(
        jsonResponse({
          context: { objective: null, targetMonth: null, updatedAt: null },
        }),
      );
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Salvar contexto",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  it("lets the user edit and save the objective and intended month", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          context: {
            objective: "Comprar uma casa",
            targetMonth: "2030-02",
            updatedAt: "2026-09-20T12:00:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          context: {
            objective: "Comprar uma casa",
            targetMonth: "2030-03",
            updatedAt: "2026-09-27T12:00:00.000Z",
          },
        }),
      );
    render(<InvestorContextSettings />);
    const objective = await screen.findByRole("textbox", {
      name: /O que você quer alcançar/,
    });
    const targetMonth = screen.getByRole("button", {
      name: "Quando pretende usar esse dinheiro?",
    });
    fireEvent.change(objective, { target: { value: "Comprar uma casa" } });
    fireEvent.click(targetMonth);
    fireEvent.click(
      screen.getByRole("button", { name: "Selecionar março de 2030" }),
    );
    const saveButton = screen.getByRole("button", { name: "Salvar contexto" });
    await waitFor(() =>
      expect((saveButton as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(saveButton);
    expect(
      await screen.findByText("Seu objetivo e prazo foram salvos."),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/investor-context",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          objective: "Comprar uma casa",
          targetMonth: "2030-03",
        }),
      }),
    );
    expect(screen.getByText(/Atualizado em/)).toBeTruthy();
    expect(screen.getByText(/Mês informado:/)).toBeTruthy();
  });

  it("clears optional values when the API omits the context", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          context: {
            objective: "Plano temporário",
            targetMonth: "2032-06",
            updatedAt: null,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}));
    render(<InvestorContextSettings />);
    const objective = await screen.findByRole("textbox", {
      name: /O que você quer alcançar/,
    });
    fireEvent.change(objective, { target: { value: "Plano temporário" } });
    fireEvent.change(objective, { target: { value: "" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Quando pretende usar esse dinheiro?",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Limpar prazo" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar contexto" }));
    expect(
      await screen.findByText("Seu objetivo e prazo foram salvos."),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/investor-context",
      expect.objectContaining({
        body: JSON.stringify({ objective: null, targetMonth: null }),
      }),
    );
    expect((objective as HTMLInputElement).value).toBe("");
  });

  it("asks the user to review a month that has passed", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        context: {
          objective: "Uma viagem",
          targetMonth: "2000-08",
          updatedAt: null,
        },
      }),
    );
    render(<InvestorContextSettings />);
    expect(
      await screen.findByText(
        "Esse mês já passou. Revise o prazo se seus planos mudaram.",
      ),
    ).toBeTruthy();
  });

  it("ignores a completed request after unmount", async () => {
    let resolveLoad: (value: ReturnType<typeof jsonResponse>) => void = () =>
      undefined;
    const pending = new Promise<ReturnType<typeof jsonResponse>>((resolve) => {
      resolveLoad = resolve;
    });
    fetchMock.mockReturnValueOnce(pending);
    const view = render(<InvestorContextSettings />);
    view.unmount();
    await act(async () => {
      resolveLoad(jsonResponse({}));
    });
  });

  it("ignores a failed request after unmount", async () => {
    let rejectLoad: (reason?: unknown) => void = () => undefined;
    const pending = new Promise<ReturnType<typeof jsonResponse>>(
      (_, reject) => {
        rejectLoad = reject;
      },
    );
    fetchMock.mockReturnValueOnce(pending);
    const view = render(<InvestorContextSettings />);
    view.unmount();
    await act(async () => {
      rejectLoad("network failure");
    });
  });

  it("shows a friendly load message for an unknown failure", async () => {
    fetchMock.mockRejectedValueOnce("network failure");
    render(<InvestorContextSettings />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar seu contexto.",
    );
    expect(
      screen.getByRole("button", { name: "Tentar carregar novamente" }),
    ).toBeTruthy();
  });

  it("shows a safe loading error", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { message: "Serviço de contexto temporariamente indisponível." },
          false,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          context: {
            objective: "Objetivo preservado",
            targetMonth: "2035-04",
            updatedAt: null,
          },
        }),
      );
    render(<InvestorContextSettings />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Serviço de contexto temporariamente indisponível.",
    );
    expect(
      (
        screen.getByLabelText(
          "O que você quer alcançar com seus investimentos?",
        ) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Salvar contexto",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Tentar carregar novamente" }),
    );
    expect(await screen.findByDisplayValue("Objetivo preservado")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Salvar contexto",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("shows a friendly save message for an unknown failure", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          context: { objective: null, targetMonth: null, updatedAt: null },
        }),
      )
      .mockRejectedValueOnce("network failure");
    render(<InvestorContextSettings />);
    const objective = await screen.findByRole("textbox", {
      name: /O que você quer alcançar/,
    });
    fireEvent.change(objective, { target: { value: "Uma viagem" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar contexto" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível salvar seu contexto.",
    );
  });

  it("shows a safe save error and keeps the form editable", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          context: { objective: null, targetMonth: null, updatedAt: null },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { message: "Não foi possível salvar seu contexto." },
          false,
        ),
      );
    render(<InvestorContextSettings />);
    const objective = await screen.findByRole("textbox", {
      name: /O que você quer alcançar/,
    });
    fireEvent.change(objective, { target: { value: "Formar uma reserva" } });
    const saveButton = screen.getByRole("button", { name: "Salvar contexto" });
    await waitFor(() =>
      expect((saveButton as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(saveButton);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível salvar seu contexto.",
    );
    expect((objective as HTMLInputElement).disabled).toBe(false);
  });
});
