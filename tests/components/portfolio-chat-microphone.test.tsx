// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import {
  PortfolioChatMicrophone,
  type PortfolioChatMicrophoneHandle,
} from "@/components/portfolio-chat-microphone";

type RecognitionResult = { transcript: string; isFinal: boolean };
type RecognitionMock = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<RecognitionResult>>;
        resultIndex: number;
      }) => void)
    | null;
  onstart: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};
type Availability =
  "available" | "downloadable" | "downloading" | "unavailable";
type RecognitionConstructor = {
  new (): RecognitionMock;
  prototype: { processLocally?: boolean };
  available: ReturnType<typeof vi.fn>;
  install?: ReturnType<typeof vi.fn>;
};

function setupRecognition(
  availability: Availability,
  install?: ReturnType<typeof vi.fn>,
) {
  const recognition: RecognitionMock = {
    lang: "",
    continuous: false,
    interimResults: true,
    processLocally: false,
    onresult: null,
    onstart: null,
    onerror: null,
    onend: null,
    start: vi.fn(),
    stop: vi.fn(),
  };
  recognition.start.mockImplementation(() => recognition.onstart?.());
  const available = vi.fn().mockResolvedValue(availability);
  const constructor = Object.assign(
    function () {
      return recognition;
    },
    { available, ...(install ? { install } : {}) },
  ) as unknown as RecognitionConstructor;
  constructor.prototype.processLocally = false;
  Object.defineProperty(window, "SpeechRecognition", {
    value: constructor,
    configurable: true,
  });
  return { available, constructor, recognition };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as Window & { webkitSpeechRecognition?: unknown })
    .webkitSpeechRecognition;
});

describe("PortfolioChatMicrophone", () => {
  it("uses the webkit recognition constructor when the standard name is absent", async () => {
    const user = userEvent.setup();
    const { available, constructor, recognition } =
      setupRecognition("available");
    delete (window as Window & { SpeechRecognition?: unknown })
      .SpeechRecognition;
    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: constructor,
      configurable: true,
    });
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );

    expect(available).toHaveBeenCalledOnce();
    expect(recognition.start).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Finalizar gravação" }),
    ).toBeTruthy();
  });

  it("installs the local language through the webkit recognition constructor", async () => {
    const user = userEvent.setup();
    const install = vi.fn().mockResolvedValue(true);
    const { constructor } = setupRecognition("downloadable", install);
    delete (window as Window & { SpeechRecognition?: unknown })
      .SpeechRecognition;
    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: constructor,
      configurable: true,
    });
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", {
        name: "Instalar idioma para áudio local",
      }),
    );

    expect(install).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    ).toBeTruthy();
  });

  it("handles recognition being removed after availability was checked", async () => {
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);
    const recordButton = await screen.findByRole("button", {
      name: "Gravar mensagem de voz",
    });
    delete (window as Window & { SpeechRecognition?: unknown })
      .SpeechRecognition;

    fireEvent.click(recordButton);

    expect(recognition.start).not.toHaveBeenCalled();
  });

  it("does not mark an unsupported browser unavailable after unmount", async () => {
    delete (window as Window & { SpeechRecognition?: unknown })
      .SpeechRecognition;
    const { unmount } = render(
      <PortfolioChatMicrophone onTranscript={vi.fn()} />,
    );

    unmount();
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("ignores empty or out-of-range recognition results and reports no speech on end", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={onTranscript} />);

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    recognition.onresult?.({ results: [], resultIndex: 0 });
    recognition.onresult?.({ results: [[]], resultIndex: 0 });
    recognition.onresult?.({
      results: [[{ transcript: "   ", isFinal: true }]],
      resultIndex: 0,
    });
    recognition.onresult?.({
      results: [],
      resultIndex: 1,
    });

    expect(onTranscript).not.toHaveBeenCalled();
    recognition.onend?.();
    expect(await screen.findByText("Sem fala detectada")).toBeTruthy();
  });

  it("explains when local speech recognition is unsupported", async () => {
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);

    expect(await screen.findByText("Áudio indisponível")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Gravar mensagem de voz" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(
      "não oferece transcrição local em português",
    );
  });

  it("starts local recognition when the language is available and passes only the transcript", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    const { available, recognition } = setupRecognition("available");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PortfolioChatMicrophone onTranscript={onTranscript} />);

    const button = await screen.findByRole("button", {
      name: "Gravar mensagem de voz",
    });
    expect(available).toHaveBeenCalledWith({
      langs: ["pt-BR"],
      processLocally: true,
    });
    await user.click(button);

    expect(recognition.lang).toBe("pt-BR");
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.processLocally).toBe(true);
    expect(recognition.start).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Cancelar gravação" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Cancelar gravação" }).parentElement
        ?.className,
    ).toContain("w-full min-w-0");
    expect(
      screen.getByRole("img", { name: "Indicador de gravação" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("img", { name: "Indicador de gravação" })
        .querySelectorAll("span"),
    ).toHaveLength(9);

    recognition.onresult?.({
      results: [[{ transcript: "interim", isFinal: false }]],
      resultIndex: 0,
    });
    expect(onTranscript).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Finalizar gravação" }),
    );
    expect(recognition.stop).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("img", { name: "Indicador de gravação" }),
    ).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "Finalizando a transcrição",
    );

    recognition.onresult?.({
      results: [
        [{ transcript: "  Comprei CDB no banco Inter  ", isFinal: true }],
      ],
      resultIndex: 0,
    });
    expect(onTranscript).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Finalizando transcrição" }),
    ).toBeTruthy();
    expect(screen.getByText("Finalizando…")).toBeTruthy();
    recognition.onend?.();
    expect(await screen.findByText("Revise o texto")).toBeTruthy();
    expect(onTranscript).toHaveBeenCalledExactlyOnceWith(
      "Comprei CDB no banco Inter",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("waits for the recognition start event before showing the listening state", async () => {
    const user = userEvent.setup();
    const { recognition } = setupRecognition("available");
    recognition.start.mockImplementation(() => undefined);
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );

    expect(recognition.start).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Iniciando gravação" }),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Iniciando a transcrição local",
    );
    expect(
      screen.queryByRole("img", { name: "Indicador de gravação" }),
    ).toBeNull();

    act(() => recognition.onstart?.());

    expect(
      screen.getByRole("button", { name: "Finalizar gravação" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Indicador de gravação" }),
    ).toBeTruthy();
  });

  it("times out a start that never becomes active and ignores a late start event", async () => {
    const { recognition } = setupRecognition("available");
    recognition.start.mockImplementation(() => undefined);
    recognition.stop.mockImplementation(() => {
      throw new Error("start never became stoppable");
    });
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);
    const button = await screen.findByRole("button", {
      name: "Gravar mensagem de voz",
    });
    vi.useFakeTimers();

    fireEvent.click(button);
    expect(
      screen.getByRole("button", { name: "Iniciando gravação" }),
    ).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText("Áudio indisponível")).toBeTruthy();
    expect(recognition.stop).toHaveBeenCalledOnce();
    act(() => recognition.onstart?.());
    expect(
      screen.queryByRole("img", { name: "Indicador de gravação" }),
    ).toBeNull();
  });

  it("clears the start timeout on start, recognition error, and unmount", async () => {
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);
    const button = await screen.findByRole("button", {
      name: "Gravar mensagem de voz",
    });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    vi.useFakeTimers();

    fireEvent.click(button);
    expect(vi.getTimerCount()).toBe(0);

    recognition.start.mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Finalizar gravação" }));
    act(() => recognition.onend?.());
    fireEvent.click(
      screen.getByRole("button", { name: "Gravar mensagem de voz" }),
    );
    expect(vi.getTimerCount()).toBe(1);
    act(() => recognition.onerror?.({ error: "not-allowed" }));
    expect(vi.getTimerCount()).toBe(0);

    fireEvent.click(
      screen.getByRole("button", { name: "Gravar mensagem de voz" }),
    );
    expect(vi.getTimerCount()).toBe(1);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the stop control available after a final transcript while listening", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={onTranscript} />);

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    recognition.onresult?.({
      results: [[{ transcript: "Minha fala", isFinal: true }]],
      resultIndex: 0,
    });

    expect(onTranscript).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Finalizar gravação" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Indicador de gravação" }),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Finalizar gravação" }),
    );
    recognition.onend?.();

    expect(await screen.findByText("Revise o texto")).toBeTruthy();
    expect(onTranscript).toHaveBeenCalledExactlyOnceWith("Minha fala");
  });

  it("cancels a recording once when clicked twice and ignores late results", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={onTranscript} />);

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    recognition.onresult?.({
      results: [[{ transcript: "Texto que será descartado", isFinal: true }]],
      resultIndex: 0,
    });

    expect(onTranscript).not.toHaveBeenCalled();
    const lateResult = recognition.onresult;
    const lateEnd = recognition.onend;
    const cancelButton = screen.getByRole("button", {
      name: "Cancelar gravação",
    });
    act(() => {
      fireEvent.click(cancelButton);
      fireEvent.click(cancelButton);
    });

    expect(recognition.stop).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    ).toBeTruthy();
    lateResult?.({
      results: [[{ transcript: "Resultado atrasado", isFinal: true }]],
      resultIndex: 0,
    });
    lateEnd?.();

    expect(onTranscript).not.toHaveBeenCalled();
    expect(screen.getByText("Áudio local")).toBeTruthy();
  });

  it("collects every final Chrome result and publishes it when recognition ends", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={onTranscript} />);

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    recognition.onresult?.({
      results: [
        [{ transcript: "Tenho", isFinal: true }],
        [{ transcript: " mil reais", isFinal: false }],
      ],
      resultIndex: 1,
    });
    recognition.onresult?.({
      results: [
        [{ transcript: "Tenho", isFinal: true }],
        [{ transcript: " mil reais", isFinal: true }],
      ],
      resultIndex: 1,
    });

    expect(onTranscript).not.toHaveBeenCalled();
    recognition.onend?.();

    expect(onTranscript).toHaveBeenCalledExactlyOnceWith("Tenho mil reais");
    expect(await screen.findByText("Revise o texto")).toBeTruthy();
  });

  it("keeps listening through pauses and uses the final result emitted before end", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={onTranscript} />);

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    recognition.onresult?.({
      results: [[{ transcript: "Quanto tenho", isFinal: false }]],
      resultIndex: 0,
    });

    expect(recognition.continuous).toBe(true);
    expect(
      screen.getByRole("button", { name: "Finalizar gravação" }),
    ).toBeTruthy();
    expect(onTranscript).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Finalizar gravação" }),
    );
    recognition.onresult?.({
      results: [[{ transcript: "Quanto tenho no Itaú", isFinal: true }]],
      resultIndex: 0,
    });
    recognition.onend?.();

    expect(onTranscript).toHaveBeenCalledExactlyOnceWith(
      "Quanto tenho no Itaú",
    );
  });

  it("uses the latest interim text only when Chrome ends without a final segment", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={onTranscript} />);

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    recognition.onresult?.({
      results: [[{ transcript: "primeira tentativa", isFinal: false }]],
      resultIndex: 0,
    });
    recognition.onresult?.({
      results: [[{ transcript: "Minha frase completa", isFinal: false }]],
      resultIndex: 0,
    });
    recognition.onend?.();

    expect(onTranscript).toHaveBeenCalledExactlyOnceWith(
      "Minha frase completa",
    );
  });

  it("combines finalized speech and an interim tail when Chrome ends automatically", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={onTranscript} />);

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    recognition.onresult?.({
      results: [[{ transcript: "Tenho", isFinal: true }]],
      resultIndex: 0,
    });
    recognition.onresult?.({
      results: [
        [{ transcript: "Tenho", isFinal: true }],
        [{ transcript: " investimentos no Itaú", isFinal: false }],
      ],
      resultIndex: 1,
    });
    recognition.onend?.();

    expect(onTranscript).toHaveBeenCalledExactlyOnceWith(
      "Tenho investimentos no Itaú",
    );
  });

  it.each(["downloadable", "downloading"] as const)(
    "lets the user install the local language pack when availability is %s",
    async (availability) => {
      const user = userEvent.setup();
      const install = vi.fn().mockResolvedValue(true);
      const { available } = setupRecognition(availability, install);
      render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);

      const installButton = await screen.findByRole("button", {
        name: "Instalar idioma para áudio local",
      });
      expect(available).toHaveBeenCalledWith({
        langs: ["pt-BR"],
        processLocally: true,
      });
      expect(install).not.toHaveBeenCalled();
      await user.click(installButton);

      expect(install).toHaveBeenCalledOnce();
      expect(install).toHaveBeenCalledWith({
        langs: ["pt-BR"],
        processLocally: true,
      });
      expect(
        await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
      ).toBeTruthy();
      expect(screen.getByRole("status").textContent).toContain(
        "A transcrição fica neste dispositivo",
      );
    },
  );

  it("shows an accessible error and allows retry when local language installation returns false", async () => {
    const user = userEvent.setup();
    const install = vi.fn().mockResolvedValue(false);
    setupRecognition("downloadable", install);
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", {
        name: "Instalar idioma para áudio local",
      }),
    );

    expect(await screen.findByText("Falha ao instalar idioma")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Não foi possível instalar o idioma",
    );
    expect(
      screen
        .getByRole("button", {
          name: "Instalar idioma para áudio local",
        })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("shows an accessible error when local language installation rejects", async () => {
    const user = userEvent.setup();
    const install = vi.fn().mockRejectedValue(new Error("internal details"));
    setupRecognition("downloadable", install);
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", {
        name: "Instalar idioma para áudio local",
      }),
    );

    expect(await screen.findByText("Falha ao instalar idioma")).toBeTruthy();
    expect(screen.getByRole("status").textContent).not.toContain(
      "internal details",
    );
  });

  it("remains unavailable when the browser cannot install the local language pack", async () => {
    const user = userEvent.setup();
    setupRecognition("downloadable");
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", {
        name: "Instalar idioma para áudio local",
      }),
    );

    expect(await screen.findByText("Áudio indisponível")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "não oferece transcrição local",
    );
  });

  it("ignores stale recognition callbacks and retries after an error", async () => {
    const user = userEvent.setup();
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);
    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );

    const staleError = recognition.onerror!;
    const staleEnd = recognition.onend!;
    staleError({ error: "not-allowed" });
    staleError({ error: "not-allowed" });
    staleEnd();
    expect(await screen.findByText("Permissão do microfone")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Gravar mensagem de voz" }),
    );
    expect(recognition.start).toHaveBeenCalledTimes(2);
  });

  it("ignores a stop timeout queued after the recognition session ends", async () => {
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);
    const recordButton = await screen.findByRole("button", {
      name: "Gravar mensagem de voz",
    });
    vi.useFakeTimers();
    vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => undefined);
    fireEvent.click(recordButton);
    fireEvent.click(screen.getByRole("button", { name: /Finalizar grava/ }));
    recognition.onerror?.({ error: "not-allowed" });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole("status").textContent).toContain(
      "bloqueou o microfone",
    );
  });

  it("ignores a start timeout queued after recognition has started and ended", async () => {
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);
    const recordButton = await screen.findByRole("button", {
      name: "Gravar mensagem de voz",
    });
    await waitFor(() =>
      expect(recordButton.hasAttribute("disabled")).toBe(false),
    );
    vi.useFakeTimers();
    vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => undefined);

    fireEvent.click(recordButton);
    recognition.onstart?.();
    recognition.onend?.();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText("Sem fala detectada")).toBeTruthy();
    expect(recognition.stop).not.toHaveBeenCalled();
  });

  it("shows no-speech and microphone-permission error states accessibly", async () => {
    const user = userEvent.setup();
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);
    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );

    await user.click(
      screen.getByRole("button", { name: "Finalizar gravação" }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Finalizando a transcrição",
    );
    recognition.onend?.();
    expect(await screen.findByText("Sem fala detectada")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Não detectei fala",
    );

    await user.click(
      screen.getByRole("button", { name: "Gravar mensagem de voz" }),
    );
    expect(recognition.start).toHaveBeenCalledTimes(2);
    recognition.onerror?.({ error: "no-speech" });
    expect(await screen.findByText("Sem fala detectada")).toBeTruthy();
  });

  it("shows a microphone-permission error if it arrives while stopping", async () => {
    const user = userEvent.setup();
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Finalizar gravação" }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Finalizando a transcrição",
    );
    recognition.onerror?.({ error: "not-allowed" });

    expect(await screen.findByText("Permissão do microfone")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "bloqueou o microfone",
    );
  });

  it("explains when the browser cannot find an audio capture device", async () => {
    const user = userEvent.setup();
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);
    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );

    recognition.onerror?.({ error: "audio-capture" });

    expect(await screen.findByText("Microfone não encontrado")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Não encontrei um microfone disponível",
    );
    await user.click(
      screen.getByRole("button", { name: "Gravar mensagem de voz" }),
    );
    expect(recognition.start).toHaveBeenCalledTimes(2);

    recognition.onerror?.({ error: "network" });
    expect(
      await screen.findByText(
        "Não foi possível acessar o microfone ou iniciar a transcrição. Confira a permissão e tente novamente.",
      ),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Gravar mensagem de voz" }),
    );
    expect(recognition.start).toHaveBeenCalledTimes(3);
  });

  it("handles failed local availability checks without enabling microphone use", async () => {
    const { constructor } = setupRecognition("available");
    constructor.available.mockRejectedValue(new Error("internal details"));
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);

    expect(await screen.findByText("Áudio indisponível")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "não oferece transcrição local",
    );
  });

  it("keeps the microphone unavailable when Portuguese cannot be installed", async () => {
    setupRecognition("unavailable");
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);

    expect(await screen.findByText("Áudio indisponível")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "não oferece transcrição local em português",
    );
  });

  it("does not update state when the component unmounts during availability checks", async () => {
    const { constructor, available } = setupRecognition("available");
    let resolveAvailability: ((value: Availability) => void) | undefined;
    constructor.available.mockReturnValue(
      new Promise((resolve) => {
        resolveAvailability = resolve;
      }),
    );
    const { unmount } = render(
      <PortfolioChatMicrophone onTranscript={vi.fn()} />,
    );

    unmount();
    resolveAvailability?.("available");
    await Promise.resolve();

    expect(available).toHaveBeenCalledOnce();
  });

  it("does not change state after a rejected availability check when unmounted", async () => {
    const { constructor, available } = setupRecognition("available");
    let rejectAvailability: ((reason?: unknown) => void) | undefined;
    constructor.available.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectAvailability = reject;
      }),
    );
    const { unmount } = render(
      <PortfolioChatMicrophone onTranscript={vi.fn()} />,
    );

    unmount();
    rejectAvailability?.(new Error("internal details"));
    await Promise.resolve();

    expect(available).toHaveBeenCalledOnce();
  });

  it("shows a safe error when local recognition cannot start", async () => {
    const user = userEvent.setup();
    const { recognition } = setupRecognition("available");
    recognition.start.mockImplementation(() => {
      throw new Error("internal details");
    });
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );

    expect(await screen.findByText("Áudio indisponível")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("transcri");
  });

  it("uses a bounded no-speech fallback when stop never emits onend", async () => {
    const user = userEvent.setup();
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Finalizar gravação" }));
    expect(screen.getByRole("status").textContent).toContain(
      "Finalizando a transcrição",
    );

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText("Sem fala detectada")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Não detectei fala",
    );
    expect(recognition.stop).toHaveBeenCalledOnce();
  });

  it("clears the stopping state when the browser reports an error", async () => {
    const user = userEvent.setup();
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Finalizar gravação" }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Finalizando a transcrição",
    );

    recognition.onerror?.({ error: "not-allowed" });

    expect(await screen.findByText("Permissão do microfone")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "bloqueou o microfone",
    );
  });

  it("reports an error when the browser rejects a stop request", async () => {
    const user = userEvent.setup();
    const { recognition } = setupRecognition("available");
    recognition.stop.mockImplementation(() => {
      throw new Error("stop failed");
    });
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Finalizar gravação" }),
    );

    expect(await screen.findByText("Áudio indisponível")).toBeTruthy();
  });

  it("ignores a result delivered after a recognition error", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={onTranscript} />);

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    recognition.onerror?.({ error: "not-allowed" });
    recognition.onresult?.({
      results: [[{ transcript: "Late result", isFinal: true }]],
      resultIndex: 0,
    });

    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("preserves a final result received during stop if onend never arrives", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={onTranscript} />);

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Finalizar gravação" }));
    recognition.onresult?.({
      results: [[{ transcript: "Minha transcrição final", isFinal: true }]],
      resultIndex: 0,
    });

    act(() => vi.advanceTimersByTime(2000));

    expect(onTranscript).toHaveBeenCalledExactlyOnceWith(
      "Minha transcrição final",
    );
    expect(screen.getByText("Revise o texto")).toBeTruthy();
  });

  it("submits the recognized transcript when the parent requests send during recording", async () => {
    const user = userEvent.setup();
    const ref = createRef<PortfolioChatMicrophoneHandle>();
    const onTranscript = vi.fn();
    const onSubmitTranscript = vi.fn();
    const onRecordingChange = vi.fn();
    const { recognition } = setupRecognition("available");
    render(
      <PortfolioChatMicrophone
        ref={ref}
        onTranscript={onTranscript}
        onSubmitTranscript={onSubmitTranscript}
        onRecordingChange={onRecordingChange}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    expect(onRecordingChange).toHaveBeenLastCalledWith(true);
    ref.current?.finalizeAndSubmit();
    recognition.onresult?.({
      results: [[{ transcript: "Enviar esta pergunta", isFinal: true }]],
      resultIndex: 0,
    });
    recognition.onend?.();

    expect(onTranscript).not.toHaveBeenCalled();
    expect(onSubmitTranscript).toHaveBeenCalledExactlyOnceWith(
      "Enviar esta pergunta",
    );
    expect(onRecordingChange).toHaveBeenLastCalledWith(false);
  });

  it("completes send with an empty transcript when recognition returns no speech", async () => {
    const user = userEvent.setup();
    const ref = createRef<PortfolioChatMicrophoneHandle>();
    const onTranscript = vi.fn();
    const onSubmitTranscript = vi.fn();
    const { recognition } = setupRecognition("available");
    render(
      <PortfolioChatMicrophone
        ref={ref}
        onTranscript={onTranscript}
        onSubmitTranscript={onSubmitTranscript}
        onRecordingChange={vi.fn()}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    ref.current?.finalizeAndSubmit();
    recognition.onend?.();

    expect(onTranscript).not.toHaveBeenCalled();
    expect(onSubmitTranscript).toHaveBeenCalledExactlyOnceWith("");
    expect(await screen.findByText("Sem fala detectada")).toBeTruthy();
  });

  it("stops after recognition starts when send was requested during startup", async () => {
    const user = userEvent.setup();
    const ref = createRef<PortfolioChatMicrophoneHandle>();
    const onSubmitTranscript = vi.fn();
    const { recognition } = setupRecognition("available");
    recognition.start.mockImplementation(() => undefined);
    render(
      <PortfolioChatMicrophone
        ref={ref}
        onTranscript={vi.fn()}
        onSubmitTranscript={onSubmitTranscript}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    ref.current?.finalizeAndSubmit();
    act(() => recognition.onstart?.());
    recognition.onresult?.({
      results: [[{ transcript: "Pergunta por voz", isFinal: true }]],
      resultIndex: 0,
    });
    recognition.onend?.();

    expect(recognition.stop).toHaveBeenCalledOnce();
    expect(onSubmitTranscript).toHaveBeenCalledExactlyOnceWith(
      "Pergunta por voz",
    );
  });

  it("uses the stop fallback when recognition does not emit its end event", async () => {
    const ref = createRef<PortfolioChatMicrophoneHandle>();
    const onSubmitTranscript = vi.fn();
    const { recognition } = setupRecognition("available");
    recognition.start.mockImplementation(() => undefined);
    render(
      <PortfolioChatMicrophone
        ref={ref}
        onTranscript={vi.fn()}
        onSubmitTranscript={onSubmitTranscript}
      />,
    );
    const startButton = await screen.findByRole("button", {
      name: "Gravar mensagem de voz",
    });
    await waitFor(() =>
      expect(startButton.hasAttribute("disabled")).toBe(false),
    );

    fireEvent.click(startButton);
    ref.current?.finalizeAndSubmit();
    act(() => recognition.onstart?.());
    recognition.onresult?.({
      results: [[{ transcript: "Concluída pelo limite", isFinal: true }]],
      resultIndex: 0,
    });
    await new Promise((resolve) => setTimeout(resolve, 2100));

    expect(onSubmitTranscript).toHaveBeenCalledExactlyOnceWith(
      "Concluída pelo limite",
    );
    expect(screen.getByText("Revise o texto")).toBeTruthy();
  });

  it("can convert an in-progress stop into a send request", async () => {
    const user = userEvent.setup();
    const ref = createRef<PortfolioChatMicrophoneHandle>();
    const onSubmitTranscript = vi.fn();
    const { recognition } = setupRecognition("available");
    render(
      <PortfolioChatMicrophone
        ref={ref}
        onTranscript={vi.fn()}
        onSubmitTranscript={onSubmitTranscript}
      />,
    );
    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Finalizar gravação" }),
    );
    ref.current?.finalizeAndSubmit();
    recognition.onresult?.({
      results: [[{ transcript: "Enviar depois de parar", isFinal: true }]],
      resultIndex: 0,
    });
    recognition.onend?.();

    expect(onSubmitTranscript).toHaveBeenCalledExactlyOnceWith(
      "Enviar depois de parar",
    );
  });

  it("ignores a stop fallback queued after cancellation during startup", async () => {
    const user = userEvent.setup();
    const ref = createRef<PortfolioChatMicrophoneHandle>();
    const onSubmitTranscript = vi.fn();
    const { recognition } = setupRecognition("available");
    recognition.start.mockImplementation(() => undefined);
    render(
      <PortfolioChatMicrophone
        ref={ref}
        onTranscript={vi.fn()}
        onSubmitTranscript={onSubmitTranscript}
      />,
    );
    const recordButton = await screen.findByRole("button", {
      name: "Gravar mensagem de voz",
    });
    await waitFor(() =>
      expect(recordButton.hasAttribute("disabled")).toBe(false),
    );
    vi.useFakeTimers();
    vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => undefined);

    fireEvent.click(recordButton);
    ref.current?.finalizeAndSubmit();
    act(() => recognition.onstart?.());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar gravação" }));
    act(() => vi.runOnlyPendingTimers());

    expect(onSubmitTranscript).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Gravar mensagem de voz" }),
    ).toBeTruthy();
  });

  it("ignores a send request when no recognition session exists", async () => {
    const ref = createRef<PortfolioChatMicrophoneHandle>();
    const onSubmitTranscript = vi.fn();
    setupRecognition("available");
    render(
      <PortfolioChatMicrophone
        ref={ref}
        onTranscript={vi.fn()}
        onSubmitTranscript={onSubmitTranscript}
      />,
    );

    ref.current?.finalizeAndSubmit();

    expect(onSubmitTranscript).not.toHaveBeenCalled();
  });

  it("reports a stop failure when send was requested during startup", async () => {
    const user = userEvent.setup();
    const ref = createRef<PortfolioChatMicrophoneHandle>();
    const onSubmitTranscript = vi.fn();
    const { recognition } = setupRecognition("available");
    recognition.start.mockImplementation(() => undefined);
    recognition.stop.mockImplementation(() => {
      throw new Error("recognition could not stop");
    });
    render(
      <PortfolioChatMicrophone
        ref={ref}
        onTranscript={vi.fn()}
        onSubmitTranscript={onSubmitTranscript}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );
    ref.current?.finalizeAndSubmit();
    act(() => recognition.onstart?.());

    expect(await screen.findByText("Áudio indisponível")).toBeTruthy();
    expect(onSubmitTranscript).not.toHaveBeenCalled();
  });
});
