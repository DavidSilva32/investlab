"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
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

export function CredentialSetupForm({
  token,
  mode,
}: {
  token: string;
  mode: "invite" | "reset";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const title = mode === "invite" ? "Ative sua conta" : "Redefina sua senha";
  const endpoint =
    mode === "invite"
      ? "/api/auth/invitations/activate"
      : "/api/auth/password-resets/consume";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    if (password !== confirmation) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          password,
          ...(mode === "invite"
            ? { name: String(formData.get("name") ?? "") }
            : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          getApiMessage(body, "Não foi possível salvar a senha."),
        );
      toast.success(
        mode === "invite"
          ? "Conta ativada. Faça login para continuar."
          : "Senha atualizada. Entre novamente.",
      );
      router.push("/entrar");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a senha.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Escolha uma senha com pelo menos 12 caracteres. O link é válido por
            24 horas e pode ser usado uma vez.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => void submit(event)}>
            {mode === "invite" && (
              <div className="space-y-2">
                <label htmlFor="name">Nome</label>
                <Input
                  id="name"
                  name="name"
                  required
                  autoComplete="name"
                  maxLength={120}
                />
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="password">Nova senha</label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirmation">Confirme a senha</label>
              <Input
                id="confirmation"
                name="confirmation"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Salvando…" : "Salvar senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
