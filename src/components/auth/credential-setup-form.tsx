"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { getApiMessage } from "@/lib/api-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CredentialSetupForm({
  token,
  mode,
  termsApproved = false,
}: {
  token: string;
  mode: "invite" | "reset";
  termsApproved?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const title = mode === "invite" ? "Ative sua conta" : "Redefina sua senha";
  const endpoint =
    mode === "invite"
      ? "/api/auth/invitations/activate"
      : "/api/auth/password-resets/consume";

  if (mode === "invite" && !termsApproved) {
    return (
      <main className="grid min-h-[calc(100dvh-16rem)] place-items-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <h1 className="font-semibold leading-none tracking-tight">
              Ativação temporariamente indisponível
            </h1>
            <CardDescription className="leading-6">
              Novas contas poderão ser ativadas quando os Termos de Uso forem
              aprovados. Esta página não utilizará seu convite. Quando a
              ativação estiver liberada, solicite um novo convite ao
              administrador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <nav
              aria-label="Documentos de privacidade"
              className="flex flex-wrap gap-4 text-sm"
            >
              <Link
                href="/termos-de-uso"
                className="font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Termos de Uso
              </Link>
              <Link
                href="/privacidade"
                className="font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Política de Privacidade
              </Link>
            </nav>
            <Button asChild variant="outline" className="w-full">
              <Link href="/entrar">Voltar ao acesso</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    if (password !== confirmation) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (mode === "invite" && !termsAccepted) {
      setTermsError("Aceite os Termos de Uso para ativar sua conta.");
      return;
    }
    setTermsError(null);
    setPending(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          password,
          ...(mode === "invite"
            ? {
                name: String(formData.get("name") ?? ""),
                acceptTerms: termsAccepted,
              }
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
    <main className="grid min-h-[calc(100dvh-16rem)] place-items-center bg-background p-4">
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
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={passwordVisible ? "text" : "password"}
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  className="pr-11"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-9 w-9"
                  aria-label={
                    passwordVisible
                      ? "Ocultar nova senha"
                      : "Mostrar nova senha"
                  }
                  aria-pressed={passwordVisible}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                >
                  {passwordVisible ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="confirmation">Confirme a senha</label>
              <div className="relative">
                <Input
                  id="confirmation"
                  name="confirmation"
                  type={confirmationVisible ? "text" : "password"}
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  className="pr-11"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-9 w-9"
                  aria-label={
                    confirmationVisible
                      ? "Ocultar confirmação da senha"
                      : "Mostrar confirmação da senha"
                  }
                  aria-pressed={confirmationVisible}
                  onClick={() => setConfirmationVisible((visible) => !visible)}
                >
                  {confirmationVisible ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </Button>
              </div>
            </div>
            {mode === "invite" && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="accept-terms"
                    checked={termsAccepted}
                    aria-invalid={termsError ? true : undefined}
                    aria-describedby={termsError ? "terms-error" : undefined}
                    onCheckedChange={(checked) => {
                      const accepted = checked === true;
                      setTermsAccepted(accepted);
                      if (accepted) setTermsError(null);
                    }}
                    className="mt-0.5"
                  />
                  <Label
                    htmlFor="accept-terms"
                    className="cursor-pointer text-sm font-normal leading-6 text-foreground"
                  >
                    Os documentos ainda aguardam revisão jurídica. Li e aceito
                    os{" "}
                    <Link
                      href="/termos-de-uso"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-primary underline underline-offset-4"
                    >
                      Termos de Uso
                    </Link>
                    . A{" "}
                    <Link
                      href="/privacidade"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-primary underline underline-offset-4"
                    >
                      Política de Privacidade
                    </Link>{" "}
                    explica como os dados são tratados.
                  </Label>
                </div>
                {termsError && (
                  <p
                    id="terms-error"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {termsError}
                  </p>
                )}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Salvando…" : "Salvar senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
