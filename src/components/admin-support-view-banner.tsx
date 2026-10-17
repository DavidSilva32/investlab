"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { getApiMessage } from "@/lib/api-message";
import { Button } from "@/components/ui/button";

type SupportTarget = { id: string; name: string; email: string };
type SupportView = { target: SupportTarget; expiresAt: string };

export function AdminSupportViewBanner({
  onSupportViewChange,
}: {
  onSupportViewChange?: (active: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [supportView, setSupportView] = useState<SupportView | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/support-view", {
        cache: "no-store",
      });
      const body = await response.json();
      if (response.ok) {
        const nextView = (body.supportView as SupportView | null) ?? null;
        setSupportView(nextView);
        onSupportViewChange?.(nextView !== null);
      }
    } catch {
      setSupportView(null);
    }
  }, [onSupportViewChange]);

  useEffect(() => {
    // Load the server-backed support context; state changes after the response arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<SupportView | null>).detail;
      setSupportView(detail);
      onSupportViewChange?.(detail !== null);
    };
    window.addEventListener("admin-support-view-changed", onChange);
    return () =>
      window.removeEventListener("admin-support-view-changed", onChange);
  }, [load, onSupportViewChange, pathname]);

  useEffect(() => {
    if (!supportView) return;
    const delay = Math.max(
      0,
      new Date(supportView.expiresAt).getTime() - Date.now(),
    );
    const timer = window.setTimeout(() => {
      setSupportView(null);
      void load().then(() => router.refresh());
    }, delay);
    return () => window.clearTimeout(timer);
  }, [supportView, load, router]);

  async function endSupportView() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/support-view", {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          getApiMessage(body, "Não foi possível encerrar a visualização."),
        );
      setSupportView(null);
      onSupportViewChange?.(false);
      window.dispatchEvent(
        new CustomEvent("admin-support-view-changed", { detail: null }),
      );
      toast.success("Visualização de suporte encerrada.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível encerrar a visualização.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!supportView) return null;

  return (
    <section
      className="flex flex-col gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
      aria-label="Modo de visualização de suporte"
      role="status"
    >
      <div className="flex min-w-0 items-start gap-2">
        <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p className="min-w-0 text-sm">
          <span className="font-semibold">Visualização de suporte</span>
          <span className="mx-1">·</span>
          <span>
            Cliente: <strong>{supportView.target.name}</strong> (
            {supportView.target.email})
          </span>
          <span className="ml-1">Somente leitura.</span>
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void endSupportView()}
        disabled={busy}
        className="shrink-0 border-amber-500/50 bg-background text-foreground hover:bg-amber-100 dark:hover:bg-amber-900"
      >
        <EyeOff aria-hidden="true" className="mr-2 size-4" />
        Encerrar visualização
      </Button>
    </section>
  );
}
