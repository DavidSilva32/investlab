"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";
import { ExternalLink, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

export type StudyObservation = {
  id: string;
  issuerCnpj: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};
export type StudyEntry = {
  issuerCnpj: string;
  companyName: string;
  ticker: string | null;
  reason: string;
  addedAt: string;
  availableTickers: string[];
  observations: StudyObservation[];
};

type Props = {
  entry: StudyEntry;
  pending: boolean;
  onRemove: () => Promise<string | null>;
  onUpdateReason: (reason: string) => Promise<boolean>;
  onAddObservation: (text: string) => Promise<boolean>;
  onUpdateObservation: (
    observationId: string,
    text: string,
  ) => Promise<boolean>;
};
type EditTarget = { observationId: string; text: string } | null;

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  return dateFormat.format(new Date(value));
}

export function StudyListEntryCard({
  entry,
  pending,
  onRemove,
  onUpdateReason,
  onAddObservation,
  onUpdateObservation,
}: Props) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingReason, setEditingReason] = useState(false);
  const [reasonDraft, setReasonDraft] = useState(entry.reason);
  const [newObservation, setNewObservation] = useState("");
  const [editTarget, setEditTarget] = useState<EditTarget>(null);

  async function saveReason() {
    if (await onUpdateReason(reasonDraft.trim())) setEditingReason(false);
  }
  async function saveObservation() {
    if (await onAddObservation(newObservation.trim())) setNewObservation("");
  }
  async function saveEditedObservation(target: NonNullable<EditTarget>) {
    if (await onUpdateObservation(target.observationId, target.text.trim()))
      setEditTarget(null);
  }
  async function confirmRemoval(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const error = await onRemove();
    if (error) setDeleteError(error);
    else {
      setDeleteError(null);
      setDeleteDialogOpen(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{entry.companyName}</CardTitle>
            <CardDescription>
              {entry.ticker ?? "Sem ticker registrado"} · Incluída em{" "}
              {formatDate(entry.addedAt)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {entry.availableTickers.length > 0 ? (
              entry.availableTickers.map((ticker) => (
                <Button key={ticker} asChild size="sm" variant="outline">
                  <Link href={"/analyses?ticker=" + encodeURIComponent(ticker)}>
                    <ExternalLink aria-hidden="true" className="size-4" />
                    Analisar {ticker}
                  </Link>
                </Button>
              ))
            ) : (
              <p className="self-center text-sm text-muted-foreground">
                Análise indisponível: não há ticker identificado para este
                emissor.
              </p>
            )}
            <AlertDialog
              open={deleteDialogOpen}
              onOpenChange={(open) => {
                if (!open && pending) return;
                setDeleteDialogOpen(open);
                if (open) setDeleteError(null);
              }}
            >
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                  Remover
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Remover {entry.companyName} da lista?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    A empresa e todas as observações pessoais registradas para
                    ela serão excluídas. Essa ação não pode ser desfeita.
                    {deleteError && (
                      <span
                        role="alert"
                        className="mt-2 block text-destructive"
                      >
                        {deleteError}
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>
                    Cancelar
                  </AlertDialogCancel>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={confirmRemoval}
                  >
                    Remover empresa
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <section
          aria-label={"Motivo pessoal para " + entry.companyName}
          className="rounded-lg border bg-muted/30 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Motivo da inclusão</h3>
            {!editingReason && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setEditingReason(true);
                  setReasonDraft(entry.reason);
                }}
              >
                <Pencil aria-hidden="true" className="size-4" />
                Editar motivo
              </Button>
            )}
          </div>
          {editingReason ? (
            <div className="mt-2 space-y-2">
              <Textarea
                aria-label={
                  "Editar motivo da inclusão para " + entry.companyName
                }
                maxLength={1000}
                value={reasonDraft}
                onChange={(event) => setReasonDraft(event.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setEditingReason(false);
                    setReasonDraft(entry.reason);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={pending || !reasonDraft.trim()}
                  onClick={() => void saveReason()}
                >
                  <Save aria-hidden="true" className="size-4" />
                  {pending ? "Salvando…" : "Salvar motivo"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {entry.reason}
            </p>
          )}
        </section>

        <section
          className="space-y-3"
          aria-label={"Observações pessoais para " + entry.companyName}
        >
          <div>
            <h3 className="font-medium">Observações pessoais</h3>
            <p className="text-xs text-muted-foreground">
              Notas manuais separadas dos fundamentos atuais. Novas notas são
              acrescentadas à lista.
            </p>
          </div>
          {entry.observations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma observação registrada ainda.
            </p>
          ) : (
            <ol className="space-y-3">
              {entry.observations.map((observation) => {
                const editing = editTarget?.observationId === observation.id;
                return (
                  <li key={observation.id} className="rounded-lg border p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        {formatDate(observation.createdAt)}
                        {observation.updatedAt !== observation.createdAt &&
                          " · Editada em " + formatDate(observation.updatedAt)}
                      </p>
                      {!editing && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            setEditTarget({
                              observationId: observation.id,
                              text: observation.text,
                            })
                          }
                        >
                          Editar
                        </Button>
                      )}
                    </div>
                    {editing && editTarget ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          aria-label={
                            "Editar observação de " + entry.companyName
                          }
                          maxLength={4000}
                          value={editTarget.text}
                          onChange={(event) =>
                            setEditTarget({
                              ...editTarget,
                              text: event.target.value,
                            })
                          }
                        />
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={pending}
                            onClick={() => setEditTarget(null)}
                          >
                            Cancelar
                          </Button>
                          <Button
                            type="button"
                            disabled={pending || !editTarget.text.trim()}
                            onClick={() =>
                              editTarget &&
                              void saveEditedObservation(editTarget)
                            }
                          >
                            <Save aria-hidden="true" className="size-4" />
                            {pending ? "Salvando…" : "Salvar alteração"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap text-sm">
                        {observation.text}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <label
              htmlFor={"new-observation-" + entry.issuerCnpj}
              className="text-sm font-medium"
            >
              Nova observação
            </label>
            <Textarea
              id={"new-observation-" + entry.issuerCnpj}
              maxLength={4000}
              value={newObservation}
              onChange={(event) => setNewObservation(event.target.value)}
              placeholder="Registre o que você observou durante o estudo."
            />
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                disabled={pending || !newObservation.trim()}
                onClick={() => void saveObservation()}
              >
                <Plus aria-hidden="true" className="size-4" />
                {pending ? "Salvando…" : "Registrar observação"}
              </Button>
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
