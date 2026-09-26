// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmergencyReservePositionSuggestionsCard } from "@/app/portfolio/_components/emergency-reserve-position-suggestions";

const holdings = [
  {
    assetKey: "inter-box",
    product: "CDB Inter daily liquidity",
    institution: "Banco Inter",
    value: 30_000,
  },
  {
    assetKey: "inter-named",
    product: "CDB 115% CDI",
    institution: "Banco Inter",
    value: 17_250.9,
  },
  {
    assetKey: "unvalued",
    product: "CDB no value",
    institution: "Banco B",
    value: null,
  },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EmergencyReservePositionSuggestionsCard", () => {
  it("masks typed digits as Brazilian currency and requires review before apply", async () => {
    const onApply = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "suggestions",
        kind: "exact",
        candidates: [
          {
            assetKeys: ["inter-box", "inter-named"],
            total: 47_274.91,
            difference: 0,
          },
        ],
        searchLimited: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <EmergencyReservePositionSuggestionsCard
        holdings={holdings}
        onApply={onApply}
      />,
    );

    const amount = screen.getByLabelText("Valor conhecido da reserva");
    await user.type(amount, "4727491");
    expect((amount as HTMLInputElement).value).toBe("R$ 47.274,91");
    await user.click(screen.getByRole("button", { name: /Buscar combin/ }));

    const review = await screen.findByRole("button", {
      name: /Revisar 2 grupos/,
    });
    expect(review.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Exata")).toBeTruthy();
    expect(screen.queryByText("CDB Inter daily liquidity")).toBeNull();
    expect(screen.queryByRole("button", { name: /Usar esta/ })).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/emergency-reserve/suggestions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetAmount: 47274.91 }),
      },
    );

    await user.click(review);
    expect(review.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("CDB Inter daily liquidity")).toBeTruthy();
    expect(screen.getByText("CDB 115% CDI")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Usar esta/ }));
    expect(onApply).toHaveBeenCalledWith(["inter-box", "inter-named"]);
  });

  it("keeps nearest candidates compact until reviewed", async () => {
    const onApply = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "suggestions",
          kind: "nearest",
          candidates: [
            { assetKeys: ["inter-box"], total: 30_000, difference: 1_000 },
          ],
          searchLimited: false,
        }),
      }),
    );
    const user = userEvent.setup();
    render(
      <EmergencyReservePositionSuggestionsCard
        holdings={holdings.slice(0, 1)}
        onApply={onApply}
      />,
    );
    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "3100000",
    );
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("heading", { name: /Nenhuma combin/ }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Diferen/).nextElementSibling?.textContent,
    ).toContain("1.000,00");
    expect(screen.queryByText("CDB Inter daily liquidity")).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("keeps the input locked while a request is pending", async () => {
    let resolveResponse: (response: {
      ok: boolean;
      json: () => Promise<{ status: string }>;
    }) => void = () => {};
    const pendingResponse = new Promise<{
      ok: boolean;
      json: () => Promise<{ status: string }>;
    }>((resolve) => {
      resolveResponse = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pendingResponse),
    );
    const user = userEvent.setup();
    render(
      <EmergencyReservePositionSuggestionsCard
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    const amount = screen.getByLabelText("Valor conhecido da reserva");
    const search = screen.getByRole("button", { name: /Buscar combin/ });
    await user.type(amount, "10000");
    await user.click(search);
    expect(amount.getAttribute("disabled")).not.toBeNull();
    expect(search.getAttribute("disabled")).not.toBeNull();
    resolveResponse({
      ok: true,
      json: async () => ({ status: "no_valued_positions" }),
    });
    expect(await screen.findByText(/grupos com valor atual/)).toBeTruthy();
  });

  it("rejects empty and zero values without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <EmergencyReservePositionSuggestionsCard
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    const amount = screen.getByLabelText("Valor conhecido da reserva");
    const search = screen.getByRole("button", { name: /Buscar combin/ });
    await user.click(search);
    expect(amount.getAttribute("aria-invalid")).toBe("true");
    expect(await screen.findByRole("alert")).toBeTruthy();
    await user.clear(amount);
    await user.type(amount, "0");
    await user.click(search);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "valor maior que zero",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a safe fallback when the API error has no message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );
    const user = userEvent.setup();
    render(
      <EmergencyReservePositionSuggestionsCard
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "10000",
    );
    await user.click(screen.getByRole("button", { name: /Buscar combin/ }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Tente novamente.",
    );
  });

  it("shows partial-search and tied-alternative limits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "suggestions",
          kind: "nearest",
          candidates: [
            { assetKeys: ["inter-box"], total: 30_000, difference: 1_000 },
          ],
          searchLimited: true,
          alternativesLimited: true,
        }),
      }),
    );
    const user = userEvent.setup();
    render(
      <EmergencyReservePositionSuggestionsCard
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "3100000",
    );
    await user.click(screen.getByRole("button", { name: /Buscar combin/ }));
    expect(
      await screen.findByRole("heading", { name: /Busca parcial/ }),
    ).toBeTruthy();
    expect(screen.getByText(/A busca atingiu/)).toBeTruthy();
    expect(screen.getByText(/outras alternativas/)).toBeTruthy();
  });

  it("renders invalid, oversized, and empty-result response states", async () => {
    const results = [
      { status: "invalid_target" },
      { status: "too_many_positions", maximum: 40 },
      {
        status: "suggestions",
        kind: "nearest",
        candidates: [],
        searchLimited: true,
        alternativesLimited: false,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => results.shift(),
      })),
    );
    const user = userEvent.setup();
    render(
      <EmergencyReservePositionSuggestionsCard
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "10000",
    );
    const search = screen.getByRole("button", { name: /Buscar combin/ });
    await user.click(search);
    expect(await screen.findByText(/Informe um valor/)).toBeTruthy();
    await user.click(search);
    expect(await screen.findByText(/comporta/)).toBeTruthy();
    await user.click(search);
    expect(
      await screen.findByText(/selecionar os grupos manualmente/),
    ).toBeTruthy();
    expect(screen.getByText(/A busca foi limitada/)).toBeTruthy();
  });

  it("shows a safe API message and can retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "Falha segura." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "no_valued_positions" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <EmergencyReservePositionSuggestionsCard
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "10000",
    );
    const search = screen.getByRole("button", { name: /Buscar combin/ });
    await user.click(search);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Falha segura.",
    );
    await user.click(search);
    expect(await screen.findByText(/grupos com valor atual/)).toBeTruthy();
  });
  it("leaves the field empty when input has no digits", async () => {
    const user = userEvent.setup();
    render(
      <EmergencyReservePositionSuggestionsCard
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    const amount = screen.getByLabelText("Valor conhecido da reserva");
    await user.type(amount, "abc");
    expect((amount as HTMLInputElement).value).toBe("");
  });

  it("keeps multiple exact alternatives visible for review", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "suggestions",
          kind: "exact",
          candidates: [
            { assetKeys: ["inter-box"], total: 100, difference: 0 },
            { assetKeys: ["inter-named"], total: 100, difference: 0 },
          ],
          searchLimited: false,
          alternativesLimited: false,
        }),
      }),
    );
    const user = userEvent.setup();
    render(
      <EmergencyReservePositionSuggestionsCard
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "10000",
    );
    await user.click(screen.getByRole("button", { name: /Buscar combin/ }));
    expect(
      await screen.findByRole("heading", {
        name: /Mais de uma combina.*corresponde ao valor/,
      }),
    ).toBeTruthy();
    expect(screen.getAllByText("Exata")).toHaveLength(2);
  });
  it("handles unavailable native selection data", () => {
    render(
      <EmergencyReservePositionSuggestionsCard
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    const amount = screen.getByLabelText(
      "Valor conhecido da reserva",
    ) as HTMLInputElement;
    Object.defineProperties(amount, {
      selectionStart: { configurable: true, value: null },
      selectionEnd: { configurable: true, value: null },
      selectionDirection: { configurable: true, value: null },
    });

    fireEvent.change(amount, { target: { value: "1234" } });

    expect(amount.value).toBe("R$ 12,34");
  });

  it("restores the caret around empty and normalized digit input", async () => {
    const user = userEvent.setup();
    render(
      <EmergencyReservePositionSuggestionsCard
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    const amount = screen.getByLabelText(
      "Valor conhecido da reserva",
    ) as HTMLInputElement;
    await user.type(amount, "1");

    fireEvent.change(amount, {
      target: { value: "21", selectionStart: 0, selectionEnd: 0 },
    });
    expect(amount.value).toBe("R$ 0,21");
    expect(amount.selectionStart).toBe(3);

    fireEvent.change(amount, {
      target: { value: "abc", selectionStart: 0, selectionEnd: 0 },
    });
    expect(amount.value).toBe("");
    expect(amount.selectionStart).toBe(0);

    fireEvent.change(amount, {
      target: { value: "0001234", selectionStart: 6, selectionEnd: 6 },
    });
    expect(amount.value).toBe("R$ 12,34");
    expect(amount.selectionStart).toBe(amount.value.length);
  });

  it("keeps the caret beside the edited digits in the formatted amount", async () => {
    const user = userEvent.setup();
    render(
      <EmergencyReservePositionSuggestionsCard
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    const amount = screen.getByLabelText(
      "Valor conhecido da reserva",
    ) as HTMLInputElement;
    await user.type(amount, "4727491");
    amount.setSelectionRange(4, 4);
    await user.keyboard("9");
    expect(amount.value).toBe("R$ 497.274,91");
    expect(amount.selectionStart).toBe(5);
  });
});
