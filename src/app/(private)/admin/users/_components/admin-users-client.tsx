"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, RefreshCw, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  AdminOverview,
  type AdminStats,
} from "@/app/(private)/admin/users/_components/admin-overview";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AdminUsersTable,
  type ManagedUser,
} from "@/app/(private)/admin/users/_components/admin-users-table";

type AccessData = {
  users: ManagedUser[];
  invitations: AccessLink[];
  passwordResets: AccessLink[];
  stats: AdminStats;
};

type AccessLink = {
  id: string;
  email: string;
  expiresAt: string;
  status: string;
};

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  used: "Utilizado",
  expired: "Expirado",
  revoked: "Revogado",
};

export function AdminUsersClient({
  initialTab = "people",
}: {
  initialTab?: "overview" | "people";
}) {
  const [data, setData] = useState<AccessData>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [issuedLink, setIssuedLink] = useState("");
  const [issuedLabel, setIssuedLabel] = useState("");

  async function loadData() {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        setLoadError(
          getApiMessage(body, "Não foi possível carregar os usuários."),
        );
        return;
      }
      setData(body as AccessData);
    } catch {
      setLoadError(
        "Não foi possível carregar os usuários. Verifique sua conexão e tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Start the initial request; state updates happen after its response.
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
      if (!response.ok) {
        throw new Error(getApiMessage(body, "Não foi possível gerar o link."));
      }
      setIssuedLink(body.url as string);
      setIssuedLabel(label);
      toast.success(
        "Link gerado. Copie e compartilhe diretamente com a pessoa.",
      );
      await loadData();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o link.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function revoke(path: string) {
    try {
      const response = await fetch(path, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          getApiMessage(body, "Não foi possível revogar o link."),
        );
      }
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

  async function updateUser(
    id: string,
    changes: {
      name?: string;
      role?: "USER" | "ADMIN";
      isActive?: boolean;
      betaExpiresAt?: string;
    },
  ): Promise<boolean> {
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(changes),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          getApiMessage(body, "Não foi possível atualizar esta conta."),
        );
      }
      toast.success("Conta atualizada.");
      await loadData();
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar esta conta.",
      );
      return false;
    }
  }

  async function deleteUser(
    id: string,
    confirmEmail: string,
  ): Promise<boolean> {
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmEmail }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          getApiMessage(body, "Não foi possível excluir esta conta."),
        );
      }
      toast.success("Conta e dados associados foram excluídos.");
      await loadData();
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir esta conta.",
      );
      return false;
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
        "Não foi possível copiar. Selecione e copie o endereço exibido.",
      );
    }
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      {loadError && (
        <div
          className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="text-sm text-foreground">{loadError}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadData()}
            disabled={loading}
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Tentar novamente
          </Button>
        </div>
      )}
      <Tabs defaultValue={initialTab} className="space-y-5">
        <TabsList className="grid h-auto w-full max-w-md grid-cols-2 rounded-xl bg-muted/70 p-1">
          <TabsTrigger value="overview" className="rounded-lg py-2.5">
            Visão geral
          </TabsTrigger>
          <TabsTrigger value="people" className="rounded-lg py-2.5">
            Pessoas e acessos
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-0 space-y-5">
          <AdminOverview stats={data?.stats} />
        </TabsContent>
        <TabsContent value="people" className="mt-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Acessos</CardTitle>
              <CardDescription>
                Convide participantes e gere links de redefinição após confirmar
                a identidade da pessoa. Esta área não mostra carteiras nem
                senhas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <section aria-labelledby="invite-heading" className="space-y-3">
                <div>
                  <h2 id="invite-heading" className="text-sm font-semibold">
                    Convidar participante
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    O convite fica vinculado a este e-mail e pode ser usado uma
                    vez antes do vencimento.
                  </p>
                </div>
                <form
                  className="flex flex-col gap-3 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void issueLink("/api/admin/users", email, "Convite");
                  }}
                >
                  <label className="sr-only" htmlFor="invite-email">
                    E-mail da pessoa convidada
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
                    <UserPlus aria-hidden="true" className="size-4" />
                    Gerar convite
                  </Button>
                </form>
              </section>

              <section
                id="password-reset"
                aria-labelledby="reset-heading"
                className="space-y-3 border-t pt-5"
              >
                <div>
                  <h2 id="reset-heading" className="text-sm font-semibold">
                    Redefinição assistida de senha
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Confirme a identidade da pessoa por um canal confiável antes
                    de gerar o link. Ele permite que ela escolha uma nova senha
                    e encerra as sessões anteriores.
                  </p>
                </div>
                <form
                  className="flex flex-col gap-3 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void issueLink(
                      "/api/admin/password-resets",
                      resetEmail,
                      "Link para redefinir senha",
                    );
                  }}
                >
                  <label className="sr-only" htmlFor="reset-email">
                    E-mail da conta cuja identidade foi confirmada
                  </label>
                  <Input
                    id="reset-email"
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    placeholder="E-mail da conta após confirmar a identidade"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={actionLoading}
                  >
                    <Link2 aria-hidden="true" className="size-4" />
                    Gerar link para redefinir senha
                  </Button>
                </form>
              </section>

              {issuedLink && (
                <div
                  className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4"
                  role="status"
                >
                  <p className="text-sm font-medium">
                    {issuedLabel}: link disponível somente agora
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Copie e envie diretamente à pessoa. O link não será exibido
                    novamente depois que você sair desta tela.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      readOnly
                      aria-label={`${issuedLabel} gerado`}
                      value={new URL(
                        issuedLink,
                        window.location.origin,
                      ).toString()}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void copyLink()}
                    >
                      <Copy aria-hidden="true" className="size-4" /> Copiar link
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
                    Pesquise contas e convites, confira os acessos e atualize o
                    nome, o papel ou a situação. Dados financeiros não aparecem
                    nesta área. O último acesso fica sem data quando ainda não
                    foi registrado pelo sistema.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Atualizar lista de usuários e links"
                  onClick={() => void loadData()}
                >
                  <RefreshCw aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <p className="p-5 text-sm text-muted-foreground" role="status">
                  Carregando usuários…
                </p>
              ) : !data ? null : (
                <AdminUsersTable
                  users={data.users}
                  invitations={data.invitations}
                  onUpdate={updateUser}
                  onDelete={deleteUser}
                />
              )}
            </CardContent>
          </Card>

          {(data || loading) && (
            <>
              <AccessLinkList
                title="Convites"
                items={data?.invitations ?? []}
                onRevoke={(id) => void revoke(`/api/admin/invitations/${id}`)}
                loading={loading}
              />
              <AccessLinkList
                title="Links de redefinição de senha"
                items={data?.passwordResets ?? []}
                onRevoke={(id) =>
                  void revoke(`/api/admin/password-resets/${id}`)
                }
                loading={loading}
              />
            </>
          )}
        </TabsContent>
      </Tabs>
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
  items: AccessLink[];
  onRevoke: (id: string) => void;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Tokens não são armazenados nem exibidos nesta lista.
        </CardDescription>
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
