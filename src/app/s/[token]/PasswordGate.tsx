"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

/** Puerta de contraseña de una página pública protegida (/s/<token>). */
export function PasswordGate({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const entrar = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        location.reload(); // la cookie ya está: el servidor pinta la página
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "No se pudo comprobar la contraseña.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] p-6 text-center">
        <Lock size={24} className="mx-auto mb-3 text-[var(--muted)]" />
        <h1 className="font-display mb-1 text-lg font-bold">Página protegida</h1>
        <p className="mb-4 text-sm text-[var(--muted)]">Escribe la contraseña que te han dado para verla.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && entrar()}
          placeholder="Contraseña"
          className="mb-2 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        />
        {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
        <button
          onClick={entrar}
          disabled={busy || !password}
          className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? "Comprobando…" : "Entrar"}
        </button>
      </div>
    </main>
  );
}
