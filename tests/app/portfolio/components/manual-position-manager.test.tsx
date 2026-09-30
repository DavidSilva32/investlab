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
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
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
  classification: {
    assetClass: "Renda variável",
    subClass: "ETF de ações",
    geography: "Exterior",
  },
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
const expandManualPositions = () =>
  fireEvent.click(
    screen.getByRole("button", { name: /posições manuais cadastradas/ }),
  );
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
    expect(screen.getByLabelText("Classe")).toBeTruthy();
    expect(screen.getByLabelText("Subclasse")).toBeTruthy();
    expect(screen.getByLabelText("Geografia")).toBeTruthy();
    submit();
    expect(screen.getByRole("alert").textContent).toContain(
      "Selecione a classe",
    );
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
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<ManualPositionManager positions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /adicionar posição/i }));
    fireEvent.change(screen.getByLabelText("Ativo ou produto"), {
      target: { value: "Tesouro Direto" },
    });
    await choose(user, 0, /Renda fixa/);
    fireEvent.change(screen.getByLabelText("Quantidade"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Valor total (BRL)"), {
      target: { value: "546444" },
    });
    expect(
      (screen.getByLabelText("Valor total (BRL)") as HTMLInputElement).value,
    ).toBe("R$ 5.464,44");
    fireEvent.change(screen.getByLabelText("Data do valor"), {
      target: { value: "20/09/2026" },
    });
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/positions/manual",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          product: "Tesouro Direto",
          assetClass: "Renda fixa",
          subClass: null,
          geography: null,
          assetCode: null,
          institution: null,
          quantity: 1,
          currency: "BRL",
          valueBasis: "total_value",
          unitPrice: null,
          totalValue: 5464.44,
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
      target: { value: "Vanguard S&P 500 ETF" },
    });
    fireEvent.change(screen.getByLabelText("Ticker ou código (opcional)"), {
      target: { value: "VOO" },
    });
    fireEvent.change(screen.getByLabelText("Instituição (opcional)"), {
      target: { value: "Corretora" },
    });
    await choose(user, 0, /Renda variável/);
    await user.click(screen.getByLabelText("Subclasse"));
    fireEvent.change(
      screen.getByPlaceholderText("Digite para filtrar ou informar"),
      { target: { value: "ETF de ações" } },
    );
    await user.click(screen.getByRole("option", { name: "ETF de ações" }));
    await choose(user, 2, /Exterior/);
    await choose(user, 3, /USD/);
    await choose(user, 4, /preço por unidade/i);
    fireEvent.change(screen.getByLabelText("Quantidade"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Preço por unidade (USD)"), {
      target: { value: "5000" },
    });
    fireEvent.change(screen.getByLabelText("Data do valor"), {
      target: { value: "20/09/2026" },
    });
    fireEvent.change(
      screen.getByLabelText("Valor convertido para BRL (opcional)"),
      {
        target: { value: "5654684" },
      },
    );
    expect(
      (
        screen.getByLabelText(
          "Valor convertido para BRL (opcional)",
        ) as HTMLInputElement
      ).value,
    ).toBe("R$ 56.546,84");
    fireEvent.change(screen.getByLabelText("Data da conversão"), {
      target: { value: "21/09/2026" },
    });
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toMatchObject({
      assetClass: "Renda variável",
      subClass: "ETF de ações",
      geography: "Exterior",
      product: "Vanguard S&P 500 ETF",
      assetCode: "VOO",
      institution: "Corretora",
      quantity: 2,
      currency: "USD",
      valueBasis: "unit_price",
      unitPrice: 50,
      totalValue: null,
      convertedValueBrl: 56546.84,
      conversionDate: "2026-09-21",
    });
  }, 10000);

  it("prepopulates and updates an existing manual position", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<ManualPositionManager positions={[row]} />);
    expandManualPositions();
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
    ).toBe("R$ 120,00");
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).id).toBe(row.id);
    expect(toast.success).toHaveBeenCalledWith("Posição atualizada.");
  });

  it("formats the manual amount using the selected EUR currency", () => {
    render(<ManualPositionManager positions={[{ ...row, currency: "EUR" }]} />);
    expandManualPositions();
    fireEvent.click(
      screen.getByRole("button", { name: "Editar ETF internacional" }),
    );
    expect(
      (screen.getByLabelText("Preço por unidade (EUR)") as HTMLInputElement)
        .value,
    ).toBe("€ 50,00");
  });

  it("preserves an unlisted currency code while formatting manual amounts", () => {
    render(<ManualPositionManager positions={[{ ...row, currency: "JPY" }]} />);
    expandManualPositions();
    fireEvent.click(
      screen.getByRole("button", { name: "Editar ETF internacional" }),
    );
    const amount = screen.getByLabelText(
      "Preço por unidade (JPY)",
    ) as HTMLInputElement;
    expect(amount.value).toBe("JPY 50,00");
    fireEvent.change(amount, { target: { value: "" } });
    expect(amount.value).toBe("");
    fireEvent.change(amount, { target: { value: "123456" } });
    expect(amount.value).toBe("JPY 1.234,56");
  });

  it("opens manual positions with missing classification metadata as unclassified", () => {
    const unclassified = {
      ...row,
      classification: { assetClass: null, subClass: null, geography: null },
    };
    render(<ManualPositionManager positions={[unclassified]} />);
    expandManualPositions();
    fireEvent.click(
      screen.getByRole("button", { name: "Editar ETF internacional" }),
    );
    expect(screen.getByLabelText("Classe").textContent).toContain(
      "Selecione uma classe",
    );
    expect(screen.getByLabelText("Geografia").textContent).toContain(
      "Não informado",
    );
  });

  it("uses fallback values when optional manual position fields are absent", async () => {
    render(<ManualPositionManager positions={[emptyRow]} />);
    expandManualPositions();
    fireEvent.click(
      screen.getByRole("button", { name: "Editar Fundo de índice" }),
    );
    expect(
      (screen.getByLabelText("Ticker ou código (opcional)") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(screen.getByLabelText("Moeda").textContent).toContain("BRL");
    expect(
      (screen.getByLabelText("Valor total (BRL)") as HTMLInputElement).value,
    ).toBe("");
  });

  it("shows API messages and a fallback for non-Error failures", async () => {
    const user = userEvent.setup();
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
    await choose(user, 0, /Renda variável/);
    fireEvent.change(screen.getByLabelText("Valor total (BRL)"), {
      target: { value: "10000" },
    });
    fireEvent.change(screen.getByLabelText("Data do valor"), {
      target: { value: "20/09/2026" },
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
    expandManualPositions();
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
    expect(
      screen.getByRole("button", {
        name: /posições manuais cadastradas/,
        expanded: false,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByText(/Código repetido em outra posição manual/),
    ).toBeNull();
    expandManualPositions();
    expect(screen.getAllByText("Manual")).toHaveLength(2);
    expect(
      screen.getByText(/Código repetido em outra posição manual/),
    ).toBeTruthy();
    expect(screen.getByText(/valor de/)).toBeTruthy();
    expect(screen.getByText(/valor não informado/)).toBeTruthy();
    expect(screen.queryByText("Nenhuma posição manual cadastrada.")).toBeNull();
  });
  it("shows the saved portfolio class beside a manual position", () => {
    const classifiedPosition = {
      ...row,
      classification: {
        assetClass: "Fundos",
        subClass: null,
        geography: null,
      },
    };
    render(<ManualPositionManager positions={[classifiedPosition]} />);
    expandManualPositions();
    expect(screen.getByText("Fundos")).toBeTruthy();
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
    expandManualPositions();
    expect(screen.getByText(/50 BRL/)).toBeTruthy();
    expect(screen.getByText(/conversão em data não informada/)).toBeTruthy();
  });
});
