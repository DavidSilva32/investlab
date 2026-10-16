"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, RefreshCw, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { getApiMessage } from "@/lib/api-message";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AccessData = {
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    expiresAt: string;
    status: string;
  }>;
  passwordResets: Array<{
    id: string;
    email: string;
    expiresAt: string;
    status: string;
  }>;
};

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  used: "Utilizado",
  expired: "Expirado",
  revoked: "Revogado",
};

export function AdminUsersClient() {
  const [data, setData] = useState<AccessData>();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [issuedLink, setIssuedLink] = useState("");
  const [issuedLabel, setIssuedLabel] = useState("");

  async function loadData() {
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          getApiMessage(body, "Não foi possível carregar usuários."),
        );
      setData(body as AccessData);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar usuários.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // This starts the initial request; state updates happen after its response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, []);

  async function issueLink(path: string, targetEmail: string, label: string) {
    setActionLoading(true);
    setIssuedLink("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(getApiMessage(body, "Não foi possível emitir o link."));
      setIssuedLink(body.url as string);
      setIssuedLabel(label);
      toast.success(
        "Link emitido. Copie e compartilhe diretamente com a pessoa.",
      );
      await loadData();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível emitir o link.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function revoke(path: string) {
    try {
      const response = await fetch(path, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          getApiMessage(body, "Não foi possível revogar o link."),
        );
      toast.success("Link revogado.");
      await loadData();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível revogar o link.",
      );
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        new URL(issuedLink, window.location.origin).toString(),
      );
      toast.success("Link copiado.");
    } catch {
      toast.error(
        "Não foi possível copiar o link. Selecione e copie o endereço exibido.",
      );
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Contas</CardTitle>
          <CardDescription>
            Gerencie convites e recuperação assistida. Esta área não mostra
            carteiras nem senhas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void issueLink("/api/admin/users", email, "Convite");
            }}
          >
            <label className="sr-only" htmlFor="invite-email">
              E-mail para convite
            </label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="E-mail da pessoa convidada"
            />
            <Button type="submit" disabled={actionLoading}>
              <UserPlus aria-hidden="true" className="size-4" /> Emitir convite
            </Button>
          </form>
          <form
            className="flex flex-col gap-3 border-t pt-5 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void issueLink(
                "/api/admin/password-resets",
                resetEmail,
                "Redefinição de senha",
              );
            }}
          >
            <label className="sr-only" htmlFor="reset-email">
              E-mail para redefinição de senha
            </label>
            <Input
              id="reset-email"
              type="email"
              required
              value={resetEmail}
              onChange={(event) => setResetEmail(event.target.value)}
              placeholder="E-mail da conta após verificar a identidade"
            />
            <Button type="submit" variant="outline" disabled={actionLoading}>
              <Link2 aria-hidden="true" className="size-4" /> Emitir link de
              redefinição
            </Button>
          </form>
          {issuedLink && (
            <div
              className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4"
              role="status"
            >
              <p className="text-sm font-medium">
                {issuedLabel}: link mostrado uma única vez
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  readOnly
                  aria-label={`${issuedLabel} gerado`}
                  value={new URL(issuedLink, window.location.origin).toString()}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void copyLink()}
                >
                  <Copy aria-hidden="true" className="size-4" /> Copiar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Usuários</CardTitle>
              <CardDescription>
                Contas cadastradas e papel atribuído.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Atualizar lista"
              onClick={() => void loadData()}
            >
              <RefreshCw aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p role="status">Carregando usuários…</p>
          ) : (
            <ul className="divide-y">
              {(data?.users ?? []).map((user) => (
                <li
                  className="flex flex-wrap justify-between gap-2 py-3"
                  key={user.id}
                >
                  <span>
                    <span className="block font-medium">{user.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {user.email}
                    </span>
                  </span>
                  <span className="text-sm">
                    {user.role === "ADMIN" ? "Administrador" : "Usuário"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <AccessLinkList
        title="Convites"
        items={data?.invitations ?? []}
        onRevoke={(id) => void revoke(`/api/admin/invitations/${id}`)}
        loading={loading}
      />
      <AccessLinkList
        title="Solicitações de redefinição"
        items={data?.passwordResets ?? []}
        onRevoke={(id) => void revoke(`/api/admin/password-resets/${id}`)}
        loading={loading}
      />
    </div>
  );
}

function AccessLinkList({
  title,
  items,
  onRevoke,
  loading,
}: {
  title: string;
  items: Array<{
    id: string;
    email: string;
    expiresAt: string;
    status: string;
  }>;
  onRevoke: (id: string) => void;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p role="status">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum registro.</p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 py-3"
                key={item.id}
              >
                <span>
                  <span className="block font-medium">{item.email}</span>
                  <span className="text-sm text-muted-foreground">
                    {statusLabels[item.status] ?? item.status} · expira em{" "}
                    {new Date(item.expiresAt).toLocaleString("pt-BR")}
                  </span>
                </span>
                {item.status === "pending" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRevoke(item.id)}
                  >
                    <X aria-hidden="true" className="size-4" /> Revogar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
