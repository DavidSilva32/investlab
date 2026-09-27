"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MonthYearPicker } from "@/app/settings/_components/month-year-picker";

type InvestorContext = {
  objective: string | null;
  targetMonth: string | null;
  updatedAt: string | null;
};

type ContextResponse = {
  context?: InvestorContext;
  message?: string;
};

const emptyContext: InvestorContext = {
  objective: null,
  targetMonth: null,
  updatedAt: null,
};

function currentMonth() {
  const now = new Date();
  return (
    String(now.getFullYear()) +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0")
  );
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value + "-01T00:00:00.000Z"));
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function InvestorContextSettings() {
  const [context, setContext] = useState<InvestorContext>(emptyContext);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/investor-context", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as ContextResponse;
        if (!response.ok) throw new Error(body.message);
        return body.context ?? emptyContext;
      })
      .then((savedContext) => {
        if (!cancelled) {
          setContext(savedContext);
          setLoaded(true);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled)
          setError(
            loadError instanceof Error && loadError.message
              ? loadError.message
              : "Não foi possível carregar seu contexto.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  async function saveContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/investor-context", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          objective: context.objective?.trim() || null,
          targetMonth: context.targetMonth || null,
        }),
      });
      const body = (await response.json()) as ContextResponse;
      if (!response.ok) throw new Error(body.message);
      setContext(body.context ?? emptyContext);
      setNotice("Seu objetivo e prazo foram salvos.");
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : "Não foi possível salvar seu contexto.",
      );
    } finally {
      setSaving(false);
    }
  }

  const targetMonthPassed =
    context.targetMonth !== null && context.targetMonth < currentMonth();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seu objetivo de investimento</CardTitle>
        <CardDescription className="max-w-3xl">
          Seu objetivo e quando pretende usar o dinheiro ajudam a contextualizar
          futuras comparações. Você pode deixar as respostas em branco e voltar
          para atualizá-las quando quiser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={saveContext}>
          {loading && <p role="status">Carregando seu contexto...</p>}
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {!loaded && !loading && error && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setError(null);
                setLoading(true);
                setLoadAttempt((attempt) => attempt + 1);
              }}
            >
              Tentar carregar novamente
            </Button>
          )}
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
            <div className="space-y-2">
              <label
                htmlFor="investor-objective"
                className="text-sm font-medium"
              >
                O que você quer alcançar com seus investimentos?
              </label>
              <Input
                id="investor-objective"
                value={context.objective ?? ""}
                maxLength={160}
                placeholder="Seu objetivo, com suas palavras"
                disabled={!loaded || loading || saving}
                onChange={(event) => {
                  setContext((current) => ({
                    ...current,
                    objective: event.target.value || null,
                  }));
                  setNotice(null);
                }}
                aria-describedby="investor-objective-help"
              />
              <p
                id="investor-objective-help"
                className="text-sm text-muted-foreground"
              >
                {context.objective
                  ? "Objetivo informado."
                  : "Ainda não informado. Essa resposta é opcional."}
              </p>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="investor-target-month"
                className="text-sm font-medium"
              >
                Quando pretende usar esse dinheiro?
              </label>
              <MonthYearPicker
                id="investor-target-month"
                value={context.targetMonth}
                disabled={!loaded || loading || saving}
                ariaDescribedBy="investor-target-month-help"
                onChange={(targetMonth) => {
                  setContext((current) => ({ ...current, targetMonth }));
                  setNotice(null);
                }}
              />
              <p
                id="investor-target-month-help"
                className="text-sm text-muted-foreground"
              >
                {context.targetMonth
                  ? "Mês informado: " + formatMonth(context.targetMonth) + "."
                  : "Ainda não informado. Essa resposta é opcional."}
              </p>
              {targetMonthPassed && (
                <p
                  role="status"
                  className="text-sm text-amber-700 dark:text-amber-400"
                >
                  Esse mês já passou. Revise o prazo se seus planos mudaram.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              {context.updatedAt && (
                <p className="text-xs text-muted-foreground">
                  Atualizado em {formatUpdatedAt(context.updatedAt)}.
                </p>
              )}
              {notice && (
                <p
                  role="status"
                  className="text-sm text-emerald-700 dark:text-emerald-400"
                >
                  {notice}
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={!loaded || loading || saving}
              className="sm:min-w-40"
            >
              {saving ? "Salvando…" : "Salvar contexto"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
