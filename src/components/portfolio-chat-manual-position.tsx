"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, LoaderCircle, Send, X } from "lucide-react";
import { toast } from "sonner";
import { getApiMessage } from "@/lib/api-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";
import type { PortfolioChatManualPositionRequest } from "@/lib/portfolio-chat-intent";

type PositionDraft = {
  product: string;
  institution: string | null;
  informationalCdiPercentage: number | null;
  assetClass: (typeof portfolioAssetClassOptions)[number] | null;
  quantity: number | null;
  currency: string;
  valueBasis: "total_value" | "unit_price" | null;
  amount: number | null;
  positionDate: string | null;
  convertedValueBrl: number | null;
  conversionDate: string | null;
};

type Step =
  | "requestConfirmation"
  | "correction"
  | "product"
  | "assetClass"
  | "quantity"
  | "currency"
  | "valueBasis"
  | "amount"
  | "positionDate"
  | "conversionChoice"
  | "convertedValueBrl"
  | "conversionDate"
  | "confirm"
  | "submitted";

type Line = { id: number; role: "assistant" | "user"; content: string };

const emptyDraft = (): PositionDraft => ({
  product: "",
  institution: null,
  informationalCdiPercentage: null,
  assetClass: null,
  quantity: null,
  currency: "",
  valueBasis: null,
  amount: null,
  positionDate: null,
  convertedValueBrl: null,
  conversionDate: null,
});

const prompts: Record<Step, string> = {
  requestConfirmation:
    "Entendi que você quer cadastrar uma posição manual. Confira os dados antes de continuar.",
  correction:
    "O que você quer corrigir? Você pode informar o produto ou o valor total.",
  product: "Qual é o nome do ativo ou produto?",
  assetClass: "Selecione a classe informada para essa posição.",
  quantity: "Qual quantidade você quer registrar? Informe o número exato.",
  currency:
    "Qual é a moeda do valor informado? Digite o código, como BRL, USD ou EUR.",
  valueBasis:
    "O valor que você vai informar é o total da posição ou o preço por unidade?",
  amount: "Qual é o valor? Use vírgula ou ponto para os centavos.",
  positionDate:
    "Qual é a data-base desse valor? Informe DD/MM/AAAA ou AAAA-MM-DD.",
  conversionChoice:
    "Você tem um valor convertido para reais e a data dessa conversão?",
  convertedValueBrl: "Qual valor convertido para reais você quer registrar?",
  conversionDate:
    "Em que data esse valor foi convertido? Informe DD/MM/AAAA ou AAAA-MM-DD.",
  confirm:
    "Confira o resumo antes de salvar. A posição só será criada depois da sua confirmação.",
  submitted: "Cadastro confirmado.",
};

function parsePositiveNumber(value: string): number | null {
  const compact = value
    .trim()
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  const date = iso
    ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : br
      ? `${br[3]}-${br[2]}-${br[1]}`
      : null;
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
}

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

export function PortfolioChatManualPosition({
  onBack,
  onCancel,
  initialRequest,
}: {
  onBack: () => void;
  onCancel?: () => void;
  initialRequest?: PortfolioChatManualPositionRequest | null;
}) {
  const [step, setStep] = useState<Step>(
    initialRequest ? "requestConfirmation" : "product",
  );
  const [draft, setDraft] = useState<PositionDraft>(() => ({
    ...emptyDraft(),
    product: initialRequest?.product ?? "",
    institution: initialRequest?.institution ?? null,
    informationalCdiPercentage:
      initialRequest?.informationalCdiPercentage ?? null,
    assetClass: initialRequest?.assetClass ?? null,
    quantity: null,
    currency: initialRequest?.currency ?? "",
    valueBasis: initialRequest?.valueBasis ?? null,
    amount: initialRequest?.amount ?? null,
  }));
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<Line[]>([
    {
      id: 1,
      role: "assistant",
      content: initialRequest
        ? "Posso preparar o cadastro com os dados que entendi. Uma posição manual registra um valor atual informado; ela não lança uma compra nem uma movimentação no histórico."
        : prompts.product,
    },
  ]);
  const [saving, setSaving] = useState(false);
  const sequence = useRef(1);
  const submitLock = useRef(false);

  function addLine(role: Line["role"], content: string) {
    const id = sequence.current + 1;
    sequence.current = id;
    setLines((current) => [...current, { id, role, content }]);
  }

  function ask(
    nextStep: Step,
    nextDraft: PositionDraft,
    prompt = prompts[nextStep],
  ) {
    setDraft(nextDraft);
    setStep(nextStep);
    addLine("assistant", prompt);
  }

  function chooseClass(assetClass: PositionDraft["assetClass"]) {
    if (!assetClass || step !== "assetClass") return;
    addLine("user", assetClass);
    ask("quantity", { ...draft, assetClass });
  }

  function chooseValueBasis(valueBasis: PositionDraft["valueBasis"]) {
    if (!valueBasis || step !== "valueBasis") return;
    const label =
      valueBasis === "total_value" ? "Valor total" : "Preço por unidade";
    addLine("user", label);
    continueWithDraft({ ...draft, valueBasis });
  }

  function chooseConversion(hasConversion: boolean) {
    if (step !== "conversionChoice") return;
    addLine(
      "user",
      hasConversion ? "Tenho a conversão" : "Sem conversão informada",
    );
    if (hasConversion) {
      ask("convertedValueBrl", draft);
      return;
    }
    ask("confirm", { ...draft, convertedValueBrl: null, conversionDate: null });
  }

  function nextMissingStep(nextDraft: PositionDraft): Step {
    if (!nextDraft.product) return "product";
    if (!nextDraft.assetClass) return "assetClass";
    if (nextDraft.quantity === null) return "quantity";
    if (!nextDraft.currency) return "currency";
    if (!nextDraft.valueBasis) return "valueBasis";
    if (nextDraft.amount === null) return "amount";
    if (!nextDraft.positionDate) return "positionDate";
    if (nextDraft.currency !== "BRL") {
      if (nextDraft.convertedValueBrl === null) return "conversionChoice";
      if (nextDraft.conversionDate === null) return "conversionDate";
    }
    return "confirm";
  }

  function continueWithDraft(nextDraft = draft) {
    const nextStep = nextMissingStep(nextDraft);
    ask(nextStep, nextDraft);
  }

  function cancelRegistration() {
    if (onCancel) onCancel();
    else onBack();
  }

  function applyCorrection(answer: string) {
    const normalized = answer.toLocaleLowerCase("pt-BR");
    const extractedAmount = parsePositiveNumber(answer);
    const updatedDraft = {
      ...draft,
      ...(extractedAmount !== null ? { amount: extractedAmount } : {}),
    };
    if (
      /\b(cdb|rdb|lci|lca|deb[eê]nture|tesouro|a[cç][aã]o|fii|etf)\b/i.test(
        answer,
      )
    ) {
      const productAnswer = answer
        .replace(
          /\b(na verdade|queria dizer|corrigindo|é|era|o produto é)\b/gi,
          " ",
        )
        .replace(
          /\b(r\$\s*)?\d[\d.,]*\s*(milh(?:ão|ões)|mil|reais|real|brl)\b/gi,
          " ",
        )
        .replace(/\s+/g, " ")
        .trim();
      if (productAnswer) updatedDraft.product = productAnswer.slice(0, 160);
      if (/\b(cdb|rdb|lci|lca|deb[eê]nture)\b/i.test(answer))
        updatedDraft.assetClass = "Renda fixa";
      if (!/^CDB\b/i.test(updatedDraft.product)) {
        updatedDraft.informationalCdiPercentage = null;
      }
    }
    setDraft(updatedDraft);
    setInput("");
    addLine(
      "assistant",
      "Atualizei o que consegui identificar. Confira o resumo antes de continuar.",
    );
    setStep("requestConfirmation");
  }

  function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answer = input.trim();
    if (!answer || saving || step === "submitted") return;
    setInput("");
    addLine("user", answer);

    if (step === "requestConfirmation" || step === "confirm") {
      const normalized = answer
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR");
      const confirms =
        /\b(sim|confirmo|confirmar|isso|correto|pode|ok|certo)\b/.test(
          normalized,
        );
      const cancels = /\b(nao|cancela|cancelar|desistir|desisto)\b/.test(
        normalized,
      );
      if (confirms && cancels) {
        addLine(
          "assistant",
          "Não consegui identificar se você quer confirmar ou cancelar. Escolha uma dessas ações para continuar.",
        );
        return;
      }
      if (cancels) {
        cancelRegistration();
        return;
      }
      if (confirms) {
        if (step === "requestConfirmation") continueWithDraft();
        else void confirmCreation();
        return;
      }
      if (/\b(corrigir|corrige|alterar|editar|ajustar)\b/.test(normalized)) {
        setStep("correction");
        addLine("assistant", prompts.correction);
        return;
      }
      if (step === "requestConfirmation") {
        applyCorrection(answer);
        return;
      }
      addLine(
        "assistant",
        "Responda confirmar, corrigir ou cancelar o cadastro.",
      );
      return;
    }
    if (step === "correction") {
      applyCorrection(answer);
      return;
    }

    if (step === "product") {
      if (answer.length > 160) {
        addLine(
          "assistant",
          "O nome pode ter até 160 caracteres. Informe novamente.",
        );
        return;
      }
      ask("assetClass", { ...draft, product: answer });
      return;
    }
    if (step === "quantity") {
      const quantity = parsePositiveNumber(answer);
      if (quantity === null) {
        addLine(
          "assistant",
          "Não consegui validar essa quantidade. Informe um número maior que zero.",
        );
        return;
      }
      continueWithDraft({ ...draft, quantity });
      return;
    }
    if (step === "currency") {
      const currency = answer.toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        addLine(
          "assistant",
          "Informe o código de moeda com três letras, como BRL, USD ou EUR.",
        );
        return;
      }
      continueWithDraft({ ...draft, currency });
      return;
    }
    if (step === "amount") {
      const amount = parsePositiveNumber(answer);
      if (amount === null) {
        addLine(
          "assistant",
          "Não consegui validar esse valor. Informe um número maior que zero.",
        );
        return;
      }
      continueWithDraft({ ...draft, amount });
      return;
    }
    if (step === "positionDate") {
      const positionDate = parseDate(answer);
      if (!positionDate) {
        addLine(
          "assistant",
          "Não consegui validar a data. Use DD/MM/AAAA ou AAAA-MM-DD.",
        );
        return;
      }
      continueWithDraft({ ...draft, positionDate });
      return;
    }
    if (step === "convertedValueBrl") {
      const convertedValueBrl = parsePositiveNumber(answer);
      if (convertedValueBrl === null) {
        addLine(
          "assistant",
          "Não consegui validar esse valor convertido. Informe um número maior que zero.",
        );
        return;
      }
      continueWithDraft({ ...draft, convertedValueBrl });
      return;
    }
    if (step === "conversionDate") {
      const conversionDate = parseDate(answer);
      if (!conversionDate) {
        addLine(
          "assistant",
          "Não consegui validar a data. Use DD/MM/AAAA ou AAAA-MM-DD.",
        );
        return;
      }
      continueWithDraft({ ...draft, conversionDate });
    }
  }

  async function confirmCreation() {
    if (step !== "confirm" || saving || submitLock.current) return;
    submitLock.current = true;
    setSaving(true);
    const payload = {
      product: draft.product,
      institution: draft.institution,
      informationalCdiPercentage: draft.informationalCdiPercentage,
      assetClass: draft.assetClass,
      subClass: null,
      geography: null,
      quantity: draft.quantity,
      currency: draft.currency,
      valueBasis: draft.valueBasis,
      unitPrice: draft.valueBasis === "unit_price" ? draft.amount : null,
      totalValue: draft.valueBasis === "total_value" ? draft.amount : null,
      positionDate: draft.positionDate,
      convertedValueBrl: draft.convertedValueBrl,
      conversionDate: draft.conversionDate,
    };

    try {
      const response = await fetch("/api/positions/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(getApiMessage(body, "Não foi possível salvar a posição."));
        return;
      }
      toast.success(getApiMessage(body, "Posição adicionada."));
      window.dispatchEvent(new Event("portfolio:updated"));
      setStep("submitted");
      addLine(
        "assistant",
        "Posição criada como registro manual. Os dados da carteira serão atualizados.",
      );
    } catch {
      toast.error("Não foi possível salvar a posição.");
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  }

  const isTypingStep = ![
    "assetClass",
    "valueBasis",
    "conversionChoice",
    "submitted",
  ].includes(step);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="log"
        aria-label="Cadastro de posição pelo assistente"
        aria-live="polite"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {lines.map((line) => (
          <div
            key={line.id}
            className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${line.role === "assistant" ? "bg-muted text-foreground" : "ml-auto bg-primary text-primary-foreground"}`}
          >
            {line.content}
          </div>
        ))}
        {step === "assetClass" && (
          <div
            role="group"
            aria-label="Classes de ativo"
            className="ml-2 grid grid-cols-2 gap-2"
          >
            {portfolioAssetClassOptions.map((assetClass) => (
              <Button
                key={assetClass}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => chooseClass(assetClass)}
              >
                {assetClass}
              </Button>
            ))}
          </div>
        )}
        {step === "valueBasis" && (
          <div
            role="group"
            aria-label="Base do valor"
            className="ml-2 flex flex-wrap gap-2"
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => chooseValueBasis("total_value")}
            >
              Valor total
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => chooseValueBasis("unit_price")}
            >
              Preço por unidade
            </Button>
          </div>
        )}
        {step === "conversionChoice" && (
          <div
            role="group"
            aria-label="Conversão para reais"
            className="ml-2 flex flex-wrap gap-2"
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => chooseConversion(true)}
            >
              Informar valor e data
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => chooseConversion(false)}
            >
              Sem conversão informada
            </Button>
          </div>
        )}
        {(step === "requestConfirmation" || step === "confirm") && (
          <div
            className="ml-2 space-y-3 rounded-xl border bg-card p-3 text-sm"
            aria-label="Resumo da posição"
          >
            <h3 className="font-semibold">
              {step === "requestConfirmation"
                ? "Confirme os dados que entendi"
                : "Resumo da posição manual"}
            </h3>
            {step === "requestConfirmation" && (
              <p className="text-muted-foreground">
                Este cadastro cria uma posição manual com o valor informado. Não
                registra uma compra nem movimenta dinheiro.
              </p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {draft.product && (
                <>
                  <dt className="text-muted-foreground">Ativo</dt>
                  <dd>{draft.product}</dd>
                </>
              )}
              {draft.institution && (
                <>
                  <dt className="text-muted-foreground">Instituição</dt>
                  <dd>{draft.institution}</dd>
                </>
              )}
              {draft.informationalCdiPercentage !== null && (
                <>
                  <dt className="text-muted-foreground">
                    Premissa informativa
                  </dt>
                  <dd>
                    {draft.informationalCdiPercentage}% do CDI, sem cálculo de
                    rendimento
                  </dd>
                </>
              )}
              {draft.assetClass && (
                <>
                  <dt className="text-muted-foreground">Classe</dt>
                  <dd>{draft.assetClass}</dd>
                </>
              )}
              {draft.quantity !== null && (
                <>
                  <dt className="text-muted-foreground">Quantidade</dt>
                  <dd>{draft.quantity}</dd>
                </>
              )}
              {draft.currency && (
                <>
                  <dt className="text-muted-foreground">Moeda</dt>
                  <dd>{draft.currency}</dd>
                </>
              )}
              {draft.valueBasis && (
                <>
                  <dt className="text-muted-foreground">Base</dt>
                  <dd>
                    {draft.valueBasis === "unit_price"
                      ? "Preço por unidade"
                      : "Valor total"}
                  </dd>
                </>
              )}
              {draft.amount !== null && (
                <>
                  <dt className="text-muted-foreground">Valor informado</dt>
                  <dd>
                    {draft.amount.toLocaleString("pt-BR", {
                      maximumFractionDigits: 8,
                    })}{" "}
                    {draft.currency}
                  </dd>
                </>
              )}
              {draft.positionDate && (
                <>
                  <dt className="text-muted-foreground">Data-base</dt>
                  <dd>{formatDate(draft.positionDate)}</dd>
                </>
              )}
              {draft.convertedValueBrl !== null && (
                <>
                  <dt className="text-muted-foreground">Valor convertido</dt>
                  <dd>{formatCurrency(draft.convertedValueBrl)}</dd>
                  <dt className="text-muted-foreground">Data da conversão</dt>
                  <dd>{formatDate(draft.conversionDate)}</dd>
                </>
              )}
              {draft.currency !== "BRL" && draft.convertedValueBrl === null && (
                <>
                  <dt className="text-muted-foreground">Conversão</dt>
                  <dd>Não informada</dd>
                </>
              )}
            </dl>
            <div className="flex flex-wrap gap-2">
              {step === "requestConfirmation" ? (
                <>
                  <Button type="button" onClick={() => continueWithDraft()}>
                    <Check aria-hidden="true" className="mr-2 size-4" />
                    Sim, continuar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setStep("correction");
                      addLine("assistant", prompts.correction);
                    }}
                  >
                    Corrigir dados
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={cancelRegistration}
                  >
                    <X aria-hidden="true" className="mr-2 size-4" /> Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    onClick={() => void confirmCreation()}
                    disabled={saving}
                  >
                    {saving ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="mr-2 size-4 animate-spin"
                      />
                    ) : (
                      <Check aria-hidden="true" className="mr-2 size-4" />
                    )}
                    {saving ? "Salvando..." : "Confirmar cadastro"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("correction")}
                    disabled={saving}
                  >
                    Corrigir dados
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={cancelRegistration}
                    disabled={saving}
                  >
                    <X aria-hidden="true" className="mr-2 size-4" /> Cancelar
                    cadastro
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
        {step === "submitted" && (
          <div className="ml-2">
            <Button type="button" variant="outline" onClick={onBack}>
              Voltar ao assistente
            </Button>
          </div>
        )}
      </div>
      {step !== "confirm" &&
        step !== "requestConfirmation" &&
        step !== "submitted" && (
          <div className="border-t px-4 pt-2 text-right">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelRegistration}
            >
              <X aria-hidden="true" className="mr-1.5 size-4" />
              Cancelar cadastro
            </Button>
          </div>
        )}
      {isTypingStep && (
        <form
          onSubmit={submitAnswer}
          className="flex gap-2 border-t border-border px-4 py-3"
        >
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            aria-label="Resposta para o cadastro da posição"
            placeholder={
              step === "correction"
                ? "Informe a correção"
                : "Digite sua resposta"
            }
            autoComplete="off"
            disabled={saving}
            autoFocus
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Enviar resposta"
            disabled={!input.trim() || saving}
          >
            <Send aria-hidden="true" className="size-4" />
          </Button>
        </form>
      )}
    </div>
  );
}
