"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api-client";
import { TERMS_OF_USE_SECTIONS } from "@/lib/terms-of-use";

export function TermsAcceptanceGate({ version }: { version: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  async function acceptTerms() {
    setPending(true);
    setError(null);
    try {
      await apiRequest("/api/privacy/terms-acceptances", {
        method: "POST",
        body: JSON.stringify({ termsVersion: version }),
      });
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível registrar seu aceite. Tente novamente.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="terms-gate-title"
      aria-describedby="terms-gate-description"
      onCancel={(event) => event.preventDefault()}
      className="fixed inset-0 m-auto max-h-[min(92dvh,900px)] w-[min(96vw,760px)] max-w-none overflow-hidden rounded-xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60"
    >
      <div className="flex max-h-[min(92dvh,900px)] flex-col">
        <header className="border-b border-border px-5 py-4 sm:px-7">
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Antes de continuar
          </p>
          <h1
            id="terms-gate-title"
            className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl"
          >
            Leia e aceite os Termos de Uso
          </h1>
          <p
            id="terms-gate-description"
            className="mt-2 text-sm leading-6 text-muted-foreground"
          >
            Esta é a versão vigente do produto ({version}). O aceite será
            associado à sua conta e à versão exibida.
          </p>
        </header>

        <div
          aria-label="Termos de Uso completos"
          className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7"
        >
          {TERMS_OF_USE_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="font-semibold">{section.title}</h2>
              <div className="mt-2 space-y-3 text-sm leading-6 text-muted-foreground">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
          <Link
            href="/termos-de-uso"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FileText aria-hidden="true" className="size-4" />
            Abrir os Termos em uma página completa
          </Link>
        </div>

        <footer className="border-t border-border bg-background px-5 py-4 sm:px-7">
          {error && (
            <p role="alert" className="mb-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-muted-foreground">
              Cookies e preferências são tratados separadamente nesta escolha.
            </p>
            <Button
              type="button"
              disabled={pending}
              onClick={() => void acceptTerms()}
              className="shrink-0"
            >
              {pending ? (
                <>
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                  Registrando aceite…
                </>
              ) : (
                "Li e aceito os Termos de Uso"
              )}
            </Button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
