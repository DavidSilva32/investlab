"use client";

import { useEffect, useId, useState } from "react";
import { BookmarkCheck, BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type AddStudyListButtonProps = {
  issuerCnpj: string | null;
  companyName: string;
  ticker: string | null;
  alreadyAdded?: boolean;
  checkExisting?: boolean;
  onAdded?: (issuerCnpj: string) => void;
};

export function AddStudyListButton({
  issuerCnpj,
  companyName,
  ticker,
  alreadyAdded = false,
  checkExisting = false,
  onAdded,
}: AddStudyListButtonProps) {
  const reasonId = useId();
  const errorId = `${reasonId}-error`;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!issuerCnpj || !checkExisting || alreadyAdded) return;
    let cancelled = false;
    void fetch("/api/study-list", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { entries?: { issuerCnpj: string }[] } | null) => {
        if (
          !cancelled &&
          body?.entries?.some((entry) => entry.issuerCnpj === issuerCnpj)
        )
          setSaved(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [alreadyAdded, checkExisting, issuerCnpj]);
  const isAdded = alreadyAdded || saved;

  async function addToStudyList() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/study-list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          issuerCnpj,
          companyName,
          ticker,
          reason,
        }),
      });
      const body = (await response.json()) as {
        message?: string;
        added?: boolean;
      };
      if (!response.ok) throw new Error(body.message);
      setSaved(true);
      onAdded?.(issuerCnpj!);
      setReason("");
      setOpen(false);
      setNotice(body.added ? null : "Esta empresa já está na Lista de estudo.");
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : "Não foi possível adicionar a empresa à Lista de estudo.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!issuerCnpj)
    return (
      <div className="space-y-1">
        <Button type="button" variant="outline" disabled>
          <BookmarkPlus aria-hidden="true" className="size-4" />
          Adicionar à Lista de estudo
        </Button>
        <p className="text-xs text-muted-foreground">
          O CNPJ não foi identificado; a análise continua disponível.
        </p>
      </div>
    );

  return (
    <div className="space-y-1">
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setError(null);
        }}
      >
        <DialogTrigger asChild>
          <Button
            type="button"
            variant={isAdded ? "secondary" : "outline"}
            disabled={isAdded}
          >
            {isAdded ? (
              <BookmarkCheck aria-hidden="true" className="size-4" />
            ) : (
              <BookmarkPlus aria-hidden="true" className="size-4" />
            )}
            {isAdded ? "Na Lista de estudo" : "Adicionar à Lista de estudo"}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar empresa para estudo</DialogTitle>
            <DialogDescription>
              Registre por que você quer acompanhar {companyName}. As
              observações pessoais ficam separadas dos dados atuais da empresa.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor={reasonId} className="text-sm font-medium">
            Motivo da inclusão
          </label>
          <Textarea
            id={reasonId}
            autoFocus
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="O que chamou sua atenção nesta empresa?"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {reason.trim().length}/1000
            </span>
            {error && (
              <p id={errorId} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void addToStudyList()}
              disabled={pending || reason.trim().length === 0}
            >
              {pending ? "Salvando..." : "Adicionar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {notice && (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  );
}
