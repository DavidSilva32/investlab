"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Cookie, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readCookieConsent, saveCookieConsent } from "@/lib/cookie-consent";
import type { CookieConsentChoice } from "@/lib/cookie-consent";

const consentChangeEvent = "investlab-cookie-consent-change";

function subscribeToCookieConsent(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(consentChangeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(consentChangeEvent, onChange);
  };
}

function getCookieConsentSnapshot() {
  try {
    return readCookieConsent(window.localStorage) ?? "none";
  } catch {
    return "error";
  }
}

function getServerCookieConsentSnapshot() {
  return "loading";
}

export function CookieConsentManager() {
  const consentSnapshot = useSyncExternalStore(
    subscribeToCookieConsent,
    getCookieConsentSnapshot,
    getServerCookieConsentSnapshot,
  );
  const [writeError, setWriteError] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  if (consentSnapshot === "loading") return null;

  const choice: CookieConsentChoice | null =
    consentSnapshot === "accepted" || consentSnapshot === "rejected"
      ? consentSnapshot
      : null;
  const storageError = consentSnapshot === "error" || writeError;

  function saveChoice(nextChoice: CookieConsentChoice) {
    try {
      saveCookieConsent(window.localStorage, nextChoice);
      setWriteError(false);
      setIsOpen(false);
      window.dispatchEvent(new Event(consentChangeEvent));
    } catch {
      setWriteError(true);
    }
  }

  const showBanner = choice === null || isOpen;

  return (
    <>
      {showBanner ? (
        <section
          aria-describedby="cookie-consent-description"
          aria-label="Preferências de cookies"
          className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-5xl rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl sm:inset-x-6 sm:bottom-6 sm:p-6"
          role="region"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 gap-3">
              <Cookie
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-primary"
              />
              <div className="min-w-0">
                <h2 className="font-semibold">Sua escolha sobre cookies</h2>
                <p
                  className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground"
                  id="cookie-consent-description"
                >
                  Usamos cookies necessários para manter sua conta conectada.
                  Eles ficam ativos para o funcionamento do InvestLab. No
                  momento, não identificamos cookies opcionais em uso. Você pode
                  aceitar ou rejeitar cookies opcionais e mudar sua escolha
                  depois.
                </p>
                <Link
                  className="mt-2 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href="/cookies"
                >
                  Leia a Política de Cookies
                </Link>
                {storageError && (
                  <p className="mt-2 text-sm text-destructive" role="alert">
                    Não foi possível salvar sua escolha neste navegador. Tente
                    novamente.
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                className="min-h-11"
                onClick={() => saveChoice("rejected")}
                type="button"
                variant="outline"
              >
                Rejeitar opcionais
              </Button>
              <Button
                className="min-h-11"
                onClick={() => saveChoice("accepted")}
                type="button"
              >
                Aceitar opcionais
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <Button
          aria-label="Abrir preferências de cookies"
          className="fixed bottom-4 right-4 z-40 shadow-lg"
          onClick={() => setIsOpen(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Settings2 aria-hidden="true" />
          Preferências de cookies
        </Button>
      )}
    </>
  );
}
