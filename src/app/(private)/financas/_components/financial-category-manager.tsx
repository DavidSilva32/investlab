"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiRequest, apiRequestWithResponse } from "@/lib/api-client";
import { getApiMessage } from "@/lib/api-message";
import { queryKeys } from "@/lib/query-keys";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Kind = "INCOME" | "EXPENSE";
type Category = {
  id: string;
  kind: Kind;
  name: string;
  originalName: string;
  isDefault: boolean;
  active: boolean;
};
type CategoryResponse = { categories: Category[] };

export function FinancialCategoryManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const client = useQueryClient();
  const [kind, setKind] = useState<Kind>("EXPENSE");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);
  const categories = useQuery({
    queryKey: queryKeys.finances.categories(),
    queryFn: () =>
      apiRequest<CategoryResponse>(
        "/api/financial-categories",
        undefined,
        "Não foi possível carregar as categorias.",
      ),
    enabled: open,
  });

  async function refreshCategories() {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.finances.categories() }),
      client.invalidateQueries({ queryKey: queryKeys.finances.all }),
    ]);
  }

  async function createCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const { data } = await apiRequestWithResponse<{ message?: string }>(
        "/api/financial-categories",
        {
          method: "POST",
          body: JSON.stringify({ kind, name: newName.trim() }),
        },
        "Não foi possível cadastrar a categoria.",
      );
      toast.success(getApiMessage(data, "Categoria cadastrada."));
      setNewName("");
      await refreshCategories();
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

  async function updateCategory(
    category: Category,
    values: { name?: string; active?: boolean },
  ) {
    setSaving(true);
    try {
      const { data } = await apiRequestWithResponse<{ message?: string }>(
        "/api/financial-categories",
        {
          method: "PATCH",
          body: JSON.stringify({ id: category.id, ...values }),
        },
        "Não foi possível atualizar a categoria.",
      );
      toast.success(getApiMessage(data, "Categoria atualizada."));
      setEditingId(null);
      await refreshCategories();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a categoria.",
      );
    } finally {
      setSaving(false);
    }
  }

  const kindCategories = (categories.data?.categories ?? []).filter(
    (category) => category.kind === kind,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Gerenciar categorias</DialogTitle>
          <DialogDescription>
            Categorias padrão são personalizadas só na sua conta. Categorias
            próprias podem ser renomeadas ou ocultadas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Tipo de categoria</Label>
            <Select
              value={kind}
              onValueChange={(value: Kind) => {
                setKind(value);
                setEditingId(null);
              }}
            >
              <SelectTrigger aria-label="Tipo de categoria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INCOME">Entradas</SelectItem>
                <SelectItem value="EXPENSE">Saídas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <form
            onSubmit={(event) => void createCategory(event)}
            className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-end"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="new-financial-category">Nova categoria</Label>
              <Input
                id="new-financial-category"
                maxLength={80}
                required
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={
                  kind === "INCOME" ? "Ex.: Benefícios" : "Ex.: Saúde"
                }
              />
            </div>
            <Button disabled={saving || !newName.trim()}>
              {saving ? "Salvando…" : "Adicionar"}
            </Button>
          </form>
          {categories.isPending ? (
            <p
              role="status"
              className="rounded-lg border p-4 text-sm text-muted-foreground"
            >
              Carregando categorias…
            </p>
          ) : categories.isError ? (
            <div className="rounded-lg border border-destructive/30 p-4">
              <p role="alert" className="text-sm text-destructive">
                {categories.error instanceof Error
                  ? categories.error.message
                  : "Não foi possível carregar as categorias."}
              </p>
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                onClick={() => void categories.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : kindCategories.length ? (
            <ul
              className="space-y-2"
              aria-label={
                kind === "INCOME"
                  ? "Categorias de entrada"
                  : "Categorias de saída"
              }
            >
              {kindCategories.map((category) => (
                <li
                  key={category.id}
                  className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  {editingId === category.id ? (
                    <div className="flex min-w-0 flex-1 items-end gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label htmlFor={`category-${category.id}`}>
                          Nome da categoria
                        </Label>
                        <Input
                          id={`category-${category.id}`}
                          maxLength={80}
                          required
                          value={draftName}
                          onChange={(event) => setDraftName(event.target.value)}
                        />
                      </div>
                      <Button
                        size="sm"
                        disabled={saving || !draftName.trim()}
                        onClick={() =>
                          void updateCategory(category, {
                            name: draftName.trim(),
                          })
                        }
                      >
                        Salvar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p
                        className={`truncate font-medium ${!category.active ? "text-muted-foreground line-through" : ""}`}
                      >
                        {category.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {category.isDefault
                          ? "Padrão · preferência da sua conta"
                          : "Personalizada"}
                        {!category.active ? " · Oculta" : ""}
                      </p>
                    </div>
                  )}
                  {editingId !== category.id && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Renomear ${category.name}`}
                        onClick={() => {
                          setEditingId(category.id);
                          setDraftName(category.name);
                        }}
                      >
                        Renomear
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`${category.active ? "Ocultar" : "Reativar"} ${category.name}`}
                        disabled={saving}
                        onClick={() =>
                          void updateCategory(category, {
                            active: !category.active,
                          })
                        }
                      >
                        {category.active ? "Ocultar" : "Reativar"}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nenhuma categoria para esse tipo.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
