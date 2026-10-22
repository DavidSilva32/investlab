"use client";

import { useState, type FormEvent } from "react";
import {
  Clock3,
  MoreHorizontal,
  Pencil,
  ShieldAlert,
  Trash2,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import {
  PortfolioTable,
  type PortfolioTableColumn,
} from "@/components/portfolio-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBrazilianPhone } from "@/lib/brazilian-phone";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "USER" | "ADMIN";
  accountStatus: "ACTIVE" | "PENDING" | "DISABLED";
  betaActivatedAt: string | null;
  betaExpiresAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

export type PendingInvitation = {
  id: string;
  email: string;
  status: string;
};

type UserTableRowBase = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: "waiting" | "active" | "disabled";
  lastLoginAt: string | null;
  betaExpiresAt: string | null;
};

type UserTableRow = UserTableRowBase &
  (
    | {
        role: "USER" | "ADMIN";
        sourceUser: ManagedUser;
        isPendingInvite: false;
      }
    | { role: null; sourceUser: null; isPendingInvite: true }
  );

type Props = {
  users: ManagedUser[];
  invitations: PendingInvitation[];
  onUpdate: (
    id: string,
    changes: {
      name?: string;
      role?: "USER" | "ADMIN";
      isActive?: boolean;
      betaExpiresAt?: string;
    },
  ) => Promise<boolean>;
  onDelete: (id: string, confirmEmail: string) => Promise<boolean>;
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

export function AdminUsersTable({
  users,
  invitations,
  onUpdate,
  onDelete,
}: Props) {
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<ManagedUser | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<ManagedUser | null>(
    null,
  );
  const [name, setName] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const rows: UserTableRow[] = [
    ...users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: (user.accountStatus === "DISABLED"
        ? "disabled"
        : user.accountStatus === "PENDING"
          ? "waiting"
          : "active") as UserTableRow["status"],
      lastLoginAt: user.lastLoginAt,
      betaExpiresAt: user.betaExpiresAt,
      sourceUser: user,
      isPendingInvite: false as const,
    })),
    ...invitations
      .filter((invitation) => invitation.status === "pending")
      .map((invitation) => ({
        id: `invitation:${invitation.id}`,
        name: "Convite enviado",
        email: invitation.email,
        phone: null,
        role: null,
        status: "waiting" as const,
        lastLoginAt: null,
        betaExpiresAt: null,
        sourceUser: null,
        isPendingInvite: true as const,
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
      id: "phone",
      label: "Telefone",
      width: "12rem",
      value: (row) => row.phone ?? "",
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.phone ? formatBrazilianPhone(row.phone) : "Não informado"}
        </span>
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
                  disabled={row.sourceUser.role === option.value}
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
      render: (row) => (
        <span className="space-y-1">
          {statusBadge(row.status)}
          {row.sourceUser?.betaExpiresAt && row.role === "USER" && (
            <span className="block text-xs text-muted-foreground">
              {new Date(row.sourceUser.betaExpiresAt) <= new Date()
                ? "Beta vencido · somente leitura"
                : `Beta até ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(row.sourceUser.betaExpiresAt))}`}
            </span>
          )}
        </span>
      ),
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
      width: "4rem",
      sortable: false,
      render: (row) => {
        if (row.isPendingInvite) return null;
        const user = row.sourceUser;
        const isActive = user.accountStatus !== "DISABLED";
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Ações para ${row.email}`}
                >
                  <MoreHorizontal aria-hidden="true" className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    setEditingUser(user);
                    setName(user.name);
                  }}
                >
                  <Pencil aria-hidden="true" />
                  Editar nome
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className={
                    isActive
                      ? "text-status-danger focus:text-status-danger"
                      : undefined
                  }
                  onSelect={() => {
                    if (isActive) setDeactivatingUser(user);
                    else void onUpdate(row.id, { isActive: true });
                  }}
                >
                  {isActive ? (
                    <UserRoundX aria-hidden="true" />
                  ) : (
                    <UserRoundCheck aria-hidden="true" />
                  )}
                  {isActive ? "Desativar conta" : "Ativar conta"}
                </DropdownMenuItem>
                {user.role === "USER" && user.accountStatus === "ACTIVE" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => {
                        const existingExpiry = user.betaExpiresAt
                          ? new Date(user.betaExpiresAt).getTime()
                          : 0;
                        const newExpiry = new Date(
                          Math.max(Date.now(), existingExpiry) +
                            30 * 24 * 60 * 60 * 1000,
                        );
                        void onUpdate(row.id, {
                          betaExpiresAt: newExpiry.toISOString(),
                        });
                      }}
                    >
                      <Clock3 aria-hidden="true" />
                      Estender beta por 30 dias
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-status-danger focus:text-status-danger"
                  onSelect={() => {
                    setConfirmEmail("");
                    setDeletingUser(user);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  Excluir conta e dados
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  async function submitName(
    event: FormEvent<HTMLFormElement>,
    user: ManagedUser,
  ) {
    event.preventDefault();
    setSavingName(true);
    try {
      if (await onUpdate(user.id, { name })) setEditingUser(null);
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
        {editingUser && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar nome</DialogTitle>
              <DialogDescription>
                O e-mail da conta não pode ser alterado por esta tela.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(event) => void submitName(event, editingUser)}
            >
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
        )}
      </Dialog>
      <Dialog
        open={deletingUser !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeletingUser(null);
            setConfirmEmail("");
          }
        }}
      >
        {deletingUser && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-status-danger">
                <ShieldAlert aria-hidden="true" className="size-5" />
                Excluir conta e histórico?
              </DialogTitle>
              <DialogDescription>
                Esta ação remove permanentemente os dados pessoais, o acesso e
                os registros financeiros de {deletingUser.name}. Não pode ser
                desfeita.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setDeleting(true);
                try {
                  if (await onDelete(deletingUser.id, confirmEmail.trim())) {
                    setDeletingUser(null);
                    setConfirmEmail("");
                  }
                } finally {
                  setDeleting(false);
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="confirm-delete-user-email">
                  Para confirmar, digite {deletingUser.email}
                </Label>
                <Input
                  id="confirm-delete-user-email"
                  type="email"
                  autoComplete="off"
                  value={confirmEmail}
                  onChange={(event) => setConfirmEmail(event.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDeletingUser(null);
                    setConfirmEmail("");
                  }}
                  disabled={deleting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={
                    deleting ||
                    confirmEmail.trim().toLowerCase() !==
                      deletingUser.email.toLowerCase()
                  }
                >
                  {deleting ? "Excluindo…" : "Excluir definitivamente"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
      {deactivatingUser && (
        <ConfirmActionDialog
          open
          onOpenChange={() => setDeactivatingUser(null)}
          hideTrigger
          title="Desativar usuário?"
          description={`A conta de ${deactivatingUser.name} (${deactivatingUser.email}) perderá o acesso ao InvestLab. Você poderá reativá-la depois.`}
          confirmLabel="Desativar usuário"
          onConfirm={() => {
            void onUpdate(deactivatingUser.id, { isActive: false }).then(
              (updated) => {
                if (updated) setDeactivatingUser(null);
              },
            );
          }}
        />
      )}
    </>
  );
}
