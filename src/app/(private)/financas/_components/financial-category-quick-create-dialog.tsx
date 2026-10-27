"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequestWithResponse } from "@/lib/api-client";
import { getApiMessage } from "@/lib/api-message";
import { queryKeys } from "@/lib/query-keys";

type Kind = "INCOME" | "EXPENSE";
export type QuickCreatedCategory = {
  id: string;
  kind: Kind;
  name: string;
  active: boolean;
};

export function FinancialCategoryQuickCreateDialog({
  open,
  kind,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  kind: Kind;
  onOpenChange: (open: boolean) => void;
  onCreated: (category: QuickCreatedCategory) => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const { data } = await apiRequestWithResponse<
        QuickCreatedCategory & { message?: string }
      >(
        "/api/financial-categories",
        {
          method: "POST",
          body: JSON.stringify({ kind, name: name.trim() }),
        },
        "Não foi possível cadastrar a categoria.",
      );
      toast.success(getApiMessage(data, "Categoria cadastrada."));
      onCreated(data);
      setName("");
      onOpenChange(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.finances.categories() }),
        client.invalidateQueries({ queryKey: queryKeys.finances.all }),
      ]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível cadastrar a categoria.",
      );
    } finally {
      setSaving(false);
    }
  }

  const label = kind === "INCOME" ? "de entrada" : "de saída";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova categoria {label}</DialogTitle>
          <DialogDescription>
            Ela será selecionada neste lançamento.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void create(event)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quick-financial-category-name">Nome</Label>
            <Input
              id="quick-financial-category-name"
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={kind === "INCOME" ? "Ex.: Benefícios" : "Ex.: Saúde"}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button disabled={saving || !name.trim()}>
              {saving ? "Salvando…" : "Criar categoria"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
