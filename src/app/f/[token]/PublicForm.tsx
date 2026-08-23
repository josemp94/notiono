"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { faltanObligatorios, FieldInput } from "@/components/database/FormFields";
import type { FieldLite } from "@/lib/cellText";

/** Formulario público: envía a /api/form/<token>, sin sesión ni tRPC. */
export function PublicForm({
  token,
  title,
  icon,
  fields,
  required = [],
}: {
  token: string;
  title: string;
  icon: string | null;
  fields: FieldLite[];
  required?: string[];
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [falta, setFalta] = useState<string[]>([]);
  const [estado, setEstado] = useState<"editando" | "enviando" | "enviado" | "error">("editando");

  const set = (id: string, v: unknown) => setValues((s) => ({ ...s, [id]: v }));

  const submit = async () => {
    const pendientes = faltanObligatorios(required, fields, values);
    setFalta(pendientes.map((f) => f.id));
    if (pendientes.length) return;
    setEstado("enviando");
    const cells: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.id];
      if (v !== undefined && v !== "" && v !== null) cells[f.id] = v;
    }
    const res = await fetch(`/api/form/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cells }),
    }).catch(() => null);
    setEstado(res?.ok ? "enviado" : "error");
  };

  if (estado === "enviado") {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-[var(--border)] p-10 shadow-sm">
          <Check size={32} className="mx-auto text-brand" />
          <h1 className="mt-3 text-xl font-semibold">¡Enviado!</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Tu respuesta se ha guardado.</p>
          <button
            onClick={() => {
              setValues({});
              setEstado("editando");
            }}
            className="mt-6 rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--hover)]"
          >
            Enviar otra respuesta
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">
        {icon ? `${icon} ` : ""}
        {title}
      </h1>
      <div className="rounded-2xl border border-[var(--border)] p-6 shadow-sm">
        <div className="space-y-4">
          {fields.map((f) => (
            <div key={f.id}>
              <label className="mb-1 block text-sm font-medium">
                {f.name}
                {required.includes(f.id) && <span className="ml-0.5 text-red-500">*</span>}
              </label>
              <FieldInput field={f} value={values[f.id]} onChange={(v) => set(f.id, v)} />
              {falta.includes(f.id) && <p className="mt-1 text-xs text-red-500">Este campo es obligatorio.</p>}
            </div>
          ))}
          {fields.length === 0 && <p className="text-sm text-[var(--muted)]">Este formulario no tiene campos.</p>}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={submit}
            disabled={estado === "enviando" || fields.length === 0}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {estado === "enviando" ? "Enviando…" : "Enviar"}
          </button>
          {estado === "error" && <span className="text-sm text-red-500">No se pudo enviar. Vuelve a intentarlo.</span>}
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-[var(--muted)]">Hecho con Notiono</p>
    </main>
  );
}
