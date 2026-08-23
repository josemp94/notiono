"use client";

import { useState } from "react";
import { Check, Globe, Link2 } from "lucide-react";
import { trpc } from "@/trpc/react";
import { toast } from "@/components/Toast";
import { faltanObligatorios, FieldInput, FORM_SUPPORTED } from "./FormFields";
import type { FieldLite } from "@/lib/cellText";

export function FormView({
  pageId,
  collectionId,
  fields,
  view,
}: {
  pageId: string;
  collectionId: string;
  fields: FieldLite[];
  view: { id: string; config: unknown };
}) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [done, setDone] = useState(false);
  const formFields = fields.filter((f) => FORM_SUPPORTED.includes(f.type));

  const invalidate = () => utils.db.get.invalidate({ pageId });
  const addRecord = trpc.db.addRecord.useMutation({
    onSuccess: async () => {
      await invalidate();
      setValues({});
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    },
  });
  const publish = trpc.db.publishForm.useMutation({ onSuccess: invalidate });
  const unpublish = trpc.db.unpublishForm.useMutation({ onSuccess: invalidate });
  const updateView = trpc.db.updateView.useMutation({ onSuccess: invalidate });

  const cfg = (view.config ?? {}) as { publicToken?: string; requiredFields?: string[]; thanksMessage?: string };
  const publicToken = cfg.publicToken;
  const required = cfg.requiredFields ?? [];
  const [falta, setFalta] = useState<string[]>([]);

  const toggleRequired = (fieldId: string) =>
    updateView.mutate({
      id: view.id,
      config: {
        ...cfg,
        requiredFields: required.includes(fieldId) ? required.filter((x) => x !== fieldId) : [...required, fieldId],
      },
    });

  const set = (id: string, v: unknown) => setValues((s) => ({ ...s, [id]: v }));

  const submit = () => {
    const pendientes = faltanObligatorios(required, formFields, values);
    setFalta(pendientes.map((f) => f.id));
    if (pendientes.length) return;
    const cells: Record<string, unknown> = {};
    for (const f of formFields) {
      const v = values[f.id];
      if (v !== undefined && v !== "" && v !== null) cells[f.id] = v;
    }
    addRecord.mutate({ collectionId, cells });
  };

  return (
    <div className="mx-auto max-w-xl">
      {/* Compartir en la web: cualquiera con /f/<token> envía filas sin cuenta. */}
      <div className="mb-3 flex items-center justify-end gap-3 text-sm">
        {publicToken ? (
          <>
            <button
              onClick={() =>
                navigator.clipboard
                  .writeText(`${location.origin}/f/${publicToken}`)
                  .then(() => toast("Enlace del formulario copiado"))
              }
              className="toque-estrecho flex items-center gap-1.5 text-brand hover:underline"
            >
              <Link2 size={14} /> Copiar enlace público
            </button>
            <button
              onClick={() => unpublish.mutate({ viewId: view.id })}
              disabled={unpublish.isPending}
              className="toque-estrecho text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Dejar de compartir
            </button>
          </>
        ) : (
          <button
            onClick={() => publish.mutate({ viewId: view.id })}
            disabled={publish.isPending}
            className="toque-estrecho flex items-center gap-1.5 text-[var(--muted)] hover:text-[var(--foreground)]"
            title="Cualquiera con el enlace podrá enviar filas, sin cuenta"
          >
            <Globe size={14} /> Compartir formulario
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--border)] p-6 shadow-sm">
        <div className="space-y-4">
          {formFields.map((f) => (
            <div key={f.id}>
              <label className="mb-1 flex items-center gap-1 text-sm font-medium">
                {f.name}
                {/* Alternar obligatorio: el * es botón aquí y solo adorno en el formulario público. */}
                {f.type !== "checkbox" && (
                  <button
                    onClick={() => toggleRequired(f.id)}
                    className={`toque-estrecho rounded px-1 text-base leading-none ${
                      required.includes(f.id) ? "text-red-500" : "al-pasar text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                    title={required.includes(f.id) ? "Obligatorio — pulsa para hacerlo opcional" : "Hacer obligatorio"}
                  >
                    *
                  </button>
                )}
              </label>
              <FieldInput field={f} value={values[f.id]} onChange={(v) => set(f.id, v)} />
              {falta.includes(f.id) && <p className="mt-1 text-xs text-red-500">Este campo es obligatorio.</p>}
            </div>
          ))}
          {formFields.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No hay campos compatibles con el formulario.</p>
          )}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={submit}
            disabled={addRecord.isPending || formFields.length === 0}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Enviar
          </button>
          {done && <span className="flex items-center gap-1 text-sm text-green-600"><Check size={14} /> Registro añadido</span>}
        </div>
      </div>

      {/* Qué lee quien envía el formulario público al terminar. */}
      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Mensaje tras enviar (formulario público)</label>
        <input
          defaultValue={cfg.thanksMessage ?? ""}
          placeholder="Tu respuesta se ha guardado."
          onBlur={(e) => {
            const m = e.target.value.trim();
            if ((cfg.thanksMessage ?? "") !== m) updateView.mutate({ id: view.id, config: { ...cfg, thanksMessage: m } });
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm outline-none focus:border-brand"
        />
      </div>
    </div>
  );
}
