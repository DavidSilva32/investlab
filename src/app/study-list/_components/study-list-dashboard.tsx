"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StudyListEntryCard, type StudyEntry } from "./study-list-entry-card";

type ListPayload = { entries: StudyEntry[]; message?: string };

export function StudyListDashboard() {
  const [entries, setEntries] = useState<StudyEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/study-list", { cache: "no-store" });
      const body = (await response.json()) as ListPayload;
      if (!response.ok) throw new Error(body.message);
      setEntries(body.entries);
    } catch (loadError) {
      setError(
        loadError instanceof Error && loadError.message
          ? loadError.message
          : "Não foi possível carregar a Lista de estudo agora.",
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/study-list", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as ListPayload;
        if (!response.ok) throw new Error(body.message);
        if (!cancelled) setEntries(body.entries);
      })
      .catch((loadError: unknown) => {
        if (!cancelled)
          setError(
            loadError instanceof Error && loadError.message
              ? loadError.message
              : "Não foi possível carregar a Lista de estudo agora.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function removeEntry(entry: StudyEntry) {
    setPending(entry.issuerCnpj);
    setError(null);
    try {
      const response = await fetch("/api/study-list/" + entry.issuerCnpj, {
        method: "DELETE",
      });
      const body = (await response.json()) as {
        removed?: boolean;
        message?: string;
      };
      if (!response.ok) throw new Error(body.message);
      setEntries((current) =>
        current!.filter((item) => item.issuerCnpj !== entry.issuerCnpj),
      );
      return null;
    } catch (removeError) {
      const message =
        removeError instanceof Error && removeError.message
          ? removeError.message
          : "Não foi possível remover a empresa da Lista de estudo.";
      setError(message);
      return message;
    } finally {
      setPending(null);
    }
  }

  async function updateReason(entry: StudyEntry, reason: string) {
    setPending(entry.issuerCnpj);
    setError(null);
    try {
      const response = await fetch("/api/study-list/" + entry.issuerCnpj, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = (await response.json()) as {
        reason?: string;
        message?: string;
      };
      if (!response.ok || !body.reason) throw new Error(body.message);
      setEntries((current) =>
        current!.map((item) =>
          item.issuerCnpj === entry.issuerCnpj
            ? { ...item, reason: body.reason! }
            : item,
        ),
      );
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : "Não foi possível atualizar o motivo da inclusão.",
      );
      return false;
    } finally {
      setPending(null);
    }
  }

  async function addObservation(entry: StudyEntry, text: string) {
    setPending(entry.issuerCnpj);
    setError(null);
    try {
      const response = await fetch(
        "/api/study-list/" + entry.issuerCnpj + "/observations",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      const body = (await response.json()) as {
        observation?: StudyEntry["observations"][number];
        message?: string;
      };
      if (!response.ok || !body.observation) throw new Error(body.message);
      setEntries((current) =>
        current!.map((item) =>
          item.issuerCnpj === entry.issuerCnpj
            ? {
                ...item,
                observations: [...item.observations, body.observation!],
              }
            : item,
        ),
      );
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : "Não foi possível registrar a observação.",
      );
      return false;
    } finally {
      setPending(null);
    }
  }

  async function updateObservation(
    entry: StudyEntry,
    observationId: string,
    text: string,
  ) {
    setPending(entry.issuerCnpj);
    setError(null);
    try {
      const response = await fetch(
        "/api/study-list/" +
          entry.issuerCnpj +
          "/observations/" +
          observationId,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      const body = (await response.json()) as {
        observation?: StudyEntry["observations"][number];
        message?: string;
      };
      if (!response.ok || !body.observation) throw new Error(body.message);
      setEntries((current) =>
        current!.map((item) =>
          item.issuerCnpj === entry.issuerCnpj
            ? {
                ...item,
                observations: item.observations.map((observation) =>
                  observation.id === body.observation!.id
                    ? body.observation!
                    : observation,
                ),
              }
            : item,
        ),
      );
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : "Não foi possível atualizar a observação.",
      );
      return false;
    } finally {
      setPending(null);
    }
  }

  if (error && entries === null)
    return (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button type="button" variant="outline" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  if (entries === null)
    return (
      <Card aria-busy="true">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Carregando sua Lista de estudo…
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Lista de estudo</CardTitle>
          <CardDescription>
            Registre empresas, o motivo da inclusão e observações pessoais ao
            longo do tempo. Esses registros são seus e não alteram os dados
            fundamentalistas atuais.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/analyses">Descobrir empresas</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/analyses?ticker=PETR4">Analisar um ticker</Link>
          </Button>
        </CardContent>
      </Card>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {entries.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <h2 className="font-medium">Sua lista ainda está vazia</h2>
            <p className="text-sm text-muted-foreground">
              Adicione uma empresa por Descobrir ou depois de abrir uma análise.
            </p>
            <div className="flex justify-center gap-2">
              <Button asChild>
                <Link href="/analyses">Ir para Descobrir</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/analyses?ticker=PETR4">Ir para Analisar</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {entries.length}{" "}
            {entries.length === 1
              ? "empresa registrada"
              : "empresas registradas"}
          </p>
          {entries.map((entry) => (
            <StudyListEntryCard
              key={entry.issuerCnpj}
              entry={entry}
              pending={pending === entry.issuerCnpj}
              onRemove={() => removeEntry(entry)}
              onUpdateReason={(reason) => updateReason(entry, reason)}
              onAddObservation={(text) => addObservation(entry, text)}
              onUpdateObservation={(id, text) =>
                updateObservation(entry, id, text)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
