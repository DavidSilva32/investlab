"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type RecognitionResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
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
  }) => Promise<string>;
};
type SpeechWindow = Window & {
  SpeechRecognition?: LocalRecognitionConstructor;
  webkitSpeechRecognition?: LocalRecognitionConstructor;
};

type RecordingState =
  | "checking"
  | "ready"
  | "recording"
  | "unavailable"
  | "error"
  | "no-speech"
  | "transcribed";

const stateMessages: Record<
  Exclude<RecordingState, "checking" | "ready" | "recording">,
  string
> = {
  unavailable:
    "Este navegador não oferece transcrição local em português. Você pode digitar sua mensagem.",
  error:
    "Não foi possível acessar o microfone ou iniciar a transcrição. Confira a permissão e tente novamente.",
  "no-speech": "Não detectei fala. Tente novamente ou digite sua mensagem.",
  transcribed: "Transcrição pronta. Revise o texto antes de enviar.",
};

export function PortfolioChatMicrophone({
  onTranscript,
}: {
  onTranscript: (transcript: string) => void;
}) {
  const [state, setState] = useState<RecordingState>("checking");
  const recognitionRef = useRef<LocalRecognition | null>(null);
  const transcriptRef = useRef("");

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

    void Recognition.available({ langs: ["pt-BR"], processLocally: true })
      .then((availability) => {
        if (active)
          setState(availability === "available" ? "ready" : "unavailable");
      })
      .catch(() => {
        if (active) setState("unavailable");
      });

    return () => {
      active = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  function startRecording() {
    if (state === "recording") {
      recognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition || state === "checking" || state === "unavailable") return;

    transcriptRef.current = "";
    try {
      const recognition = new Recognition();
      recognition.lang = "pt-BR";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.processLocally = true;
      recognition.onresult = (event) => {
        const result =
          event.results[event.resultIndex]?.[0]?.transcript?.trim();
        if (!result) return;
        transcriptRef.current = result;
        onTranscript(result);
        setState("transcribed");
      };
      recognition.onerror = (event) => {
        setState(event.error === "no-speech" ? "no-speech" : "error");
        recognitionRef.current = null;
      };
      recognition.onend = () => {
        if (!transcriptRef.current) setState("no-speech");
        recognitionRef.current = null;
      };
      recognitionRef.current = recognition;
      setState("recording");
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setState("error");
    }
  }

  const disabled = state === "checking" || state === "unavailable";
  const message =
    state === "checking"
      ? "Verificando suporte à transcrição local…"
      : state === "ready"
        ? "A transcrição fica neste dispositivo. O áudio não é enviado nem armazenado."
        : state === "recording"
          ? "Ouvindo… O áudio não é enviado nem armazenado."
          : stateMessages[state];

  return (
    <div className="flex min-w-0 flex-col items-center">
      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label={
          state === "recording" ? "Parar gravação" : "Gravar mensagem de voz"
        }
        aria-pressed={state === "recording"}
        disabled={disabled}
        onClick={startRecording}
        className={
          state === "recording" ? "border-destructive text-destructive" : ""
        }
      >
        {state === "recording" ? (
          <MicOff aria-hidden="true" className="size-4" />
        ) : (
          <Mic aria-hidden="true" className="size-4" />
        )}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {message}
      </span>
      <span className="max-w-36 text-center text-[10px] leading-tight text-muted-foreground">
        {state === "checking"
          ? "Verificando áudio"
          : state === "ready"
            ? "Áudio local"
            : state === "recording"
              ? "Ouvindo…"
              : state === "transcribed"
                ? "Revise o texto"
                : state === "no-speech"
                  ? "Sem fala detectada"
                  : "Áudio indisponível"}
      </span>
    </div>
  );
}
