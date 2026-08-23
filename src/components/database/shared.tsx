"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Database, FunctionSquare, Link2, Plus, Sigma } from "lucide-react";
import { trpc } from "@/trpc/react";
import { Popover } from "./Popover";
import type { FieldLite } from "@/lib/cellText";
import { ROLLUP_AGG_LABELS, type RollupAgg } from "@/lib/rollup";

export const FIELD_LABELS: Record<string, string> = {
  text: "Texto",
  number: "Número",
  select: "Selección",
  multiselect: "Selección múltiple",
  status: "Estado",
  person: "Persona",
  files: "Archivos y multimedia",
  checkbox: "Casilla",
  date: "Fecha",
  url: "URL",
  email: "Correo",
  phone: "Teléfono",
  created_time: "Fecha de creación",
  last_edited_time: "Última edición",
  created_by: "Creado por",
  last_edited_by: "Editado por",
  id: "ID",
  button: "Botón",
  relation: "Relación",
  rollup: "Rollup",
  formula: "Fórmula",
};

const TYPES = ["text", "number", "select", "multiselect", "status", "person", "files", "checkbox", "date", "url", "email", "phone", "created_time", "last_edited_time", "created_by", "last_edited_by", "id", "button"] as const;

const AGGS: [string, string][] = [...ROLLUP_AGG_LABELS];

export function AddFieldButton({
  collectionId,
  fields = [],
  onDone,
}: {
  collectionId: string;
  fields?: FieldLite[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"root" | "relation" | "rollup" | "formula">("root");
  const [relField, setRelField] = useState<FieldLite | null>(null);
  const [agg, setAgg] = useState<string | null>(null);
  const [expr, setExpr] = useState("");
  const [fname, setFname] = useState("Fórmula");

  const reset = () => {
    setOpen(false);
    setView("root");
    setRelField(null);
    setAgg(null);
    setExpr("");
    setFname("Fórmula");
  };
  const done = () => {
    reset();
    onDone();
  };

  const addField = trpc.db.addField.useMutation({ onSuccess: done });
  const addRelation = trpc.db.addRelation.useMutation({ onSuccess: done });
  const addRollup = trpc.db.addRollup.useMutation({ onSuccess: done });
  const addFormula = trpc.db.addFormula.useMutation({ onSuccess: done });
  const { data: databases } = trpc.db.listDatabases.useQuery(undefined, { enabled: open });

  const relationFields = fields.filter((f) => f.type === "relation");
  // Campos de la BD destino de la relación elegida (para rollups sum/avg/…)
  const targetOf = (rf: FieldLite | null) => {
    const tcid = rf ? (rf.config as { targetCollectionId?: string })?.targetCollectionId : null;
    return databases?.find((d) => d.collectionId === tcid);
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => (open ? reset() : setOpen(true))}
        className="rounded px-2 py-0.5 text-[var(--muted)] hover:bg-[var(--hover)]"
        title="Añadir columna"
      >
        <Plus size={16} />
      </button>
      {open && (
        <Popover onClose={reset} className="right-0 w-52 p-1">
          {view === "root" && (
            <>
              {TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => addField.mutate({ collectionId, name: FIELD_LABELS[t], type: t })}
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-[var(--hover)]"
                >
                  {FIELD_LABELS[t]}
                </button>
              ))}
              <div className="my-1 border-t border-[var(--border)]" />
              <button
                onClick={() => setView("relation")}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-[var(--hover)]"
              >
                <Link2 size={14} /> Relación <ChevronRight size={12} className="ml-auto" />
              </button>
              <button
                onClick={() => setView("rollup")}
                disabled={relationFields.length === 0}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm enabled:hover:bg-[var(--hover)] enabled:hover:text-[var(--foreground)] disabled:opacity-40"
                title={relationFields.length === 0 ? "Crea antes un campo de Relación" : ""}
              >
                <Sigma size={14} /> Rollup <ChevronRight size={12} className="ml-auto" />
              </button>
              <button
                onClick={() => setView("formula")}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-[var(--hover)]"
              >
                <FunctionSquare size={14} /> Fórmula <ChevronRight size={12} className="ml-auto" />
              </button>
            </>
          )}

          {view === "formula" && (
            <div className="w-64 p-1">
              <button onClick={() => setView("root")} className="mb-1 flex items-center gap-1 text-left text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
                <ChevronLeft size={12} /> Nueva fórmula
              </button>
              <input
                value={fname}
                onChange={(e) => setFname(e.target.value)}
                placeholder="Nombre"
                className="mb-1 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none"
              />
              <textarea
                value={expr}
                onChange={(e) => setExpr(e.target.value)}
                placeholder={'if(prop("Estado") == "Hecho", 1, 0)'}
                rows={3}
                className="w-full rounded border border-[var(--border)] bg-transparent px-2 py-1 font-mono text-xs outline-none"
              />
              <div className="mt-1 max-h-16 overflow-y-auto text-[11px] text-[var(--muted)]">
                Campos:{" "}
                {fields
                  .filter((f) => f.type !== "formula")
                  .map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setExpr((x) => `${x}prop("${f.name}")`)}
                      className="mr-1 rounded bg-[var(--border)]/40 px-1 hover:text-[var(--foreground)]"
                    >
                      {f.name}
                    </button>
                  ))}
              </div>
              <div className="mt-1 text-[10px] text-[var(--muted)]">
                Funciones: if, round, sum, min, max, abs · texto: concat, contains, upper, lower, trim, replace, split, test ·
                fecha: now, today, dateAdd, dateBetween, formatDate, year, month · listas: map, filter, join, unique, sort,
                first, length (con «current» e «index») · prop(&quot;Relación&quot;) da la lista de títulos enlazados
              </div>
              <button
                onClick={() => addFormula.mutate({ collectionId, name: fname || "Fórmula", expression: expr })}
                disabled={!expr.trim()}
                className="mt-2 w-full rounded bg-brand px-2 py-1 text-sm text-white disabled:opacity-40"
              >
                Crear fórmula
              </button>
            </div>
          )}

          {view === "relation" && (
            <>
              <button onClick={() => setView("root")} className="mb-1 flex items-center gap-1 px-2 py-1 text-left text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
                <ChevronLeft size={12} /> Vincular con…
              </button>
              {(databases ?? []).map((d) => (
                <div key={d.collectionId} className="flex items-center gap-1">
                  <button
                    onClick={() => addRelation.mutate({ collectionId, name: `→ ${d.title || "BD"}`, targetCollectionId: d.collectionId })}
                    className="flex min-w-0 flex-1 items-center gap-1 rounded px-2 py-1 text-left text-sm hover:bg-[var(--hover)]"
                    title="Relación solo en esta base de datos"
                  >
                    {d.icon ? <span>{d.icon}</span> : <Database size={14} className="shrink-0 text-[var(--muted)]" />}
                    <span className="truncate">{d.title || "Sin título"}</span>
                  </button>
                  <button
                    onClick={() => addRelation.mutate({ collectionId, name: `→ ${d.title || "BD"}`, targetCollectionId: d.collectionId, mirror: true })}
                    className="toque-estrecho shrink-0 rounded px-1.5 py-1 text-xs text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
                    title={`Bidireccional: crea también el campo espejo en «${d.title || "BD"}»`}
                  >
                    ↔
                  </button>
                </div>
              ))}
              {(databases ?? []).length === 0 && (
                <div className="px-2 py-1 text-xs text-[var(--muted)]">No hay otras bases de datos.</div>
              )}
            </>
          )}

          {view === "rollup" && !relField && (
            <>
              <button onClick={() => setView("root")} className="mb-1 flex items-center gap-1 px-2 py-1 text-left text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
                <ChevronLeft size={12} /> Rollup sobre la relación…
              </button>
              {relationFields.map((rf) => (
                <button
                  key={rf.id}
                  onClick={() => setRelField(rf)}
                  className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-[var(--hover)]"
                >
                  {rf.name}
                </button>
              ))}
            </>
          )}

          {view === "rollup" && relField && !agg && (
            <>
              <button onClick={() => setRelField(null)} className="mb-1 flex items-center gap-1 px-2 py-1 text-left text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
                <ChevronLeft size={12} /> Cómo agregar
              </button>
              {AGGS.map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => {
                    if (v === "count") {
                      addRollup.mutate({ collectionId, name: `${relField.name} · nº`, relationFieldId: relField.id, agg: "count" });
                    } else {
                      setAgg(v);
                    }
                  }}
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-[var(--hover)]"
                >
                  {l}
                </button>
              ))}
            </>
          )}

          {view === "rollup" && relField && agg && (
            <>
              <button onClick={() => setAgg(null)} className="mb-1 flex items-center gap-1 px-2 py-1 text-left text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
                <ChevronLeft size={12} /> Campo a agregar
              </button>
              {(targetOf(relField)?.fields ?? [])
                .filter((tf) => tf.type !== "rollup" && tf.type !== "relation")
                .map((tf) => (
                  <button
                    key={tf.id}
                    onClick={() =>
                      addRollup.mutate({
                        collectionId,
                        name: `${relField.name} · ${tf.name}`,
                        relationFieldId: relField.id,
                        targetFieldId: tf.id,
                        agg: agg as RollupAgg,
                      })
                    }
                    className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-[var(--hover)]"
                  >
                    {tf.name}
                  </button>
                ))}
              {(targetOf(relField)?.fields ?? []).length === 0 && (
                <div className="px-2 py-1 text-xs text-[var(--muted)]">La BD destino no tiene campos.</div>
              )}
            </>
          )}
        </Popover>
      )}
    </div>
  );
}
