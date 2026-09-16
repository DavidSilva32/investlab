"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    setLoading(false);
    if (!response.ok) {
      setError("E-mail ou senha inválidos.");
      return;
    }
    router.push("/");
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center bg-slate-50 p-6">
      <form
        onSubmit={submit}
        className="w-full rounded-xl border bg-white p-6 shadow-sm"
      >
        <p className="text-sm font-medium text-emerald-700">InvestLab</p>
        <h1 className="mt-1 text-2xl font-bold">Entrar</h1>
        <label className="mt-6 block text-sm font-medium" htmlFor="email">
          E-mail
        </label>
        <input
          className="mt-1 w-full rounded border p-2"
          id="email"
          name="email"
          required
          type="email"
        />
        <label className="mt-4 block text-sm font-medium" htmlFor="password">
          Senha
        </label>
        <input
          className="mt-1 w-full rounded border p-2"
          id="password"
          name="password"
          required
          type="password"
        />
        {error && (
          <p aria-live="polite" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          className="mt-6 w-full rounded bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
