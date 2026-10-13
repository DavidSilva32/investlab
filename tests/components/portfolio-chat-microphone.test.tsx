// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortfolioChatMicrophone } from "@/components/portfolio-chat-microphone";

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
    onerror: null,
    onend: null,
    start: vi.fn(),
    stop: vi.fn(),
  };
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
    expect(screen.getByRole("button", { name: /Parar grava/ })).toBeTruthy();
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
    recognition.onresult?.({
      results: [[{ transcript: "   ", isFinal: true }]],
      resultIndex: 0,
    });
    recognition.onresult?.({
      results: [[{ transcript: "late slot", isFinal: true }]],
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
    expect(recognition.processLocally).toBe(true);
    expect(recognition.start).toHaveBeenCalledOnce();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByRole("img", { name: "Indicador de gravação" }),
    ).toBeTruthy();

    recognition.onresult?.({
      results: [[{ transcript: "interim", isFinal: false }]],
      resultIndex: 0,
    });
    expect(onTranscript).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Parar gravação" }));
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
    expect(onTranscript).toHaveBeenCalledExactlyOnceWith(
      "Comprei CDB no banco Inter",
    );
    expect(
      screen.getByRole("button", { name: "Finalizando transcrição" }),
    ).toBeTruthy();
    expect(screen.getByText("Finalizando…")).toBeTruthy();
    recognition.onend?.();
    expect(await screen.findByText("Revise o texto")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
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

    expect(onTranscript).toHaveBeenCalledExactlyOnceWith("Minha fala");
    expect(screen.getByRole("button", { name: "Parar gravação" })).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Indicador de gravação" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Parar gravação" }));
    recognition.onend?.();

    expect(await screen.findByText("Revise o texto")).toBeTruthy();
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
    expect(await screen.findByText("Áudio indisponível")).toBeTruthy();

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
    fireEvent.click(screen.getByRole("button", { name: /Parar grava/ }));
    recognition.onerror?.({ error: "not-allowed" });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole("status").textContent).toContain("transcri");
  });

  it("shows no-speech and microphone-permission error states accessibly", async () => {
    const user = userEvent.setup();
    const { recognition } = setupRecognition("available");
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);
    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );

    await user.click(screen.getByRole("button", { name: "Parar gravação" }));
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
    await user.click(screen.getByRole("button", { name: "Parar gravação" }));
    expect(screen.getByRole("status").textContent).toContain(
      "Finalizando a transcrição",
    );
    recognition.onerror?.({ error: "not-allowed" });

    expect(await screen.findByText("Áudio indisponível")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("transcri");
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
    fireEvent.click(screen.getByRole("button", { name: "Parar gravação" }));
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
    await user.click(screen.getByRole("button", { name: "Parar gravação" }));
    expect(screen.getByRole("status").textContent).toContain(
      "Finalizando a transcrição",
    );

    recognition.onerror?.({ error: "not-allowed" });

    expect(await screen.findByText("Áudio indisponível")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("transcri");
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
    await user.click(screen.getByRole("button", { name: "Parar gravação" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Parar gravação" }));
    recognition.onresult?.({
      results: [[{ transcript: "Minha transcrição final", isFinal: true }]],
      resultIndex: 0,
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(onTranscript).toHaveBeenCalledExactlyOnceWith(
      "Minha transcrição final",
    );
    expect(screen.getByText("Revise o texto")).toBeTruthy();
  });
});
