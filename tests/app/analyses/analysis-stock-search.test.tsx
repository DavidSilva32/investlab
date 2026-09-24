// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisStockSearch } from "@/app/analyses/_components/analysis-stock-search";

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
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const response = (
  results: Array<{ ticker: string; name: string }>,
  status = 200,
) => new Response(JSON.stringify({ results }), { status });
async function advanceSearch() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(251);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("AnalysisStockSearch", () => {
  it("exposes a meaningful accessible name for the combobox", () => {
    render(<AnalysisStockSearch ticker="PETR4" onSelect={vi.fn()} />);
    expect(
      screen.getByRole("combobox", { name: "Pesquisar ação" }),
    ).toBeTruthy();
  });
  it("searches dynamically and selects a ticker by click", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValue(response([{ ticker: "VALE3", name: "Vale S.A." }]));
    vi.stubGlobal("fetch", fetcher);
    const onSelect = vi.fn();
    render(<AnalysisStockSearch ticker="PETR4" onSelect={onSelect} />);
    const input = screen.getByRole("combobox", {
      name: "Pesquisar ação",
    });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    fireEvent.change(input, { target: { value: "Vale" } });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    await advanceSearch();
    const option = screen.getByRole("option", { name: /VALE3.*Vale S\.A\./ });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/analyses/stocks/search?q=Vale",
      expect.any(Object),
    );
    fireEvent.click(option);
    expect(onSelect).toHaveBeenCalledWith({
      ticker: "VALE3",
      name: "Vale S.A.",
    });
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("does not search short or currently selected input and supports an empty result", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal("fetch", fetcher);
    render(<AnalysisStockSearch ticker="PETR4" onSelect={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "V" } });
    await advanceSearch();
    fireEvent.change(input, { target: { value: "PETR4" } });
    await advanceSearch();
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "ZZZ" } });
    await advanceSearch();
    expect(screen.getByRole("status").textContent).toBe(
      "Nenhuma ação encontrada.",
    );
  });

  it("shows a helpful error when the search API fails", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
    );
    render(<AnalysisStockSearch ticker="PETR4" onSelect={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Vale" },
    });
    await advanceSearch();
    expect(screen.getByRole("status").textContent).toBe(
      "Não foi possível pesquisar ações agora.",
    );
  });

  it("clears prior options before debounce so Enter cannot select stale results", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response([{ ticker: "PETR3", name: "Petrobras" }]))
      .mockResolvedValueOnce(response([{ ticker: "VALE3", name: "Vale" }]));
    vi.stubGlobal("fetch", fetcher);
    const onSelect = vi.fn();
    render(<AnalysisStockSearch ticker="PETR4" onSelect={onSelect} />);
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    fireEvent.change(input, { target: { value: "Petr" } });
    await advanceSearch();
    expect(screen.getByRole("option", { name: /PETR3/ })).toBeTruthy();
    fireEvent.change(input, { target: { value: "Vale" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("option", { name: /PETR3/ })).toBeNull();
    await advanceSearch();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(
      screen
        .getByRole("option", { name: /VALE3/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith({ ticker: "VALE3", name: "Vale" });
  });

  it("supports Escape and keeps unresolved requests from replacing newer results", async () => {
    vi.useFakeTimers();
    let resolveOld!: (result: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(oldResponse)
      .mockResolvedValueOnce(response([{ ticker: "VALE3", name: "Vale" }]));
    vi.stubGlobal("fetch", fetcher);
    render(<AnalysisStockSearch ticker="PETR4" onSelect={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Petr" } });
    await advanceSearch();
    fireEvent.change(input, { target: { value: "Vale" } });
    await advanceSearch();
    resolveOld(response([{ ticker: "PETR3", name: "Petrobras" }]));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("option", { name: /VALE3/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /PETR3/ })).toBeNull();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).toBeTruthy();
  });
  it("silently ignores a request rejected by its abort signal", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        (_url: string, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () =>
              reject(
                Object.assign(new Error("Aborted"), { name: "AbortError" }),
              ),
            );
          }),
      )
      .mockResolvedValueOnce(response([{ ticker: "VALE3", name: "Vale" }]));
    vi.stubGlobal("fetch", fetcher);
    render(<AnalysisStockSearch ticker="PETR4" onSelect={vi.fn()} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "Petr" } });
    await advanceSearch();
    fireEvent.change(input, { target: { value: "Vale" } });
    await advanceSearch();

    expect(screen.getByRole("option", { name: /VALE3.*Vale/ })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
