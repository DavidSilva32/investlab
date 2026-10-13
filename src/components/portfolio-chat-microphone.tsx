"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type RecognitionResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string; isFinal: boolean }>>;
  resultIndex: number;
};
type RecognitionErrorEvent = { error: string };
type LocalRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type LocalRecognitionConstructor = {
  new (): LocalRecognition;
  prototype: { processLocally?: boolean };
  available?: (options: {
    langs: string[];
    processLocally: true;
  }) => Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  install?: (options: {
    langs: string[];
    processLocally: true;
  }) => Promise<boolean>;
};
type SpeechWindow = Window & {
  SpeechRecognition?: LocalRecognitionConstructor;
  webkitSpeechRecognition?: LocalRecognitionConstructor;
};

type RecordingState =
  | "checking"
  | "ready"
  | "downloadable"
  | "installing"
  | "installation-error"
  | "recording"
  | "stopping"
  | "unavailable"
  | "error"
  | "no-speech"
  | "transcribed";

const stateMessages: Record<
  Exclude<
    RecordingState,
    | "checking"
    | "ready"
    | "downloadable"
    | "installing"
    | "recording"
    | "stopping"
  >,
  string
> = {
  "installation-error":
    "Não foi possível instalar o idioma para transcrição local. Tente novamente ou digite sua mensagem.",
  unavailable:
    "Este navegador não oferece transcrição local em português. Você pode digitar sua mensagem.",
  error:
    "Não foi possível acessar o microfone ou iniciar a transcrição. Confira a permissão e tente novamente.",
  "no-speech": "Não detectei fala. Tente novamente ou digite sua mensagem.",
  transcribed: "Transcrição pronta. Revise o texto antes de enviar.",
};

const localSpeechOptions: { langs: string[]; processLocally: true } = {
  langs: ["pt-BR"],
  processLocally: true,
};
const stopFallbackDelayMs = 2000;

export function PortfolioChatMicrophone({
  onTranscript,
}: {
  onTranscript: (transcript: string) => void;
}) {
  const [state, setState] = useState<RecordingState>("checking");
  const recognitionRef = useRef<LocalRecognition | null>(null);
  const transcriptRef = useRef("");
  const sessionActiveRef = useRef(false);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearStopTimeout() {
    if (stopTimeoutRef.current === null) return;
    clearTimeout(stopTimeoutRef.current);
    stopTimeoutRef.current = null;
  }

  useEffect(() => {
    let active = true;
    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (
      !Recognition ||
      typeof Recognition.available !== "function" ||
      !("processLocally" in Recognition.prototype)
    ) {
      void Promise.resolve().then(() => {
        if (active) setState("unavailable");
      });
      return () => {
        active = false;
      };
    }

    void Recognition.available(localSpeechOptions)
      .then((availability) => {
        if (!active) return;
        if (availability === "available") setState("ready");
        else if (
          availability === "downloadable" ||
          availability === "downloading"
        )
          setState("downloadable");
        else setState("unavailable");
      })
      .catch(() => {
        if (active) setState("unavailable");
      });

    return () => {
      active = false;
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      sessionActiveRef.current = false;
      clearStopTimeout();
      recognition?.stop();
    };
  }, []);

  function installLocalLanguage() {
    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition || typeof Recognition.install !== "function") {
      setState("unavailable");
      return;
    }

    setState("installing");
    void Recognition.install(localSpeechOptions)
      .then((installed) => {
        setState(installed ? "ready" : "installation-error");
      })
      .catch(() => {
        setState("installation-error");
      });
  }

  function startRecording() {
    if (state === "recording") {
      const recognition = recognitionRef.current!;

      setState("stopping");
      clearStopTimeout();
      stopTimeoutRef.current = setTimeout(() => {
        if (recognitionRef.current !== recognition) return;
        recognitionRef.current = null;
        sessionActiveRef.current = false;
        stopTimeoutRef.current = null;
        setState(transcriptRef.current ? "transcribed" : "no-speech");
      }, stopFallbackDelayMs);

      try {
        recognition.stop();
      } catch {
        clearStopTimeout();
        recognitionRef.current = null;
        sessionActiveRef.current = false;
        setState("error");
      }
      return;
    }
    if (state === "downloadable" || state === "installation-error") {
      installLocalLanguage();
      return;
    }

    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    const canStartRecording =
      state === "ready" ||
      state === "transcribed" ||
      state === "no-speech" ||
      state === "error";
    if (!Recognition || !canStartRecording) return;

    transcriptRef.current = "";
    try {
      const recognition = new Recognition();
      recognition.lang = "pt-BR";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.processLocally = true;
      recognition.onresult = (event) => {
        if (recognitionRef.current !== recognition || !sessionActiveRef.current)
          return;
        const resultItem = event.results[event.resultIndex]?.[0];
        if (!resultItem?.isFinal) return;
        const result = resultItem.transcript.trim();
        if (!result) return;
        transcriptRef.current = result;
        onTranscript(result);
      };
      recognition.onerror = (event) => {
        if (recognitionRef.current !== recognition) return;
        clearStopTimeout();
        sessionActiveRef.current = false;
        recognitionRef.current = null;
        setState(event.error === "no-speech" ? "no-speech" : "error");
      };
      recognition.onend = () => {
        if (recognitionRef.current !== recognition) return;
        clearStopTimeout();
        sessionActiveRef.current = false;
        recognitionRef.current = null;
        setState(transcriptRef.current ? "transcribed" : "no-speech");
      };
      recognitionRef.current = recognition;
      sessionActiveRef.current = true;
      setState("recording");
      recognition.start();
    } catch {
      clearStopTimeout();
      recognitionRef.current = null;
      sessionActiveRef.current = false;
      setState("error");
    }
  }

  const disabled =
    state === "checking" ||
    state === "unavailable" ||
    state === "installing" ||
    state === "stopping";
  const buttonLabel =
    state === "recording"
      ? "Parar gravação"
      : state === "stopping"
        ? "Finalizando transcrição"
        : state === "downloadable" || state === "installation-error"
          ? "Instalar idioma para áudio local"
          : "Gravar mensagem de voz";
  const message =
    state === "checking"
      ? "Verificando suporte à transcrição local…"
      : state === "ready"
        ? "A transcrição fica neste dispositivo. O áudio não é enviado nem armazenado."
        : state === "downloadable"
          ? "O idioma português pode ser instalado neste dispositivo para habilitar a transcrição local."
          : state === "installing"
            ? "Instalando o idioma para transcrição local…"
            : state === "stopping"
              ? "Finalizando a transcrição…"
              : state === "recording"
                ? "Ouvindo… O áudio não é enviado nem armazenado."
                : stateMessages[state];

  return (
    <div className="flex min-w-0 flex-col items-center">
      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label={buttonLabel}
        aria-pressed={state === "recording"}
        disabled={disabled}
        onClick={startRecording}
        className={
          state === "recording" ? "border-destructive text-destructive" : ""
        }
      >
        {state === "recording" ? (
          <MicOff aria-hidden="true" className="size-4" />
        ) : state === "downloadable" || state === "installation-error" ? (
          <Download aria-hidden="true" className="size-4" />
        ) : (
          <Mic aria-hidden="true" className="size-4" />
        )}
      </Button>
      {state === "recording" && (
        <div
          role="img"
          aria-label="Indicador de gravação"
          className="mt-1 flex h-4 items-end gap-0.5"
        >
          <span
            aria-hidden="true"
            className="h-2 w-1 rounded-full bg-destructive motion-safe:animate-bounce motion-reduce:animate-none"
          />
          <span
            aria-hidden="true"
            className="h-4 w-1 rounded-full bg-destructive [animation-delay:120ms] motion-safe:animate-bounce motion-reduce:animate-none"
          />
          <span
            aria-hidden="true"
            className="h-2.5 w-1 rounded-full bg-destructive [animation-delay:240ms] motion-safe:animate-bounce motion-reduce:animate-none"
          />
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {message}
      </span>
      <span className="max-w-36 text-center text-[10px] leading-tight text-muted-foreground">
        {state === "checking"
          ? "Verificando áudio"
          : state === "ready"
            ? "Áudio local"
            : state === "downloadable"
              ? "Instalar áudio local"
              : state === "installing"
                ? "Instalando idioma…"
                : state === "stopping"
                  ? "Finalizando…"
                  : state === "recording"
                    ? "Ouvindo…"
                    : state === "transcribed"
                      ? "Revise o texto"
                      : state === "no-speech"
                        ? "Sem fala detectada"
                        : state === "installation-error"
                          ? "Falha ao instalar idioma"
                          : "Áudio indisponível"}
      </span>
    </div>
  );
}
