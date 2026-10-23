"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiMessage } from "@/lib/api-message";

export function PublicSignupForm({ termsVersion }: { termsVersion: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [created, setCreated] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password !== confirmation) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (!termsAccepted) {
      toast.error("Aceite os Termos de Uso para criar a conta.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/auth/public-signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? ""),
          name: String(form.get("name") ?? ""),
          password,
          confirmation,
          acceptTerms: true,
          termsVersion,
        }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        toast.error(getApiMessage(body, "Não foi possível criar sua conta."));
        return;
      }
      setCreated(true);
    } catch {
      toast.error("Não foi possível criar sua conta.");
    } finally {
      setPending(false);
    }
  }

  if (created) {
    return (
      <main className="grid min-h-[calc(100dvh-16rem)] place-items-center bg-background p-4">
        <Card className="w-full max-w-lg border-primary/20 shadow-xl shadow-primary/5">
          <CardHeader className="items-center text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <CheckCircle2 aria-hidden="true" className="size-6" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">
              Sua conta está pronta
            </h1>
            <CardDescription>
              Entre com seu e-mail e senha. Seu acesso beta dura 30 dias;
              depois, a conta passa a somente leitura.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => router.push("/entrar")}>
              Ir para o acesso
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="relative isolate grid min-h-[calc(100dvh-16rem)] place-items-center overflow-hidden bg-background p-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-[min(65vh,40rem)] w-[min(70vw,56rem)] rounded-full bg-primary/10 blur-3xl"
      />
      <Card className="w-full max-w-lg border-border/70 bg-card/95 shadow-2xl shadow-primary/10">
        <CardHeader>
          <div className="mb-2 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <UserRoundPlus aria-hidden="true" className="size-5" />
          </div>
          <p className="text-sm font-semibold text-primary">
            Acesso beta gratuito
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Crie sua conta
          </h1>
          <CardDescription>
            Teste o InvestLab por 30 dias. Depois, sua conta fica em modo de
            somente leitura até a abertura de um plano.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => void submit(event)}>
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                name="name"
                required
                autoComplete="name"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
              />
              <p className="text-xs text-muted-foreground">
                Use um endereço ao qual você tenha acesso. O envio de e-mails e
                a recuperação automática ainda não estão disponíveis.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
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
                  className="absolute right-0 top-0 h-10 w-10"
                  aria-label={
                    passwordVisible ? "Ocultar senha" : "Mostrar senha"
                  }
                  aria-pressed={passwordVisible}
                  onClick={() => setPasswordVisible((value) => !value)}
                >
                  {passwordVisible ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use pelo menos 12 caracteres.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmation">Confirme a senha</Label>
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
                  className="absolute right-0 top-0 h-10 w-10"
                  aria-label={
                    confirmationVisible
                      ? "Ocultar confirmação da senha"
                      : "Mostrar confirmação da senha"
                  }
                  aria-pressed={confirmationVisible}
                  onClick={() => setConfirmationVisible((value) => !value)}
                >
                  {confirmationVisible ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </Button>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <Checkbox
                id="acceptTerms"
                checked={termsAccepted}
                onCheckedChange={(checked) =>
                  setTermsAccepted(checked === true)
                }
              />
              <Label
                htmlFor="acceptTerms"
                className="cursor-pointer text-sm leading-5 text-muted-foreground"
              >
                Li e aceito os{" "}
                <Link
                  href="/termos-de-uso"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  Termos de Uso
                </Link>
                . Consulte também a{" "}
                <Link
                  href="/privacidade"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  Política de Privacidade
                </Link>
                .
              </Label>
            </div>
            <Button className="w-full" disabled={pending} type="submit">
              {pending ? "Criando conta..." : "Criar conta beta gratuita"}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Já tem uma conta?{" "}
            <Link
              href="/entrar"
              className="font-medium text-primary underline underline-offset-4"
            >
              Entre aqui
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
