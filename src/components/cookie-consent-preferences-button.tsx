"use client";

import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COOKIE_CONSENT_OPEN_EVENT } from "@/lib/cookie-consent";

export function CookieConsentPreferencesButton({
  variant = "outline",
}: {
  variant?: "ghost" | "link" | "outline";
}) {
  return (
    <Button
      onClick={() => window.dispatchEvent(new Event(COOKIE_CONSENT_OPEN_EVENT))}
      size="sm"
      type="button"
      variant={variant}
    >
      <Settings2 aria-hidden="true" />
      Rever preferências de cookies
    </Button>
  );
}
