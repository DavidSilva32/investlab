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

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: () => {},
  });
  Object.defineProperty(Element.prototype, "hasPointerCapture", {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(Element.prototype, "setPointerCapture", {
    configurable: true,
    value: () => {},
  });
  Object.defineProperty(Element.prototype, "releasePointerCapture", {
    configurable: true,
    value: () => {},
  });
});

import { ManualPositionManager } from "@/app/portfolio/_components/manual-position-manager";

const row = {
  id: "0fefb48f-b6d9-4b8e-890d-95fe4fe7b305",
  source: "MANUAL",
  product: "ETF internacional",
  indexer: null,
  issuedAt: null,
  maturityAt: null,
  assetCode: "VT",
  institution: "Corretora",
  quantity: "2",
  unitPrice: "50",
  totalValue: "120",
  reportedTotalValue: "100",
  currency: "USD",
  valueBasis: "unit_price" as const,
  positionDate: "2026-09-20",
  convertedValueBrl: "120",
  conversionDate: "2026-09-19",
  duplicateAssetCode: true,
};
const emptyRow = {
  ...row,
  id: "22d22f4a-6605-4a7d-8d6e-427dbe593ea3",
  product: "Fundo de índice",
  assetCode: null,
  institution: null,
  currency: undefined,
  valueBasis: undefined,
  unitPrice: null,
  totalValue: null,
  reportedTotalValue: null,
  positionDate: undefined,
  convertedValueBrl: null,
  conversionDate: null,
  duplicateAssetCode: false,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const submit = () => {
  const form = screen.getByRole("dialog").querySelector("form");
  if (!form) throw new Error("form missing");
  fireEvent.submit(form);
};
const choose = async (
  user: ReturnType<typeof userEvent.setup>,
  index: number,
  optionName: RegExp,
) => {
  await user.click(screen.getAllByRole("combobox")[index]);
  await user.click(await screen.findByRole("option", { name: optionName }));
};
const jsonResponse = (ok = true, body: unknown = {}) => ({
  ok,
  json: async () => body,
});

describe("ManualPositionManager", () => {
  it("opens the accessible form and explains explicit foreign conversion", () => {
    render(<ManualPositionManager positions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /adicionar posição/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText("Ativo ou produto")).toBeTruthy();
    expect(
      screen.getByText(
        /não consulta cotação nem converte moeda automaticamente/i,
      ),
    ).toBeTruthy();
  });

  it("closes the form through its cancel action", () => {
    render(<ManualPositionManager positions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /adicionar posição/i }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("creates a BRL total-value position and clears empty optional fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<ManualPositionManager positions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /adicionar posição/i }));
    fireEvent.change(screen.getByLabelText("Ativo ou produto"), {
      target: { value: "Tesouro Direto" },
    });
    fireEvent.change(screen.getByLabelText("Quantidade"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Valor total (BRL)"), {
      target: { value: "400" },
    });
    fireEvent.change(screen.getByLabelText("Data do valor"), {
      target: { value: "2026-09-20" },
    });
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/positions/manual",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          product: "Tesouro Direto",
          assetCode: null,
          institution: null,
          quantity: 1,
          currency: "BRL",
          valueBasis: "total_value",
          unitPrice: null,
          totalValue: 400,
          positionDate: "2026-09-20",
          convertedValueBrl: null,
          conversionDate: null,
        }),
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Posição adicionada.");
  });

  it("creates a foreign unit-price position with explicit BRL conversion", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<ManualPositionManager positions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /adicionar posição/i }));
    fireEvent.change(screen.getByLabelText("Ativo ou produto"), {
      target: { value: "ETF internacional" },
    });
    fireEvent.change(screen.getByLabelText("Ticker ou código (opcional)"), {
      target: { value: "VT" },
    });
    fireEvent.change(screen.getByLabelText("Instituição (opcional)"), {
      target: { value: "Corretora" },
    });
    await choose(user, 0, /USD/);
    await choose(user, 1, /preço por unidade/i);
    fireEvent.change(screen.getByLabelText("Quantidade"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Preço por unidade (USD)"), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByLabelText("Data do valor"), {
      target: { value: "2026-09-20" },
    });
    fireEvent.change(
      screen.getByLabelText("Valor convertido para BRL (opcional)"),
      {
        target: { value: "600" },
      },
    );
    fireEvent.change(screen.getByLabelText("Data da conversão"), {
      target: { value: "2026-09-21" },
    });
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toMatchObject({
      assetCode: "VT",
      institution: "Corretora",
      quantity: 2,
      currency: "USD",
      valueBasis: "unit_price",
      unitPrice: 50,
      totalValue: null,
      convertedValueBrl: 600,
      conversionDate: "2026-09-21",
    });
  });

  it("prepopulates and updates an existing manual position", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<ManualPositionManager positions={[row]} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Editar ETF internacional" }),
    );
    expect(
      (screen.getByLabelText("Ativo ou produto") as HTMLInputElement).value,
    ).toBe("ETF internacional");
    expect(
      (
        screen.getByLabelText(
          "Valor convertido para BRL (opcional)",
        ) as HTMLInputElement
      ).value,
    ).toBe("120");
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).id).toBe(row.id);
    expect(toast.success).toHaveBeenCalledWith("Posição atualizada.");
  });

  it("uses fallback values when optional manual position fields are absent", async () => {
    render(<ManualPositionManager positions={[emptyRow]} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Editar Fundo de índice" }),
    );
    expect(
      (screen.getByLabelText("Ticker ou código (opcional)") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(
      (screen.getAllByRole("combobox")[0] as HTMLButtonElement).textContent,
    ).toContain("BRL");
    expect(
      (screen.getByLabelText("Valor total (BRL)") as HTMLInputElement).value,
    ).toBe("");
  });

  it("shows API messages and a fallback for non-Error failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(false, { message: "Dados inválidos." }),
      )
      .mockRejectedValueOnce("offline");
    vi.stubGlobal("fetch", fetchMock);
    render(<ManualPositionManager positions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /adicionar posição/i }));
    fireEvent.change(screen.getByLabelText("Ativo ou produto"), {
      target: { value: "ETF" },
    });
    fireEvent.change(screen.getByLabelText("Valor total (BRL)"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("Data do valor"), {
      target: { value: "2026-09-20" },
    });
    submit();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Dados inválidos."),
    );
    submit();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar a posição.",
      ),
    );
  });

  it("removes a position only after confirmation and handles API failures", async () => {
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse())
      .mockResolvedValueOnce(
        jsonResponse(false, { message: "Exclusão recusada." }),
      )
      .mockRejectedValueOnce(new Error("Falha interna"))
      .mockRejectedValueOnce("offline");
    vi.stubGlobal("fetch", fetchMock);
    render(<ManualPositionManager positions={[row]} />);
    const remove = () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Remover ETF internacional" }),
      );
    remove();
    expect(fetchMock).not.toHaveBeenCalled();
    remove();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Posição removida."),
    );
    remove();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Exclusão recusada."),
    );
    remove();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Falha interna"),
    );
    remove();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível remover a posição.",
      ),
    );
    expect(confirm).toHaveBeenCalledTimes(5);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("renders duplicate codes, source, conversion and valuation dates", () => {
    render(
      <ManualPositionManager
        positions={[
          row,
          emptyRow,
          { ...emptyRow, id: "imported", source: "B3" },
        ]}
      />,
    );
    expect(screen.getAllByText("Manual")).toHaveLength(2);
    expect(
      screen.getByText(/Código repetido em outra posição manual/),
    ).toBeTruthy();
    expect(screen.getByText(/valor de/)).toBeTruthy();
    expect(screen.getByText(/valor não informado/)).toBeTruthy();
    expect(screen.queryByText("Nenhuma posição manual cadastrada.")).toBeNull();
  });
  it("uses fallback currency and conversion text when value metadata is partial", () => {
    const currencyFallback = { ...emptyRow, reportedTotalValue: "50" };
    const missingConversionDate = {
      ...row,
      conversionDate: null,
    };
    render(
      <ManualPositionManager
        positions={[currencyFallback, missingConversionDate]}
      />,
    );
    expect(screen.getByText(/50 BRL/)).toBeTruthy();
    expect(screen.getByText(/conversão em data não informada/)).toBeTruthy();
  });
});
