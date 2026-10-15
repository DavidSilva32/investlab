"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  ChartNoAxesCombined,
  Send,
  Target,
  Wallet,
  X,
} from "lucide-react";
import { usePortfolioObjectives } from "@/lib/queries/portfolio";
import {
  recognizePortfolioChatMessage,
  isPortfolioChatManualPositionRequest,
  isPortfolioChatManualPositionRequestAmbiguous,
  parsePortfolioChatManualPositionRequest,
  rankPortfolioChatIntentSuggestions,
  type PortfolioChatManualPositionRequest,
  type PortfolioChatIntent,
  type PortfolioChatMatch,
} from "@/lib/portfolio-chat-intent";
import { PortfolioChatManualPosition } from "@/components/portfolio-chat-manual-position";
import {
  PortfolioChatWealthChart,
  type PortfolioDestinationValue,
} from "@/components/portfolio-chat-wealth-chart";
import {
  PortfolioChatMicrophone,
  type PortfolioChatMicrophoneHandle,
} from "@/components/portfolio-chat-microphone";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";
import { formatCurrency } from "@/lib/utils";
import { formatCurrencyCents } from "@/lib/portfolio-money";
import {
  PortfolioChatAssetList,
  PortfolioChatThinkingIndicator,
  type PortfolioChatListedPosition,
} from "@/components/portfolio-chat-query-result";
import { Button } from "@/components/ui/button";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Input } from "@/components/ui/input";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type ObjectiveSummary = {
  id: string;
  name: string;
  kind?: string;
  purpose?: string | null;
  targetAmount: number | null;
  knownValue: number | null;
  remainingAmount: number | null;
  monthlyPlannedAmount?: number | null;
  missingPositionCount: number;
  unvaluedPositionCount: number;
};
type ObjectivesResponse = {
  objectives?: ObjectiveSummary[];
  destinationSummary?: {
    knownTotal?: number | null;
    missingPositionCount?: number | null;
    unvaluedPositionCount?: number | null;
    categories?: PortfolioDestinationValue[];
  } | null;
};
type AssetChoice = {
  id: string;
  label: string;
  detail: string;
  valueCents: string | null;
};
type PortfolioChatQueryResponse = {
  message: string;
  items?: PortfolioChatListedPosition[];
};
type PortfolioChatQueryMatch = PortfolioChatMatch & {
  intent: "asset-value" | "asset-class-value" | "asset-list";
};
type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  destinationBreakdown?: PortfolioDestinationValue[];
  portfolioTotal?: number;
};
const emptyObjectives: ObjectiveSummary[] = [];

type ObjectiveCategory =
  "RESERVE" | "PERSONAL_GOAL" | "LONG_TERM_INVESTMENT" | "LEGACY_UNCATEGORIZED";

const objectiveCategoryLabels: Record<ObjectiveCategory, string> = {
  RESERVE: "Reserva",
  PERSONAL_GOAL: "Objetivos pessoais",
  LONG_TERM_INVESTMENT: "Investimentos de longo prazo",
  LEGACY_UNCATEGORIZED: "Objetivos legados sem categoria",
};

function getObjectiveCategory(
  objective: ObjectiveSummary,
): ObjectiveCategory | null {
  if (objective.kind === "RESERVE" || objective.id === reserveObjectiveId)
    return "RESERVE";
  if (objective.purpose === "PERSONAL_GOAL") return "PERSONAL_GOAL";
  if (objective.purpose === "LONG_TERM_INVESTMENT")
    return "LONG_TERM_INVESTMENT";
  if (objective.purpose == null) return "LEGACY_UNCATEGORIZED";
  return null;
}

const objectiveCategoryOrder: ObjectiveCategory[] = [
  "RESERVE",
  "PERSONAL_GOAL",
  "LONG_TERM_INVESTMENT",
  "LEGACY_UNCATEGORIZED",
];

function isPlanningObjective(objective: ObjectiveSummary) {
  return getObjectiveCategory(objective) !== "RESERVE";
}

const prompts = [
  {
    id: "objective-value",
    label: "Quanto tenho em um objetivo?",
    Icon: Wallet,
  },
  {
    id: "objective-gap",
    label: "Quanto falta para minha meta?",
    Icon: Target,
  },
  {
    id: "monthly-planned-contribution",
    label: "Quanto planejei aportar por mês?",
    Icon: Wallet,
  },
  {
    id: "portfolio-total",
    label: "Quanto tenho de patrimônio conhecido?",
    Icon: Wallet,
  },
] as const;
const allPromptSuggestions: PortfolioChatIntent[] = [
  ...prompts.map(({ id }) => id),
  "planning",
];

type StrategyClassId =
  "fixed_income" | "brazilian_equities" | "international_etfs" | "fiis";
const classPromptLabels: Record<StrategyClassId, string> = {
  fixed_income: "Renda fixa",
  brazilian_equities: "Ações e BDRs",
  international_etfs: "ETFs internacionais",
  fiis: "Fundos imobiliários (FIIs)",
};
const classPromptEntries = Object.entries(classPromptLabels) as [
  StrategyClassId,
  string,
][];
const quickPromptButtonClass =
  "h-7 rounded-full px-2.5 text-xs transition-[color,background-color,transform] duration-150 hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none";

function getPortfolioTotalMessage(data: ObjectivesResponse) {
  const summary = data.destinationSummary;
  const knownTotal = summary?.knownTotal;
  if (typeof knownTotal !== "number" || !Number.isFinite(knownTotal)) {
    return "Não encontrei um valor de patrimônio conhecido para consultar agora.";
  }

  const missingPositionCount = summary?.missingPositionCount ?? 0;
  const unvaluedPositionCount = summary?.unvaluedPositionCount ?? 0;
  const incompleteCount =
    (Number.isFinite(missingPositionCount) ? missingPositionCount : 0) +
    (Number.isFinite(unvaluedPositionCount) ? unvaluedPositionCount : 0);
  const incompletePositions =
    incompleteCount === 1
      ? "1 posição sem valor confirmado"
      : `${incompleteCount} posições sem valor confirmado`;
  const extra =
    incompleteCount > 0
      ? `Há ${incompletePositions}; o total pode mudar.`
      : "Valores acompanhados na plataforma.";
  return extra;
}

function getPortfolioTotalValue(data: ObjectivesResponse) {
  const value = data.destinationSummary?.knownTotal;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getPortfolioDestinationBreakdown(data: ObjectivesResponse) {
  return data.destinationSummary?.categories?.filter(
    (category) =>
      Number.isFinite(category.value) &&
      category.value > 0 &&
      Number.isFinite(category.percentage),
  );
}

function getMonthlyPlannedContributionMessage(objective: ObjectiveSummary) {
  const amount = objective.monthlyPlannedAmount;
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return `Não há aporte mensal planejado registrado para ${objective.name}. Esse valor é opcional e representa uma intenção pessoal, não um aporte realizado nem uma obrigação.`;
  }
  return `Você informou um aporte mensal planejado de ${formatCurrency(amount)} para ${objective.name}. É uma intenção pessoal, não um aporte realizado nem uma obrigação.`;
}

function getObjectiveValueMessage(objective: ObjectiveSummary) {
  const knownValue =
    typeof objective.knownValue === "number" &&
    Number.isFinite(objective.knownValue)
      ? objective.knownValue
      : null;
  if (knownValue === null) {
    return `Não encontrei um saldo conhecido para ${objective.name}. Confira os dados desse objetivo na Carteira.`;
  }

  const incompleteCount =
    objective.missingPositionCount + objective.unvaluedPositionCount;
  const extra =
    incompleteCount > 0
      ? ` Há ${incompleteCount} posição(ões) sem valor confirmado, então o total pode mudar.`
      : " Esse valor considera as posições acompanhadas na plataforma.";
  return `O valor conhecido em ${objective.name} é ${formatCurrency(knownValue)}.${extra}`;
}

function getObjectiveGapMessage(objective: ObjectiveSummary) {
  if (
    typeof objective.targetAmount !== "number" ||
    !Number.isFinite(objective.targetAmount)
  ) {
    return `${objective.name} ainda não tem uma meta definida na plataforma.`;
  }

  if (
    typeof objective.remainingAmount !== "number" ||
    !Number.isFinite(objective.remainingAmount)
  ) {
    const knownValue =
      typeof objective.knownValue === "number" &&
      Number.isFinite(objective.knownValue)
        ? ` O valor conhecido hoje é ${formatCurrency(objective.knownValue)}.`
        : "";
    return `Ainda não consigo calcular quanto falta para ${objective.name}, porque há posições sem valor confirmado.${knownValue}`;
  }

  if (objective.remainingAmount === 0) {
    return `Pelos valores acompanhados, ${objective.name} já atingiu a meta de ${formatCurrency(objective.targetAmount)}.`;
  }

  const incompleteCount =
    objective.missingPositionCount + objective.unvaluedPositionCount;
  const extra =
    incompleteCount > 0
      ? ` Há ${incompleteCount} posição(ões) sem valor confirmado; essa diferença pode mudar.`
      : "";
  return `Pelos valores acompanhados, faltam ${formatCurrency(objective.remainingAmount)} para a meta de ${formatCurrency(objective.targetAmount)} em ${objective.name}.${extra}`;
}

export function PortfolioChatAssistant() {
  const [open, setOpen] = useState(false);
  const [manualPositionFlow, setManualPositionFlow] = useState(false);
  const [manualPositionRequest, setManualPositionRequest] =
    useState<PortfolioChatManualPositionRequest | null>(null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          aria-hidden={open}
          tabIndex={open ? -1 : 0}
          aria-label={
            open
              ? "Fechar assistente da carteira"
              : "Abrir assistente da carteira"
          }
          className={`fixed bottom-5 right-5 z-40 size-14 rounded-full shadow-lg transition-opacity ${open ? "pointer-events-none opacity-0" : "opacity-100"}`}
        >
          <Image
            src="/images/investlab-assistant-mascot.png"
            alt=""
            aria-hidden="true"
            width={44}
            height={44}
            className="size-11 rounded-full object-cover"
          />
        </Button>
      </PopoverTrigger>
      {open && (
        <PopoverContent
          side="top"
          align="end"
          sideOffset={-56}
          collisionPadding={12}
          aria-label="Assistente da carteira"
          className="w-[min(25rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border-border bg-card p-0 shadow-2xl"
        >
          <AssistantConversation
            onClose={() => {
              setOpen(false);
              setManualPositionFlow(false);
              setManualPositionRequest(null);
            }}
            manualPositionFlow={manualPositionFlow}
            manualPositionRequest={manualPositionRequest}
            onStartManualPosition={(request) => {
              setManualPositionRequest(request ?? null);
              setManualPositionFlow(true);
            }}
            onExitManualPosition={() => {
              setManualPositionFlow(false);
              setManualPositionRequest(null);
            }}
          />
        </PopoverContent>
      )}
    </Popover>
  );
}

function AssistantConversation({
  onClose,
  manualPositionFlow,
  manualPositionRequest,
  onStartManualPosition,
  onExitManualPosition,
}: {
  onClose: () => void;
  manualPositionFlow: boolean;
  manualPositionRequest: PortfolioChatManualPositionRequest | null;
  onStartManualPosition: (
    request?: PortfolioChatManualPositionRequest | null,
  ) => void;
  onExitManualPosition: () => void;
}) {
  const objectivesQuery = usePortfolioObjectives<ObjectivesResponse>();
  const [intent, setIntent] = useState<PortfolioChatIntent | null>(null);
  const [selectedObjective, setSelectedObjective] =
    useState<ObjectiveSummary | null>(null);
  const [planningHref, setPlanningHref] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [promptSuggestions, setPromptSuggestions] = useState<
    PortfolioChatIntent[]
  >([]);
  const [assetChoices, setAssetChoices] = useState<AssetChoice[]>([]);
  const [assetList, setAssetList] = useState<PortfolioChatListedPosition[]>([]);
  const [assetChoiceLimit, setAssetChoiceLimit] = useState(8);
  const [isPortfolioQueryPending, setIsPortfolioQueryPending] = useState(false);
  const [draft, setDraft] = useState("");
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const microphoneRef = useRef<PortfolioChatMicrophoneHandle>(null);
  const voiceSessionActiveRef = useRef(false);
  const [isVoiceSessionActive, setIsVoiceSessionActive] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messageSequence = useRef(0);

  const addMessage = useCallback(
    (
      role: ChatMessage["role"],
      content: string,
      destinationBreakdown?: PortfolioDestinationValue[],
      portfolioTotal?: number,
    ) => {
      const id = messageSequence.current + 1;
      messageSequence.current = id;
      setMessages((current) => [
        ...current,
        {
          id,
          role,
          content,
          ...(destinationBreakdown?.length ? { destinationBreakdown } : {}),
          ...(portfolioTotal !== undefined ? { portfolioTotal } : {}),
        },
      ]);
    },
    [],
  );

  const objectives = Array.isArray(objectivesQuery.data?.objectives)
    ? objectivesQuery.data.objectives
    : emptyObjectives;

  const queryPortfolio = useCallback(
    async (match: PortfolioChatQueryMatch) => {
      setIsPortfolioQueryPending(true);
      setIntent(null);
      setAssetChoices([]);
      setAssetList([]);
      try {
        const response = await fetch("/api/portfolio/chat/query", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            intent: match.intent,
            ...(match.assetQuery ? { query: match.assetQuery } : {}),
            ...(match.assetClassId ? { assetClassId: match.assetClassId } : {}),
          }),
        });
        const data = (await response.json()) as PortfolioChatQueryResponse;
        if (!response.ok) {
          addMessage(
            "assistant",
            typeof data.message === "string" && data.message.trim()
              ? data.message
              : "Não foi possível consultar a carteira agora.",
          );
          return;
        }
        addMessage("assistant", data.message);
        if (match.intent === "asset-list") {
          setAssetList(data.items ?? []);
        } else if ((data.items?.length ?? 0) > 1) {
          setAssetChoices(
            data.items!.map((item) => ({
              id: item.id,
              label: item.product,
              detail: [item.assetCode, item.issuer ?? item.institution]
                .filter(Boolean)
                .join(" · "),
              valueCents: item.valueCents,
            })),
          );
          setAssetChoiceLimit(8);
        }
      } catch {
        addMessage("assistant", "Não foi possível consultar a carteira agora.");
      } finally {
        setIsPortfolioQueryPending(false);
      }
    },
    [addMessage],
  );

  function chooseIntent(nextIntent: PortfolioChatIntent, label: string) {
    setPromptSuggestions([]);
    addMessage("user", label);
    setIntent(nextIntent);
    setSelectedObjective(null);
    setPlanningHref(null);
    if (nextIntent === "portfolio-total") {
      if (objectivesQuery.isSuccess) {
        setIntent(null);
        addMessage(
          "assistant",
          getPortfolioTotalMessage(objectivesQuery.data),
          getPortfolioDestinationBreakdown(objectivesQuery.data),
          getPortfolioTotalValue(objectivesQuery.data),
        );
      } else {
        setPendingMessage(label);
        void resolvePendingMessage(label);
      }
    }
  }

  function chooseObjective(objective: ObjectiveSummary) {
    addMessage("user", objective.name);
    setIntent(null);
    setPlanningHref(null);
    if (intent === "planning") {
      setSelectedObjective(null);
      setPlanningHref(
        `/planning?objective=${encodeURIComponent(objective.id)}`,
      );
      addMessage(
        "assistant",
        `Posso abrir o planejamento com ${objective.name} selecionado.`,
      );
      return;
    }

    setSelectedObjective(objective);
    addMessage(
      "assistant",
      intent === "objective-gap"
        ? getObjectiveGapMessage(objective)
        : intent === "monthly-planned-contribution"
          ? getMonthlyPlannedContributionMessage(objective)
          : getObjectiveValueMessage(objective),
    );
  }

  function askQuickQuestion(message: string) {
    addMessage("user", message);
    setPromptSuggestions([]);
    setAssetChoices([]);
    setAssetList([]);
    const match = recognizePortfolioChatMessage(message, objectives)!;
    if (
      match.intent === "asset-class-value" ||
      match.intent === "asset-value" ||
      match.intent === "asset-list"
    ) {
      resolveTextMessage(message, objectives, objectivesQuery.data ?? {});
      return;
    }
    if (!objectivesQuery.isSuccess) {
      setPendingMessage(message);
      setIntent(match.intent);
      void resolvePendingMessage(message);
      return;
    }
    resolveTextMessage(message);
  }

  const resolveTextMessage = useCallback(
    (
      message: string,
      availableObjectives: ObjectiveSummary[] = objectives,
      response: ObjectivesResponse = objectivesQuery.data ?? {},
    ) => {
      const match = recognizePortfolioChatMessage(message, availableObjectives);
      if (!match) {
        setIntent(null);
        const suggestions = rankPortfolioChatIntentSuggestions(message);
        setPromptSuggestions(
          suggestions.length > 0 ? suggestions : allPromptSuggestions,
        );
        addMessage(
          "assistant",
          suggestions.length > 0
            ? "Posso ter entendido uma destas possibilidades. Escolha a mais próxima ou reformule sua pergunta."
            : "Ainda não consegui identificar o que você quer consultar. Escolha uma opção ou tente perguntar de outro jeito.",
        );
        return;
      }

      setPromptSuggestions([]);
      setAssetChoices([]);
      const objective = availableObjectives.find(
        ({ id }) => id === match.objectiveId,
      );
      if (
        match.intent === "asset-class-value" ||
        match.intent === "asset-value" ||
        match.intent === "asset-list"
      ) {
        void queryPortfolio(match as PortfolioChatQueryMatch);
        return;
      }
      if (match.intent === "portfolio-total") {
        setIntent(null);
        setSelectedObjective(null);
        addMessage(
          "assistant",
          getPortfolioTotalMessage(response),
          getPortfolioDestinationBreakdown(response),
          getPortfolioTotalValue(response),
        );
        return;
      }
      if (match.intent === "planning") {
        setSelectedObjective(null);
        if (objective && !isPlanningObjective(objective)) {
          setIntent(null);
          setPlanningHref("/planning");
          addMessage(
            "assistant",
            "A reserva não pode ser simulada como objetivo individual. Posso abrir o planejamento do patrimônio total.",
          );
          return;
        }
        if (objective) {
          setIntent(null);
          setPlanningHref(
            `/planning?objective=${encodeURIComponent(objective.id)}`,
          );
          addMessage(
            "assistant",
            `Posso abrir o planejamento com ${objective.name} selecionado.`,
          );
          return;
        }
        if (match.objectiveAmbiguous) {
          setIntent("planning");
          addMessage("assistant", "Qual objetivo você quer planejar?");
          return;
        }

        setIntent(null);
        setPlanningHref("/planning");
        addMessage(
          "assistant",
          "Posso abrir o planejamento para você explorar um cenário.",
        );
        return;
      }

      setPlanningHref(null);
      if (objective) {
        setIntent(null);
        setSelectedObjective(objective);
        addMessage(
          "assistant",
          match.intent === "objective-gap"
            ? getObjectiveGapMessage(objective)
            : match.intent === "monthly-planned-contribution"
              ? getMonthlyPlannedContributionMessage(objective)
              : getObjectiveValueMessage(objective),
        );
        return;
      }

      setIntent(match.intent);
      setSelectedObjective(null);
      addMessage("assistant", "Qual objetivo você quer consultar?");
    },
    [addMessage, objectives, objectivesQuery.data, queryPortfolio],
  );

  function chooseAsset(choice: AssetChoice) {
    setAssetChoices([]);
    setAssetChoiceLimit(8);
    addMessage("user", choice.label);
    addMessage(
      "assistant",
      choice.valueCents === null
        ? `Não há valor atual confirmado para ${choice.label}.`
        : `O valor atual acompanhado de ${choice.label}${choice.detail ? ` (${choice.detail})` : ""} é ${formatCurrencyCents(BigInt(choice.valueCents))}.`,
    );
  }
  async function resolvePendingMessage(message: string) {
    const result = await objectivesQuery.refetch();
    if (!result.isSuccess) return;
    setPendingMessage(null);
    resolveTextMessage(
      message,
      Array.isArray(result.data.objectives)
        ? result.data.objectives
        : emptyObjectives,
      result.data,
    );
  }

  function submitMessageText(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || pendingMessage) return false;

    addMessage("user", message);
    setDraft("");
    setPromptSuggestions([]);
    setAssetList([]);
    setSelectedObjective(null);
    setPlanningHref(null);

    if (isPortfolioChatManualPositionRequestAmbiguous(message)) {
      addMessage(
        "assistant",
        "Entendi um possível cadastro de posição e também uma consulta. Qual dessas ações você quer fazer primeiro? Reformule a pergunta para eu continuar.",
      );
      return true;
    }

    if (isPortfolioChatManualPositionRequest(message)) {
      setIntent(null);
      setPromptSuggestions([]);
      onStartManualPosition(parsePortfolioChatManualPositionRequest(message));
      return true;
    }

    const initialMatch = recognizePortfolioChatMessage(message);
    if (!initialMatch) {
      resolveTextMessage(message);
      return true;
    }

    if (
      initialMatch.intent === "asset-class-value" ||
      initialMatch.intent === "asset-value" ||
      initialMatch.intent === "asset-list"
    ) {
      resolveTextMessage(message);
      return true;
    }

    if (!objectivesQuery.isSuccess) {
      setPendingMessage(message);
      setIntent(initialMatch.intent);
      void resolvePendingMessage(message);
      return true;
    }

    resolveTextMessage(message);
    return true;
  }

  function submitVoiceTranscript(transcript: string) {
    const existingDraft = draftRef.current.trim();
    const message = existingDraft
      ? `${existingDraft} ${transcript}`
      : transcript;
    if (submitMessageText(message)) draftRef.current = "";
  }

  function submitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (voiceSessionActiveRef.current) {
      microphoneRef.current?.finalizeAndSubmit();
      return;
    }
    if (submitMessageText(draft)) draftRef.current = "";
  }

  function restart() {
    setMessages([]);
    setIntent(null);
    setSelectedObjective(null);
    setPlanningHref(null);
    setPendingMessage(null);
    setPromptSuggestions([]);
    setAssetChoices([]);
    setAssetList([]);
    setDraft("");
  }

  const selectableObjectives =
    intent === "planning" ? objectives.filter(isPlanningObjective) : objectives;

  return (
    <section className="flex h-[min(34rem,calc(100dvh-7rem))] min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Image
          src="/images/investlab-assistant-mascot.png"
          alt="Mascote do assistente"
          width={44}
          height={44}
          className="size-11 rounded-full border border-border bg-background object-cover"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Assistente da carteira</h2>
          <p className="text-xs text-muted-foreground">
            Respostas guiadas com seus dados
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar assistente"
          onClick={onClose}
          className="size-8 shrink-0"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </header>

      {manualPositionFlow ? (
        <PortfolioChatManualPosition
          initialRequest={manualPositionRequest}
          onBack={onExitManualPosition}
          onCancel={() => {
            onExitManualPosition();
            addMessage(
              "assistant",
              "Tudo bem. Não criei nem alterei nenhuma posição.",
            );
          }}
        />
      ) : (
        <>
          <MessageScrollerProvider autoScroll defaultScrollPosition="end">
            <MessageScroller className="min-h-0 flex-1">
              <MessageScrollerViewport
                aria-label="Conversa com o assistente"
                className="h-0 min-h-0 flex-1"
              >
                <MessageScrollerContent
                  aria-label="Conversa com o assistente"
                  className="gap-3 px-4 py-4"
                >
                  <MessageScrollerItem messageId="welcome">
                    <AssistantMessage>
                      <p>
                        Oi! Pergunte o que você quer entender sobre sua
                        carteira.
                      </p>
                    </AssistantMessage>
                  </MessageScrollerItem>
                  {messages.length === 0 && (
                    <MessageScrollerItem
                      messageId="quick-prompts"
                      className="mt-auto"
                    >
                      <div
                        className="ml-9 flex flex-wrap gap-1.5"
                        role="group"
                        aria-label="Consultas rápidas"
                      >
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className={quickPromptButtonClass}
                          onClick={() =>
                            askQuickQuestion(
                              "Quanto tenho de patrimônio conhecido?",
                            )
                          }
                        >
                          Patrimônio
                        </Button>
                        {classPromptEntries.map(([id, label]) => (
                          <Button
                            key={id}
                            type="button"
                            size="sm"
                            variant="secondary"
                            className={quickPromptButtonClass}
                            onClick={() =>
                              askQuickQuestion(`Quanto tenho em ${label}?`)
                            }
                          >
                            {label === "Fundos imobiliários (FIIs)"
                              ? "FIIs"
                              : label}
                          </Button>
                        ))}
                      </div>
                    </MessageScrollerItem>
                  )}
                  {messages.map((message) => (
                    <MessageScrollerItem
                      key={message.id}
                      messageId={String(message.id)}
                      scrollAnchor={message.role === "user"}
                    >
                      {message.role === "assistant" ? (
                        <AssistantMessage className="motion-content-reveal">
                          {message.content}
                          {message.portfolioTotal !== undefined && (
                            <PortfolioChatWealthChart
                              categories={message.destinationBreakdown ?? []}
                              knownTotal={message.portfolioTotal}
                            />
                          )}
                        </AssistantMessage>
                      ) : (
                        <Message align="end">
                          <MessageContent className="w-fit max-w-[85%]">
                            <Bubble className="max-w-full">
                              <BubbleContent className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                {message.content}
                              </BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      )}
                    </MessageScrollerItem>
                  ))}
                  {assetList.length > 0 && (
                    <MessageScrollerItem messageId="asset-list">
                      <PortfolioChatAssetList items={assetList} />
                    </MessageScrollerItem>
                  )}
                  {assetChoices.length > 0 && (
                    <MessageScrollerItem messageId="asset-choices">
                      <div
                        className="ml-9 flex flex-wrap gap-2"
                        role="group"
                        aria-label="Escolha o ativo"
                      >
                        {assetChoices
                          .slice(0, assetChoiceLimit)
                          .map((choice) => (
                            <Button
                              key={choice.id}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-auto min-h-9 max-w-full justify-start whitespace-normal text-left"
                              onClick={() => chooseAsset(choice)}
                            >
                              <span className="min-w-0">
                                <span className="block truncate">
                                  {choice.label}
                                </span>
                                {choice.detail && (
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {choice.detail}
                                  </span>
                                )}
                              </span>
                            </Button>
                          ))}
                        {assetChoices.length > assetChoiceLimit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-full px-3 text-xs"
                            onClick={() =>
                              setAssetChoiceLimit((current) => current + 8)
                            }
                          >
                            Ver mais ativos (
                            {assetChoices.length - assetChoiceLimit})
                          </Button>
                        )}
                      </div>
                    </MessageScrollerItem>
                  )}
                  {promptSuggestions.length > 0 &&
                    !intent &&
                    !selectedObjective &&
                    !planningHref && (
                      <MessageScrollerItem messageId="quick-prompts">
                        <QuickPrompts
                          suggestions={promptSuggestions}
                          onChoose={chooseIntent}
                        />
                      </MessageScrollerItem>
                    )}
                  {isPortfolioQueryPending && (
                    <MessageScrollerItem messageId="portfolio-query-loading">
                      <PortfolioChatThinkingIndicator />
                    </MessageScrollerItem>
                  )}
                  {intent && objectivesQuery.isPending && (
                    <MessageScrollerItem messageId="loading-objectives">
                      <PortfolioChatThinkingIndicator message="Conferindo seus objetivos" />
                    </MessageScrollerItem>
                  )}
                  {intent && objectivesQuery.isError && (
                    <MessageScrollerItem messageId="objectives-error">
                      <div
                        role="alert"
                        className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm"
                      >
                        <p>Não foi possível carregar seus objetivos.</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (pendingMessage) {
                              void resolvePendingMessage(pendingMessage);
                            } else {
                              void objectivesQuery.refetch();
                            }
                          }}
                        >
                          Tentar novamente
                        </Button>
                      </div>
                    </MessageScrollerItem>
                  )}
                  {intent &&
                    intent !== "portfolio-total" &&
                    objectivesQuery.isSuccess &&
                    objectives.length === 0 && (
                      <MessageScrollerItem messageId="no-objectives">
                        <AssistantMessage>
                          Você ainda não tem objetivos cadastrados.
                          <Link
                            href="/portfolio?panel=objectives"
                            className="mt-2 inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            Ver objetivos{" "}
                            <ArrowUpRight
                              aria-hidden="true"
                              className="size-3.5"
                            />
                          </Link>
                        </AssistantMessage>
                      </MessageScrollerItem>
                    )}
                  {intent &&
                    intent !== "portfolio-total" &&
                    objectivesQuery.isSuccess &&
                    selectableObjectives.length === 0 &&
                    objectives.length > 0 && (
                      <MessageScrollerItem messageId="planning-total-action">
                        <AssistantMessage>
                          Não há objetivos disponíveis para esse planejamento.
                          Você ainda pode simular o patrimônio total.
                          <Link
                            href="/planning"
                            className="mt-2 inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            Planejar patrimônio total{" "}
                            <ArrowUpRight
                              aria-hidden="true"
                              className="size-3.5"
                            />
                          </Link>
                        </AssistantMessage>
                      </MessageScrollerItem>
                    )}
                  {intent &&
                    intent !== "portfolio-total" &&
                    objectivesQuery.isSuccess &&
                    selectableObjectives.length > 0 && (
                      <MessageScrollerItem messageId="objective-choices">
                        <ObjectiveChoices
                          objectives={selectableObjectives}
                          onChoose={chooseObjective}
                        />
                      </MessageScrollerItem>
                    )}
                  {planningHref && (
                    <MessageScrollerItem messageId="planning-action">
                      <Button asChild size="sm" className="ml-9">
                        <Link href={planningHref}>
                          <ChartNoAxesCombined
                            aria-hidden="true"
                            className="mr-1.5 size-4"
                          />
                          Abrir planejamento
                        </Link>
                      </Button>
                    </MessageScrollerItem>
                  )}
                  {selectedObjective && (
                    <MessageScrollerItem messageId="follow-up-actions">
                      <div className="ml-9 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={restart}
                        >
                          <ArrowLeft
                            aria-hidden="true"
                            className="mr-1.5 size-4"
                          />
                          Fazer outra pergunta
                        </Button>
                        {isPlanningObjective(selectedObjective) && (
                          <Button asChild size="sm">
                            <Link
                              href={`/planning?objective=${encodeURIComponent(selectedObjective.id)}`}
                            >
                              <ChartNoAxesCombined
                                aria-hidden="true"
                                className="mr-1.5 size-4"
                              />
                              Planejar esta meta
                            </Link>
                          </Button>
                        )}
                      </div>
                    </MessageScrollerItem>
                  )}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>

          <div className="border-t border-border px-4 py-3">
            <form
              onSubmit={submitMessage}
              className="flex min-w-0 items-center gap-2"
            >
              {!isVoiceSessionActive && (
                <Input
                  value={draft}
                  onChange={(event) => {
                    draftRef.current = event.target.value;
                    setDraft(event.target.value);
                  }}
                  aria-label="Escreva uma pergunta para o assistente"
                  placeholder="Pergunte sobre a carteira ou peça um cadastro"
                  autoComplete="off"
                  disabled={Boolean(pendingMessage) || isPortfolioQueryPending}
                  className="min-w-0 flex-1"
                />
              )}
              <PortfolioChatMicrophone
                ref={microphoneRef}
                onRecordingChange={(recording) => {
                  voiceSessionActiveRef.current = recording;
                  setIsVoiceSessionActive(recording);
                }}
                onTranscript={(transcript) => {
                  const current = draftRef.current.trim();
                  const next = current
                    ? `${current} ${transcript}`
                    : transcript;
                  draftRef.current = next;
                  setDraft(next);
                }}
                onSubmitTranscript={submitVoiceTranscript}
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Enviar mensagem"
                className="shrink-0"
                disabled={
                  (!draft.trim() && !isVoiceSessionActive) ||
                  Boolean(pendingMessage) ||
                  isPortfolioQueryPending
                }
              >
                <Send aria-hidden="true" className="size-4" />
              </Button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}

function QuickPrompts({
  suggestions,
  onChoose,
}: {
  suggestions: PortfolioChatIntent[];
  onChoose: (intent: PortfolioChatIntent, label: string) => void;
}) {
  return (
    <div className="ml-9 space-y-2" role="group" aria-label="Perguntas rápidas">
      {prompts
        .filter(({ id }) => suggestions.includes(id))
        .map(({ id, label, Icon }) => (
          <Button
            key={id}
            type="button"
            variant="outline"
            className="h-auto min-h-10 w-full justify-start gap-2 whitespace-normal py-2 text-left"
            onClick={() => onChoose(id, label)}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
            {label}
          </Button>
        ))}
      {suggestions.includes("planning") && (
        <Button
          asChild
          variant="outline"
          className="h-auto min-h-10 w-full justify-start gap-2 whitespace-normal py-2 text-left"
        >
          <Link href="/planning">
            <ChartNoAxesCombined
              aria-hidden="true"
              className="size-4 shrink-0 text-primary"
            />
            Quero simular um plano
          </Link>
        </Button>
      )}
    </div>
  );
}

function ObjectiveChoices({
  objectives,
  onChoose,
}: {
  objectives: ObjectiveSummary[];
  onChoose: (objective: ObjectiveSummary) => void;
}) {
  const availableCategories = objectiveCategoryOrder.filter((category) =>
    objectives.some(
      (objective) => getObjectiveCategory(objective) === category,
    ),
  );

  return (
    <div
      className="ml-9 space-y-3"
      role="group"
      aria-label="Escolha uma categoria e um objetivo"
    >
      {availableCategories.map((category) => (
        <section
          key={category}
          aria-label={objectiveCategoryLabels[category]}
          className="space-y-1.5"
        >
          <p className="text-xs text-muted-foreground">
            {objectiveCategoryLabels[category]}
          </p>
          {objectives
            .filter((objective) => getObjectiveCategory(objective) === category)
            .map((objective) => (
              <Button
                key={objective.id}
                type="button"
                variant="outline"
                className="h-auto min-h-10 w-full justify-start whitespace-normal py-2 text-left"
                onClick={() => onChoose(objective)}
              >
                {objective.name}
              </Button>
            ))}
        </section>
      ))}
    </div>
  );
}

function AssistantMessage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Message>
      <MessageAvatar className="size-6 min-w-6 bg-background">
        <Image
          src="/images/investlab-assistant-mascot.png"
          alt=""
          aria-hidden="true"
          width={24}
          height={24}
          className="size-6 rounded-full border border-border object-cover"
        />
      </MessageAvatar>
      <MessageContent className={`max-w-[90%] ${className ?? ""}`}>
        <Bubble variant="muted" className="max-w-full">
          <BubbleContent className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {children}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}
