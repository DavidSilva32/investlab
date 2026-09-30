// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { EmergencyReserveEditor } from "@/app/portfolio/_components/emergency-reserve-editor";

async function openReservePositions(user = userEvent.setup()) {
  const triggers = await screen.findAllByRole("button", {
    name: /Ver \d+ posições/,
  });
  const trigger = triggers[triggers.length - 1];
  await user.click(trigger);
}

const keyA = `v1:${"a".repeat(64)}`;
const keyB = `v1:${"b".repeat(64)}`;
const editorData = {
  monthlyExpenses: 2000,
  targetMonths: 6,
  selectedAssetKeys: [keyA],
  configured: true,
  selectedPositionCount: 1,
  missingSelectionCount: 0,
  calculation: {
    monthlyExpenses: 2000,
    targetMonths: 6,
    selectedValue: 3000,
    selectedGroups: 1,
    unvaluedGroups: 0,
    referenceDate: "2026-09-01",
    targetValue: 12000,
    coveredMonths: 1.5,
    difference: 9000,
    progressPercentage: 25,
    status: "below_target" as const,
  },
  holdings: [
    {
      assetKey: keyA,
      product: "CDB liquidez",
      assetCode: "CDB1",
      institution: "Banco A",
      issuer: "Banco A",
      indexer: "DI",
      maturityAt: "2028-01-01",
      positionCount: 1,
      unvaluedPositions: 0,
      value: 3000,
      selected: true,
    },
    {
      assetKey: keyB,
      product: "Tesouro Selic",
      assetCode: null,
      institution: null,
      issuer: null,
      indexer: "Selic",
      maturityAt: "2029-01-01",
      positionCount: 2,
      unvaluedPositions: 1,
      value: null,
      selected: false,
      assignedObjectiveId: null,
      assignedObjectiveName: null,
    },
  ],
};

describe("EmergencyReserveEditor", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    toast.error.mockReset();
    toast.success.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the complete reserve configuration in a responsive, expanded layout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => editorData }),
    );
    render(<EmergencyReserveEditor />);
    expect(await screen.findByText(/Meta pessoal de 6 meses/)).toBeTruthy();
    expect(await screen.findByLabelText("Custo mensal")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "6 meses" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("R$ 12.000,00")).toBeTruthy();
    const layout = screen.getByTestId("reserve-editor-layout");
    expect(layout.className).toContain(
      "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]",
    );
    expect(screen.getByText(/1 grupo selecionado/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Encontrar grupos pelo valor/ }),
    ).toBeTruthy();
    await openReservePositions();
    const saveFooter = screen.getByTestId("reserve-save-footer");
    expect(saveFooter.className).toContain("w-full min-w-0");
    expect(saveFooter.className).not.toContain("-mx-");
    expect(screen.getByLabelText(/CDB liquidez/)).toBeTruthy();
    expect(screen.getByLabelText(/Tesouro Selic/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Salvar configuração" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "Posições consideradas na reserva" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Buscar grupos pelo valor/ }),
    ).toBeNull();
  });

  it("disables a holding assigned to a different objective", async () => {
    const ownedData = structuredClone(editorData);
    Object.assign(ownedData.holdings[1], {
      assignedObjectiveId: "objective-trip",
      assignedObjectiveName: "Viagem",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ownedData,
      }),
    );
    render(<EmergencyReserveEditor />);

    await openReservePositions();
    expect(await screen.findByLabelText(/Tesouro Selic/)).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText(/Vinculada a Viagem/)).toBeTruthy();
  });

  it("uses a responsive loading scaffold before the reserve data arrives", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<EmergencyReserveEditor />);

    expect(screen.getByRole("status").textContent).toContain("Carregando");
    const loadingLayout = screen.getByTestId("reserve-editor-loading-layout");
    expect(loadingLayout.className).toContain(
      "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]",
    );
    expect(loadingLayout.querySelectorAll(".animate-pulse")).toHaveLength(4);
    expect(screen.queryByLabelText("Custo mensal")).toBeNull();
  });

  it("explains when the personal target has not been configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...editorData,
          configured: false,
          targetMonths: null,
        }),
      }),
    );
    render(<EmergencyReserveEditor />);

    expect(
      await screen.findByText(/Configuração pessoal ainda não definida/),
    ).toBeTruthy();
  });

  it("reloads the reserve after the portfolio changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => editorData,
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />);

    await screen.findByLabelText("Custo mensal");
    window.dispatchEvent(new Event("portfolio:updated"));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/emergency-reserve");
  });

  it("loads groups and saves the user's selection and personal target", async () => {
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => ({
      ok: true,
      json: async () =>
        options?.method === "PUT"
          ? {
              ...editorData,
              monthlyExpenses: null,
              targetMonths: null,
              selectedAssetKeys: [keyA, keyB],
              message: "Reserva salva pela API.",
            }
          : editorData,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<EmergencyReserveEditor />);

    await screen.findByLabelText("Custo mensal");
    await openReservePositions(user);
    const first = await screen.findByLabelText(/CDB liquidez/);
    await user.click(first);
    await user.click(first);
    const second = await screen.findByLabelText(/Tesouro Selic/);
    await user.click(second);
    await user.click(screen.getByRole("button", { name: /^Salvar configura/ }));

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("Reserva salva pela API.");
    const saveCall = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "PUT",
    );
    expect(JSON.parse(saveCall?.[1]?.body as string)).toEqual({
      monthlyExpenses: 2000,
      targetMonths: 6,
      selectedAssetKeys: [keyA, keyB],
    });
    expect(
      screen.getByText(/Somente grupos classificados como renda fixa/),
    ).toBeTruthy();
  });

  it("shows a validation message when the cost is invalid", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...editorData,
        monthlyExpenses: null,
        targetMonths: null,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />);

    await screen.findByLabelText("Custo mensal");
    fireEvent.change(screen.getByLabelText("Custo mensal"), {
      target: { value: "0" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Salvar configuração" })
        .closest("form")!,
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Informe um custo mensal maior que zero e de até R$ 1.000.000.000.000,00.",
    );
  });

  it("enforces the same upper bound as the API for the month target", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => editorData,
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />);

    await user.click(
      await screen.findByRole("button", { name: "Personalizado" }),
    );
    const monthInput = await screen.findByLabelText("Quantidade de meses");
    expect(monthInput.getAttribute("max")).toBe("1200");
    fireEvent.change(screen.getByLabelText("Quantidade de meses"), {
      target: { value: "1201" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Salvar configuração" })
        .closest("form")!,
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Informe sua meta pessoal como um número inteiro de 1 a 1200 meses.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves a custom month value across shortcut changes and explains the shortcuts", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...editorData, targetMonths: 9 }),
      }),
    );
    render(<EmergencyReserveEditor />);

    await screen.findByText("R$ 18.000,00");
    await user.click(screen.getByRole("button", { name: "12 meses" }));
    expect(screen.queryByLabelText("Quantidade de meses")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Personalizado" }));
    expect(
      (screen.getByLabelText("Quantidade de meses") as HTMLInputElement).value,
    ).toBe("9");
    await user.click(screen.getByRole("button", { name: "Sobre os atalhos" }));
    expect(
      await screen.findByText(/estabilidade e previsibilidade da sua renda/),
    ).toBeTruthy();
    expect(screen.getByText(/Os atalhos não são recomendações/)).toBeTruthy();
  });

  it("allows removing unmatched selections before saving", async () => {
    const staleKey = "v1:" + "c".repeat(64);
    const initial = {
      ...editorData,
      selectedAssetKeys: [keyA, staleKey],
      missingSelectionCount: 1,
    };
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => ({
      ok: true,
      json: async () => (options?.method === "PUT" ? editorData : initial),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />);

    await screen.findByLabelText("Custo mensal");
    await openReservePositions(user);
    await screen.findByRole("button", {
      name: "Remover grupos sem correspondência",
    });
    await user.click(
      screen.getByRole("button", {
        name: "Remover grupos sem correspondência",
      }),
    );
    await user.click(screen.getByRole("button", { name: /^Salvar configura/ }));

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    const saveCall = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "PUT",
    );
    expect(JSON.parse(saveCall?.[1]?.body as string).selectedAssetKeys).toEqual(
      [keyA],
    );
  });

  it("shows the no-positions state and reports save conflicts once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...editorData, holdings: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          message:
            "Esta posição já está vinculada ao objetivo Viagem. Remova-a desse objetivo antes de incluí-la na reserva.",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />);

    await screen.findByLabelText("Custo mensal");
    await openReservePositions(user);
    expect(
      await screen.findByText(/Importe uma posição da carteira/),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^Salvar configura/ }));
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Esta posição já está vinculada ao objetivo Viagem. Remova-a desse objetivo antes de incluí-la na reserva.",
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses a generic toast for unexpected save failures without an error message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => editorData })
      .mockRejectedValueOnce("network failure");
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />);

    await screen.findByLabelText("Custo mensal");
    await user.click(screen.getByRole("button", { name: /^Salvar configura/ }));

    expect(toast.error).toHaveBeenCalledWith(
      "Não foi possível salvar a configuração. Tente novamente.",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps a blocking load failure inline and offers retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "load failed" }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => editorData });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />);

    await screen.findByRole("button", { name: "Tentar novamente" });
    expect(await screen.findByText("load failed")).toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Tentar novamente/ }));

    await openReservePositions(user);
    expect(await screen.findByLabelText(/Tesouro Selic/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses a fixed inline fallback when loading rejects at the network", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("private transport detail"))
      .mockResolvedValueOnce({ ok: true, json: async () => editorData });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />);

    expect(
      await screen.findAllByText(
        "Não foi possível carregar a configuração da reserva.",
      ),
    ).toHaveLength(2);
    expect(screen.queryByText("private transport detail")).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByLabelText("Custo mensal");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("EmergencyReserveEditor suggestion application", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("applies a suggestion to the unsaved selection and saves only on submit", async () => {
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => ({
      ok: true,
      json: async () => {
        if (options?.method === "POST") {
          return {
            status: "suggestions",
            kind: "exact",
            candidates: [{ assetKeys: [keyB], total: 1000, difference: 0 }],
            searchLimited: false,
            alternativesLimited: false,
          };
        }
        if (options?.method === "PUT") {
          return { ...editorData, selectedAssetKeys: [keyB] };
        }
        return editorData;
      },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />);
    await user.click(
      await screen.findByRole("button", {
        name: /Encontrar grupos pelo valor/,
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: /^Buscar combina/ }),
    );

    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "100000",
    );
    await user.click(screen.getByRole("button", { name: /^Buscar combina/ }));
    await openReservePositions(user);
    await user.click(screen.getByRole("button", { name: "Ver 1 posições" }));
    await user.click(
      await screen.findByRole("button", { name: "Usar esta combinação" }),
    );
    expect(
      screen.getByText(/Combinação selecionada como rascunho/).textContent,
    ).toContain("Salve a configuração");
    expect(
      screen
        .getByRole("checkbox", { name: /Tesouro Selic/ })
        .getAttribute("data-state"),
    ).toBe("checked");
    expect(
      screen
        .getByRole("checkbox", { name: /CDB liquidez/ })
        .getAttribute("data-state"),
    ).toBe("unchecked");
    expect(
      fetchMock.mock.calls.some(([, options]) => options?.method === "PUT"),
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: /^Salvar configura/ }));
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, options]) => options?.method === "PUT"),
      ).toBe(true),
    );
    const saveCall = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "PUT",
    );
    expect(JSON.parse(saveCall?.[1]?.body as string).selectedAssetKeys).toEqual(
      [keyB],
    );
  });

  it("requires confirmation before transferring a suggested position", async () => {
    const ownedData = structuredClone(editorData);
    Object.assign(ownedData.holdings[0], {
      assignedObjectiveId: "00000000-0000-4000-8000-000000000099",
      assignedObjectiveName: "Viagem",
    });
    Object.assign(ownedData.holdings[1], {
      assignedObjectiveId: "00000000-0000-4000-8000-000000000099",
      assignedObjectiveName: "Viagem",
    });
    const transfer = {
      assetKey: keyB,
      product: "Tesouro Selic",
      value: 1000,
      fromObjectiveId: "00000000-0000-4000-8000-000000000099",
      fromObjectiveName: "Viagem",
      toObjectiveId: "00000000-0000-4000-8000-000000000010",
    };
    const firstTransfer = {
      ...transfer,
      assetKey: keyA,
      product: "CDB liquidez",
      value: 3000,
    };
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => ({
      ok: true,
      json: async () => {
        if (options?.method === "POST") {
          return {
            status: "suggestions",
            kind: "exact",
            candidates: [
              {
                assetKeys: [keyA, keyB],
                total: 4000,
                difference: 0,
                transfers: [firstTransfer, transfer],
                impacts: [
                  {
                    objectiveId: "00000000-0000-4000-8000-000000000099",
                    objectiveName: "Viagem",
                    currentValue: null,
                    knownValue: 5000,
                    targetAmount: null,
                    progressPercent: null,
                    transferredValue: 4000,
                    transferredPositionCount: 2,
                  },
                  {
                    objectiveId: "00000000-0000-4000-8000-000000000010",
                    objectiveName: "Reserva",
                    currentValue: 4000,
                    knownValue: 4000,
                    targetAmount: 4000,
                    progressPercent: 100,
                    transferredValue: 4000,
                    transferredPositionCount: 2,
                  },
                ],
              },
            ],
            searchLimited: false,
            alternativesLimited: false,
          };
        }
        if (options?.method === "PUT") return editorData;
        return ownedData;
      },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />);

    await user.click(
      await screen.findByRole("button", {
        name: /Encontrar grupos pelo valor/,
      }),
    );
    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "100000",
    );
    await user.click(screen.getByRole("button", { name: /^Buscar combina/ }));
    const suggestionRequest = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "POST",
    );
    expect(JSON.parse(suggestionRequest?.[1]?.body as string)).toMatchObject({
      targetAmount: 1000,
      reserveTargetAmount: 12000,
    });
    const positionToggles = await screen.findAllByRole("button", {
      name: "Ver 2 posições",
    });
    await user.click(positionToggles[positionToggles.length - 1]);
    expect(screen.getAllByText("Tesouro Selic")).toHaveLength(1);
    await user.click(
      await screen.findByRole("button", { name: "Usar e transferir" }),
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getAllByText(/De Viagem para Reserva/)).toHaveLength(
      2,
    );
    expect(within(dialog).getByText(/total indisponível/)).toBeTruthy();
    expect(
      within(dialog).getByText(/Reserva: R\$ 4\.000,00 de R\$ 4\.000,00/),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([, options]) => options?.method === "PUT"),
    ).toBe(false);
    expect(
      within(dialog).getByRole("button", { name: "Usar e transferir" }),
    ).toBeTruthy();

    await user.click(
      within(dialog).getByRole("button", { name: "Usar e transferir" }),
    );
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, options]) => options?.method === "PUT"),
      ).toBe(true),
    );
    const put = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "PUT",
    );
    expect(JSON.parse(put?.[1]?.body as string)).toMatchObject({
      selectedAssetKeys: [keyA, keyB],
      transfers: [firstTransfer, transfer],
    });
    const confirmation = await screen.findByText(
      /2 posições foram transferidas de Viagem para Reserva/,
    );
    expect(confirmation.textContent).toMatch(
      /Viagem agora possui total indisponível; R\$\s5\.000,00 conhecidos/,
    );
  });

  it("cancels a transfer confirmation without changing selection or sending PUT", async () => {
    const ownedData = structuredClone(editorData);
    Object.assign(ownedData.holdings[1], {
      assignedObjectiveId: "00000000-0000-4000-8000-000000000099",
      assignedObjectiveName: "Viagem",
    });
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => ({
      ok: true,
      json: async () =>
        options?.method === "POST"
          ? {
              status: "suggestions",
              kind: "exact",
              candidates: [
                {
                  assetKeys: [keyB],
                  total: 1000,
                  difference: 0,
                  transfers: [
                    {
                      assetKey: keyB,
                      product: "Tesouro Selic",
                      value: 1000,
                      fromObjectiveId: "00000000-0000-4000-8000-000000000099",
                      fromObjectiveName: "Viagem",
                      toObjectiveId: "00000000-0000-4000-8000-000000000010",
                    },
                  ],
                },
              ],
              searchLimited: false,
              alternativesLimited: false,
            }
          : ownedData,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />);

    await user.click(
      await screen.findByRole("button", {
        name: /Encontrar grupos pelo valor/,
      }),
    );
    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "100000",
    );
    await user.click(screen.getByRole("button", { name: /^Buscar combina/ }));
    await user.click(
      await screen.findByRole("button", { name: "Usar e transferir" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(await screen.queryByRole("alertdialog")).toBeNull();

    expect(
      fetchMock.mock.calls.some(([, options]) => options?.method === "PUT"),
    ).toBe(false);
    await openReservePositions(user);
    expect(
      screen
        .getByRole("checkbox", { name: /CDB liquidez/ })
        .getAttribute("data-state"),
    ).toBe("checked");
    expect(
      screen
        .getByRole("checkbox", { name: /Tesouro Selic/ })
        .getAttribute("data-state"),
    ).toBe("unchecked");
  });

  it("shows a known source balance and singular success after one transfer", async () => {
    const ownedData = structuredClone(editorData);
    Object.assign(ownedData.holdings[1], {
      assignedObjectiveId: "00000000-0000-4000-8000-000000000099",
      assignedObjectiveName: "Viagem",
    });
    const transfer = {
      assetKey: keyB,
      product: "Tesouro Selic",
      value: 1000,
      fromObjectiveId: "00000000-0000-4000-8000-000000000099",
      fromObjectiveName: "Viagem",
      toObjectiveId: "00000000-0000-4000-8000-000000000010",
    };
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => ({
      ok: true,
      json: async () =>
        options?.method === "POST"
          ? {
              status: "suggestions",
              kind: "exact",
              candidates: [
                {
                  assetKeys: [keyB],
                  total: 1000,
                  difference: 0,
                  transfers: [transfer],
                  impacts: [
                    {
                      objectiveId: transfer.fromObjectiveId,
                      objectiveName: "Viagem",
                      currentValue: 6000,
                      knownValue: 6000,
                      targetAmount: 10000,
                      progressPercent: 60,
                      transferredValue: 1000,
                      transferredPositionCount: 1,
                    },
                  ],
                },
              ],
              searchLimited: false,
              alternativesLimited: false,
            }
          : options?.method === "PUT"
            ? editorData
            : ownedData,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmergencyReserveEditor />);

    await user.click(
      await screen.findByRole("button", {
        name: /Encontrar grupos pelo valor/,
      }),
    );
    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "100000",
    );
    await user.click(screen.getByRole("button", { name: /^Buscar combina/ }));
    await user.click(
      await screen.findByRole("button", { name: "Usar e transferir" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(
        /Viagem: R\$ 6\.000,00 de R\$ 10\.000,00 \(60\.0%\)/,
      ),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: "Usar e transferir" }),
    );

    const success = await screen.findByText(
      /1 posição foi transferida de Viagem para Reserva/,
    );
    expect(success.textContent).toMatch(
      /Viagem agora possui R\$\s6\.000,00 de R\$\s10\.000,00/,
    );
    expect(toast.success).toHaveBeenCalledWith(success.textContent);
    const put = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "PUT",
    );
    expect(JSON.parse(put?.[1]?.body as string)).toMatchObject({
      selectedAssetKeys: [keyB],
      transfers: [transfer],
    });
  });
});
