"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Eye } from "lucide-react";
import { toast } from "sonner";
import { getApiMessage } from "@/lib/api-message";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type SupportTarget = { id: string; name: string; email: string };
type SupportView = { target: SupportTarget; expiresAt: string };
type ControlData = {
  targets: SupportTarget[];
  supportView: SupportView | null;
};

export function AdminSupportViewControl() {
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<ControlData>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/support-view", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) {
        setData(undefined);
        return;
      }
      setData(body as ControlData);
    } catch {
      setData(undefined);
    }
  }, []);

  useEffect(() => {
    // Load the server-backed customer list; state changes after the response arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, pathname]);

  useEffect(() => {
    if (!data?.supportView) return;
    const delay = Math.max(
      0,
      new Date(data.supportView.expiresAt).getTime() - Date.now(),
    );
    const timer = window.setTimeout(() => {
      void load().then(() => router.refresh());
    }, delay);
    return () => window.clearTimeout(timer);
  }, [data?.supportView, load, router]);

  if (!data) return null;
  const currentTarget = data.supportView?.target;

  async function selectTarget(targetUserId: string) {
    if (!targetUserId) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/support-view", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          getApiMessage(body, "Não foi possível abrir esta conta."),
        );
      setData((previous: ControlData | undefined): ControlData | undefined =>
        previous
          ? {
              targets: previous.targets,
              supportView: body.supportView as SupportView,
            }
          : undefined,
      );
      window.dispatchEvent(
        new CustomEvent("admin-support-view-changed", {
          detail: body.supportView as SupportView,
        }),
      );
      setOpen(false);
      toast.success("Visualização de suporte iniciada.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir esta conta.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={currentTarget ? "secondary" : "outline"}
            disabled={busy}
            aria-label={
              currentTarget
                ? "Trocar cliente em visualização"
                : "Selecionar cliente para visualização de suporte"
            }
            className="h-10 w-10 justify-center gap-0 p-0 sm:h-11 sm:w-44 sm:justify-between sm:gap-2 sm:px-3"
          >
            <Eye aria-hidden="true" className="size-4 shrink-0" />
            <span className="hidden truncate sm:inline">
              {currentTarget ? "Trocar cliente" : "Ver cliente"}
            </span>
            <ChevronsUpDown
              aria-hidden="true"
              className="hidden size-4 shrink-0 sm:block"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[min(22rem,calc(100vw-2rem))] p-0"
        >
          <Command>
            <CommandInput placeholder="Buscar cliente por nome ou e-mail" />
            <CommandList>
              <CommandEmpty>Nenhuma conta ativa encontrada.</CommandEmpty>
              <CommandGroup heading="Contas de clientes">
                {data.targets.map((target) => (
                  <CommandItem
                    key={target.id}
                    value={`${target.name} ${target.email}`}
                    onSelect={() => void selectTarget(target.id)}
                    disabled={busy}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {target.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {target.email}
                      </span>
                    </span>
                    {currentTarget?.id === target.id && (
                      <Check aria-hidden="true" className="size-4" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
