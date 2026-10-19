"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type McpConsentFormProps = { oauthQuery: string };

export function McpConsentForm({ oauthQuery }: McpConsentFormProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(accept: boolean) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept, oauth_query: oauthQuery }),
      });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        result === null ||
        typeof result !== "object" ||
        !("url" in result) ||
        typeof result.url !== "string"
      ) {
        throw new Error("Não foi possível atualizar a autorização.");
      }
      window.location.assign(result.url);
    } catch {
      setError("Não foi possível concluir sua escolha. Tente novamente.");
      setPending(false);
    }
  }

  return (
    <div className="mt-7">
      {error ? (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => void submit(false)}
        >
          Recusar
        </Button>
        <Button
          type="button"
          disabled={pending}
          onClick={() => void submit(true)}
        >
          {pending ? "Salvando escolha…" : "Autorizar conexão"}
        </Button>
      </div>
    </div>
  );
}
