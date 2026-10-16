"use client";

import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import {
  PortfolioTable,
  type PortfolioTableColumn,
} from "@/components/portfolio-table";
import { Badge } from "@/components/ui/badge";
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

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  accountStatus: "ACTIVE" | "PENDING" | "DISABLED";
  lastLoginAt: string | null;
  createdAt: string;
};

export type PendingInvitation = {
  id: string;
  email: string;
  status: string;
};

type UserTableRow = {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN" | null;
  status: "waiting" | "active" | "disabled";
  lastLoginAt: string | null;
  isPendingInvite: boolean;
};

type Props = {
  users: ManagedUser[];
  invitations: PendingInvitation[];
  onUpdate: (
    id: string,
    changes: { name?: string; role?: "USER" | "ADMIN"; isActive?: boolean },
  ) => Promise<boolean>;
};

const accessRoleOptions = [
  { value: "USER", label: "Usuário" },
  { value: "ADMIN", label: "Administrador" },
];
const statusOptions = [
  { value: "waiting", label: "Aguardando" },
  { value: "active", label: "Ativo" },
  { value: "disabled", label: "Desativado" },
];

function formatAccessDate(value: string | null) {
  if (!value) return "Sem registro disponível";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

function statusBadge(status: UserTableRow["status"]) {
  if (status === "active") {
    return (
      <Badge className="border-status-success/30 bg-status-success/10 text-status-success">
        Ativo
      </Badge>
    );
  }
  if (status === "disabled") {
    return (
      <Badge className="border-status-danger/30 bg-status-danger/10 text-status-danger">
        Desativado
      </Badge>
    );
  }
  return (
    <Badge className="border-status-warning/30 bg-status-warning/10 text-status-warning">
      Aguardando
    </Badge>
  );
}

export function AdminUsersTable({ users, invitations, onUpdate }: Props) {
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const rows: UserTableRow[] = [
    ...users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: (user.accountStatus === "DISABLED"
        ? "disabled"
        : user.accountStatus === "PENDING"
          ? "waiting"
          : "active") as UserTableRow["status"],
      lastLoginAt: user.lastLoginAt,
      isPendingInvite: false,
    })),
    ...invitations
      .filter((invitation) => invitation.status === "pending")
      .map((invitation) => ({
        id: `invitation:${invitation.id}`,
        name: "Convite enviado",
        email: invitation.email,
        role: null,
        status: "waiting" as const,
        lastLoginAt: null,
        isPendingInvite: true,
      })),
  ];

  const columns: PortfolioTableColumn<UserTableRow>[] = [
    {
      id: "name",
      label: "Nome",
      width: "18rem",
      value: (row) => row.name,
      render: (row) => <p className="truncate font-medium">{row.name}</p>,
    },
    {
      id: "email",
      label: "E-mail",
      width: "20rem",
      value: (row) => row.email,
      render: (row) => (
        <p className="truncate text-sm text-muted-foreground">{row.email}</p>
      ),
    },
    {
      id: "role",
      label: "Papel",
      width: "12rem",
      value: (row) => row.role ?? "Aguardando",
      searchValue: (row) => row.role ?? "Aguardando",
      filterOptions: accessRoleOptions,
      render: (row) => {
        if (!row.role) return <span className="text-muted-foreground">—</span>;
        const user = users.find((candidate) => candidate.id === row.id);
        return (
          <Select
            value={row.role}
            onValueChange={(role: "USER" | "ADMIN") =>
              void onUpdate(row.id, { role })
            }
          >
            <SelectTrigger
              className="h-8 w-40"
              aria-label={`Papel de ${row.email}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accessRoleOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={user?.role === option.value}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      id: "status",
      label: "Situação",
      width: "10rem",
      value: (row) => row.status,
      searchValue: (row) => row.status,
      filterOptions: statusOptions,
      render: (row) => statusBadge(row.status),
    },
    {
      id: "lastLoginAt",
      label: "Último acesso registrado",
      width: "13rem",
      value: (row) => row.lastLoginAt ?? "",
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {formatAccessDate(row.lastLoginAt)}
        </span>
      ),
    },
    {
      id: "actions",
      label: "Ações",
      width: "10rem",
      sortable: false,
      value: () => null,
      render: (row) => {
        if (row.isPendingInvite) return null;
        const user = users.find((candidate) => candidate.id === row.id);
        if (!user) return null;
        const isActive = user.accountStatus !== "DISABLED";
        return (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Editar nome de ${row.email}`}
              onClick={() => {
                setEditingUser(user);
                setName(user.name);
              }}
            >
              <Pencil aria-hidden="true" className="size-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onUpdate(row.id, { isActive: !isActive })}
            >
              {isActive ? "Desativar" : "Ativar"}
            </Button>
          </div>
        );
      },
    },
  ];

  async function submitName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;
    setSavingName(true);
    try {
      if (await onUpdate(editingUser.id, { name })) setEditingUser(null);
    } finally {
      setSavingName(false);
    }
  }

  return (
    <>
      <PortfolioTable
        columns={columns}
        rows={rows}
        emptyMessage="Nenhum usuário ou convite aguardando ativação."
        initialSort={{ id: "name", direction: "asc" }}
        toolbarSummary="Contas e convites"
      />
      <Dialog
        open={editingUser !== null}
        onOpenChange={(open) => {
          if (!open && !savingName) setEditingUser(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar nome</DialogTitle>
            <DialogDescription>
              O e-mail da conta não pode ser alterado por esta tela.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitName}>
            <div className="space-y-2">
              <Label htmlFor="managed-user-name">Nome</Label>
              <Input
                id="managed-user-name"
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingUser(null)}
                disabled={savingName}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={savingName || !name.trim()}>
                {savingName ? "Salvando…" : "Salvar nome"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
