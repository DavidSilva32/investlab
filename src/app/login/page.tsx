"use client";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { type SyntheticEvent, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!emailPattern.test(email)) {
      setError("Informe um e-mail válido.");
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(body.message ?? "Não foi possível concluir o login.");
        return;
      }
      router.push("/");
    } catch {
      setError("Não foi possível concluir o login.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="relative grid min-h-screen place-items-center bg-muted/40 p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md shadow-lg shadow-primary/5">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <LockKeyhole className="size-5" />
          </div>
          <p className="text-sm font-semibold text-primary">InvestLab</p>
          <CardTitle className="text-2xl">Acesse sua conta</CardTitle>
          <CardDescription>Entre para acompanhar sua carteira.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">
                E-mail
              </label>
              <Input
                id="email"
                name="email"
                required
                type="email"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="password">
                Senha
              </label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  required
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  className="pr-11"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-10 w-10"
                  aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setVisible((value) => !value)}
                >
                  {visible ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
              </div>
            </div>
            {error && (
              <p
                aria-live="polite"
                className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
