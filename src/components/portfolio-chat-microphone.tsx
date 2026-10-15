"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Download, LoaderCircle, Mic, Square, X } from "lucide-react";
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
  onstart: (() => void) | null;
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
  | "starting"
  | "installation-error"
  | "recording"
  | "stopping"
  | "unavailable"
  | "error"
  | "permission-error"
  | "capture-error"
  | "no-speech"
  | "transcribed";

const stateMessages: Record<
  Exclude<
    RecordingState,
    | "checking"
    | "ready"
    | "downloadable"
    | "installing"
    | "starting"
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
  "permission-error":
    "O navegador bloqueou o microfone. Libere a permissão para este site e tente novamente.",
  "capture-error":
    "Não encontrei um microfone disponível. Confira a conexão do dispositivo e tente novamente.",
  "no-speech": "Não detectei fala. Tente novamente ou digite sua mensagem.",
  transcribed: "Transcrição pronta. Revise o texto antes de enviar.",
};

const localSpeechOptions: { langs: string[]; processLocally: true } = {
  langs: ["pt-BR"],
  processLocally: true,
};
const stopFallbackDelayMs = 2000;
const startFallbackDelayMs = 5000;

export type PortfolioChatMicrophoneHandle = {
  finalizeAndSubmit: () => void;
};

type PortfolioChatMicrophoneProps = {
  onTranscript: (transcript: string) => void;
  onSubmitTranscript?: (transcript: string) => void;
  onRecordingChange?: (recording: boolean) => void;
};

export const PortfolioChatMicrophone = forwardRef<
  PortfolioChatMicrophoneHandle,
  PortfolioChatMicrophoneProps
>(function PortfolioChatMicrophone(
  {
    onTranscript,
    onSubmitTranscript = onTranscript,
    onRecordingChange = () => undefined,
  },
  ref,
) {
  const [state, setState] = useState<RecordingState>("checking");
  const callbacksRef = useRef({
    onTranscript,
    onSubmitTranscript,
    onRecordingChange,
  });
  callbacksRef.current = {
    onTranscript,
    onSubmitTranscript,
    onRecordingChange,
  };
  const recognitionRef = useRef<LocalRecognition | null>(null);
  const transcriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const sessionActiveRef = useRef(false);
  const submitOnCompleteRef = useRef(false);
  const stopOnStartRef = useRef(false);
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearStartTimeout() {
    if (startTimeoutRef.current === null) return;
    clearTimeout(startTimeoutRef.current);
    startTimeoutRef.current = null;
  }

  function clearStopTimeout() {
    if (stopTimeoutRef.current === null) return;
    clearTimeout(stopTimeoutRef.current);
    stopTimeoutRef.current = null;
  }

  function completeRecognition(recognition: LocalRecognition) {
    if (recognitionRef.current !== recognition) return;
    clearStartTimeout();
    clearStopTimeout();
    sessionActiveRef.current = false;
    recognitionRef.current = null;
    callbacksRef.current.onRecordingChange(false);
    const shouldSubmitTranscript = submitOnCompleteRef.current;
    submitOnCompleteRef.current = false;
    stopOnStartRef.current = false;
    const transcript = [
      transcriptRef.current,
      interimTranscriptRef.current.trim(),
    ]
      .filter(Boolean)
      .join(" ");
    transcriptRef.current = "";
    interimTranscriptRef.current = "";
    if (transcript) {
      if (shouldSubmitTranscript)
        callbacksRef.current.onSubmitTranscript(transcript);
      else callbacksRef.current.onTranscript(transcript);
      setState("transcribed");
    } else {
      if (shouldSubmitTranscript) callbacksRef.current.onSubmitTranscript("");
      setState("no-speech");
    }
  }

  function cancelRecording() {
    const recognition = recognitionRef.current;
    clearStartTimeout();
    clearStopTimeout();
    transcriptRef.current = "";
    interimTranscriptRef.current = "";
    sessionActiveRef.current = false;
    submitOnCompleteRef.current = false;
    stopOnStartRef.current = false;
    recognitionRef.current = null;
    onRecordingChange(false);
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // Ignore stop failures after the session has already been cancelled.
      }
    }
    setState("ready");
  }

  function requestStop(submitTranscript: boolean) {
    const recognition = recognitionRef.current;
    if (!recognition || !sessionActiveRef.current) return;

    submitOnCompleteRef.current = submitTranscript;
    if (state === "stopping") return;
    setState("stopping");
    if (state === "starting") {
      stopOnStartRef.current = true;
      return;
    }

    clearStopTimeout();
    stopTimeoutRef.current = setTimeout(() => {
      if (recognitionRef.current !== recognition) return;
      stopTimeoutRef.current = null;
      completeRecognition(recognition);
    }, stopFallbackDelayMs);

    try {
      recognition.stop();
    } catch {
      clearStopTimeout();
      submitOnCompleteRef.current = false;
      recognitionRef.current = null;
      sessionActiveRef.current = false;
      onRecordingChange(false);
      setState("error");
    }
  }

  useImperativeHandle(ref, () => ({
    finalizeAndSubmit: () => requestStop(true),
  }));

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
      submitOnCompleteRef.current = false;
      stopOnStartRef.current = false;
      clearStartTimeout();
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
      requestStop(false);
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
      state === "error" ||
      state === "permission-error" ||
      state === "capture-error";
    if (!Recognition || !canStartRecording) return;

    transcriptRef.current = "";
    interimTranscriptRef.current = "";
    try {
      const recognition = new Recognition();
      recognition.lang = "pt-BR";
      // Keep Chrome listening through pauses until the user explicitly stops.
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.processLocally = true;
      recognition.onstart = () => {
        if (recognitionRef.current !== recognition || !sessionActiveRef.current)
          return;
        clearStartTimeout();
        if (stopOnStartRef.current) {
          setState("stopping");
          clearStopTimeout();
          stopTimeoutRef.current = setTimeout(() => {
            if (recognitionRef.current !== recognition) return;
            stopTimeoutRef.current = null;
            completeRecognition(recognition);
          }, stopFallbackDelayMs);
          try {
            recognition.stop();
          } catch {
            clearStopTimeout();
            submitOnCompleteRef.current = false;
            recognitionRef.current = null;
            sessionActiveRef.current = false;
            onRecordingChange(false);
            setState("error");
          }
        } else {
          setState("recording");
        }
      };
      recognition.onresult = (event) => {
        if (recognitionRef.current !== recognition || !sessionActiveRef.current)
          return;
        const finalSegments: string[] = [];
        const interimSegments: string[] = [];
        for (let index = 0; index < event.results.length; index += 1) {
          const resultItem = event.results[index]?.[0];
          if (!resultItem) continue;
          const segment = resultItem.transcript.trim();
          if (!segment) continue;
          if (resultItem.isFinal) finalSegments.push(segment);
          else interimSegments.push(segment);
        }
        transcriptRef.current = finalSegments.join(" ");
        interimTranscriptRef.current = interimSegments.join(" ");
      };
      recognition.onerror = (event) => {
        if (recognitionRef.current !== recognition) return;
        clearStartTimeout();
        clearStopTimeout();
        sessionActiveRef.current = false;
        recognitionRef.current = null;
        submitOnCompleteRef.current = false;
        stopOnStartRef.current = false;
        onRecordingChange(false);
        transcriptRef.current = "";
        interimTranscriptRef.current = "";
        setState(
          event.error === "no-speech"
            ? "no-speech"
            : event.error === "not-allowed" ||
                event.error === "service-not-allowed"
              ? "permission-error"
              : event.error === "audio-capture"
                ? "capture-error"
                : "error",
        );
      };
      recognition.onend = () => {
        completeRecognition(recognition);
      };
      recognitionRef.current = recognition;
      sessionActiveRef.current = true;
      submitOnCompleteRef.current = false;
      stopOnStartRef.current = false;
      onRecordingChange(true);
      setState("starting");
      startTimeoutRef.current = setTimeout(() => {
        if (recognitionRef.current !== recognition) return;
        recognitionRef.current = null;
        sessionActiveRef.current = false;
        startTimeoutRef.current = null;
        submitOnCompleteRef.current = false;
        stopOnStartRef.current = false;
        onRecordingChange(false);
        transcriptRef.current = "";
        interimTranscriptRef.current = "";
        try {
          recognition.stop();
        } catch {
          // The browser may reject stop before the recognition session starts.
        }
        setState("error");
      }, startFallbackDelayMs);
      recognition.start();
    } catch {
      clearStartTimeout();
      clearStopTimeout();
      recognitionRef.current = null;
      sessionActiveRef.current = false;
      submitOnCompleteRef.current = false;
      stopOnStartRef.current = false;
      onRecordingChange(false);
      setState("error");
    }
  }

  const activeSession =
    state === "starting" || state === "recording" || state === "stopping";
  const disabled =
    state === "checking" ||
    state === "unavailable" ||
    state === "installing" ||
    state === "starting" ||
    state === "stopping";
  const buttonLabel =
    state === "recording"
      ? "Finalizar gravação"
      : state === "starting"
        ? "Iniciando gravação"
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
            : state === "starting"
              ? "Iniciando a transcrição local…"
              : state === "stopping"
                ? "Finalizando a transcrição…"
                : state === "recording"
                  ? "Ouvindo… O áudio não é enviado nem armazenado."
                  : stateMessages[state];

  if (activeSession) {
    const isRecording = state === "recording";
    const activeMessage =
      state === "starting"
        ? "Iniciando…"
        : state === "stopping"
          ? "Finalizando…"
          : "Ouvindo…";

    return (
      <div className="flex min-w-0 flex-1 items-center">
        <div className="flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-full border border-border bg-background px-1.5 shadow-sm">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Cancelar gravação"
            onClick={cancelRecording}
            className="size-7 shrink-0 rounded-full"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
            {isRecording ? (
              <div
                role="img"
                aria-label="Indicador de gravação"
                className="flex h-5 items-center gap-0.5"
              >
                {[3, 6, 4, 8, 5, 7, 3, 6, 4].map((height, index) => (
                  <span
                    key={`${height}-${index}`}
                    aria-hidden="true"
                    className="w-0.5 rounded-full bg-primary motion-safe:animate-pulse motion-reduce:animate-none"
                    style={{
                      height: `${height * 2}px`,
                      animationDelay: `${index * 90}ms`,
                    }}
                  />
                ))}
              </div>
            ) : (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none"
              />
            )}
            <span className="sr-only">{activeMessage}</span>
          </div>
          <Button
            type="button"
            size="icon"
            variant="default"
            aria-label={buttonLabel}
            disabled={!isRecording}
            onClick={startRecording}
            className="size-7 shrink-0 rounded-full"
          >
            {state === "stopping" ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-3.5 animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Square aria-hidden="true" className="size-3.5 fill-current" />
            )}
          </Button>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {message}
        </span>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-center">
      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label={buttonLabel}
        disabled={disabled}
        onClick={startRecording}
      >
        {state === "downloadable" || state === "installation-error" ? (
          <Download aria-hidden="true" className="size-4" />
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
            : state === "downloadable"
              ? "Instalar áudio local"
              : state === "installing"
                ? "Instalando idioma…"
                : state === "transcribed"
                  ? "Revise o texto"
                  : state === "no-speech"
                    ? "Sem fala detectada"
                    : state === "permission-error"
                      ? "Permissão do microfone"
                      : state === "capture-error"
                        ? "Microfone não encontrado"
                        : state === "installation-error"
                          ? "Falha ao instalar idioma"
                          : "Áudio indisponível"}
      </span>
    </div>
  );
});
