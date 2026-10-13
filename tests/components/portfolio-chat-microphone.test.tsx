// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortfolioChatMicrophone } from "@/components/portfolio-chat-microphone";

type RecognitionResult = {
  transcript: string;
};
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
});

describe("PortfolioChatMicrophone", () => {
  it("explains when local speech recognition is unsupported and leaves typed input available", async () => {
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

  it("requires browser-local availability and sends only the transcript to the caller", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
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
    const available = vi.fn().mockResolvedValue("available");
    const constructor = Object.assign(
      function () {
        return recognition;
      },
      { available },
    ) as unknown as {
      new (): RecognitionMock;
      prototype: { processLocally?: boolean };
      available: typeof available;
    };
    constructor.prototype.processLocally = false;
    Object.defineProperty(window, "SpeechRecognition", {
      value: constructor,
      configurable: true,
    });
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

    recognition.onresult?.({
      results: [[{ transcript: "Comprei CDB no banco Inter" }]],
      resultIndex: 0,
    });
    expect(onTranscript).toHaveBeenCalledWith("Comprei CDB no banco Inter");
    expect(await screen.findByText("Revise o texto")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows no-speech and microphone-error states accessibly", async () => {
    const user = userEvent.setup();
    const recognition: RecognitionMock = {
      lang: "",
      continuous: false,
      interimResults: false,
      processLocally: false,
      onresult: null,
      onerror: null,
      onend: null,
      start: vi.fn(),
      stop: vi.fn(),
    };
    const constructor = Object.assign(
      function () {
        return recognition;
      },
      { available: vi.fn().mockResolvedValue("available") },
    ) as unknown as {
      new (): RecognitionMock;
      prototype: { processLocally?: boolean };
      available: (options: {
        langs: string[];
        processLocally: true;
      }) => Promise<string>;
    };
    constructor.prototype.processLocally = false;
    Object.defineProperty(window, "SpeechRecognition", {
      value: constructor,
      configurable: true,
    });
    render(<PortfolioChatMicrophone onTranscript={vi.fn()} />);
    await user.click(
      await screen.findByRole("button", { name: "Gravar mensagem de voz" }),
    );

    recognition.onend?.();
    expect(await screen.findByText("Sem fala detectada")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Não detectei fala",
    );

    await user.click(
      screen.getByRole("button", { name: "Gravar mensagem de voz" }),
    );
    recognition.onerror?.({ error: "not-allowed" });
    await waitFor(() =>
      expect(screen.getByText("Áudio indisponível")).toBeTruthy(),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Confira a permissão",
    );
  });
});
