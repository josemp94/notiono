"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { trpc } from "@/trpc/react";
import { RichText } from "@/lib/mdInline";
import { RecordPanel } from "./RecordPanel";
import { Casilla, useMarcarCasilla } from "./Casilla";
import { usePeople } from "./Cell";
import { displayValue, groupBy, type FieldLite } from "@/lib/cellText";

type Rec = { id: string; cells: Record<string, unknown>; order: string };

export function ListView({
  pageId,
  collectionId,
  fields,
  records,
  groupByFieldId,
  openIn = "side",
  openFull,
  canEdit = true,
}: {
  pageId: string;
  collectionId: string;
  fields: FieldLite[];
  records: Rec[];
  groupByFieldId?: string;
  /** Cómo abrir la ficha (lateral/centrado/página completa). */
  openIn?: "side" | "center" | "full";
  openFull?: (recId: string) => void;
  canEdit?: boolean;
}) {
  const utils = trpc.useUtils();
  const addRecord = trpc.db.addRecord.useMutation({ onSuccess: () => utils.db.get.invalidate({ pageId }) });
  const [openRec, setOpenRec] = useState<Rec | null>(null);
  const abrir = (r: Rec) => (openIn === "full" ? openFull?.(r.id) : setOpenRec(r));
  const people = usePeople();
  const marcar = useMarcarCasilla(pageId);

  const titleField = fields.find((f) => f.type === "text") ?? fields[0];
  // La primera casilla visible va delante del título, como en las apps de tareas.
  const hecha = fields.find((f) => f.type === "checkbox" && f.id !== titleField?.id);
  const propFields = fields.filter((f) => f.id !== titleField?.id && f.id !== hecha?.id).slice(0, 3);
  const casilla = (r: Rec, f: FieldLite, conNombre = false) => (
    <Casilla
      key={f.id}
      marcada={Boolean(r.cells?.[f.id])}
      nombre={f.name}
      conNombre={conNombre}
      onCambia={canEdit ? (v) => marcar(r.id, f.id, v) : undefined}
    />
  );

  const recTitle = (r: Rec) => {
    const t = titleField ? r.cells?.[titleField.id] : "";
    return (typeof t === "string" && t) || "Sin título";
  };

  const groupField = fields.find((f) => f.id === groupByFieldId);
  const groups = groupField
    ? groupBy(records, groupField, people)
    : [{ key: "", label: "", records }];

  return (
    <div className="space-y-4">
      {groups.map((g) => (
      <div key={g.key}>
      {groupField && (
        <div className="mb-1 flex items-center gap-2 text-sm font-medium">
          {g.label}
          <span className="text-xs font-normal text-[var(--muted)]">{g.records.length}</span>
        </div>
      )}
      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {g.records.map((r) => {
          const marcada = Boolean(hecha && r.cells?.[hecha.id]);
          return (
          <li key={r.id} className="flex items-center hover:bg-[var(--border)]/30">
            {hecha && <span className="flex shrink-0 pl-2">{casilla(r, hecha)}</span>}
            <button
              onClick={() => abrir(r)}
              className={`flex min-w-0 flex-1 items-center gap-3 py-2 text-left ${hecha ? "pl-2 pr-3" : "px-3"}`}
            >
              {!hecha && <FileText size={14} className="shrink-0 text-[var(--muted)]" />}
              <span className={`min-w-0 flex-1 truncate font-medium ${marcada ? "text-[var(--muted)] line-through" : ""}`}>
                <RichText texto={recTitle(r)} />
              </span>
              <span className="hidden shrink-0 items-center gap-3 text-xs text-[var(--muted)] sm:flex">
                {propFields.map((f) => {
                  if (f.type === "checkbox") return null;
                  const txt = displayValue(f, r.cells?.[f.id], people);
                  if (!txt) return null;
                  return (
                    <span key={f.id} className="truncate">
                      {txt}
                    </span>
                  );
                })}
              </span>
            </button>
            {propFields.some((f) => f.type === "checkbox") && (
              <span className="flex shrink-0 items-center gap-2 pr-3">
                {propFields.filter((f) => f.type === "checkbox").map((f) => casilla(r, f, true))}
              </span>
            )}
          </li>
          );
        })}
        {g.records.length === 0 && (
          <li className="px-3 py-4 text-sm text-[var(--muted)]">Sin registros.</li>
        )}
      </ul>
      </div>
      ))}

      <button
        onClick={() => addRecord.mutate({ collectionId })}
        className="mt-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        + Nueva fila
      </button>

      {openRec &&
        (() => {
          // Refrescado desde records: el snapshot del clic se queda obsoleto tras
          // cada edición y las celdas multivalor partirían de la base vieja.
          const fresh = records.find((r) => r.id === openRec.id) ?? openRec;
          return (
            <RecordPanel
              key={fresh.id}
              pageId={pageId}
              collectionId={collectionId}
              record={fresh}
              fields={fields}
              onClose={() => setOpenRec(null)}
              mode={openIn === "center" ? "center" : "side"}
              onExpand={openFull ? () => openFull(fresh.id) : undefined}
            />
          );
        })()}
    </div>
  );
}
