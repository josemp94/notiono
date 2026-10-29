"use client";

import { sombraColor } from "@/components/ColorPagina";
import { useState } from "react";
import { FileText } from "lucide-react";
import { trpc } from "@/trpc/react";
import { RichText } from "@/lib/mdInline";
import { RecordPanel } from "./RecordPanel";
import { Casilla, useMarcarCasilla } from "./Casilla";
import { usePeople } from "./Cell";
import { displayValue, groupBy, OPTION_COLORS, optionsOf, type FieldLite } from "@/lib/cellText";

type Rec = { id: string; cells: Record<string, unknown>; order: string; color?: string | null };

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
  // Hasta 3 propiedades de texto a la derecha (no caben más), y las casillas siempre, en su
  // orden: son un control que se marca ahí mismo.
  const propFields = fields
    .filter((f) => f.id !== titleField?.id)
    .filter((f, i, todas) => f.type === "checkbox" || todas.slice(0, i).filter((x) => x.type !== "checkbox").length < 3);

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
        {g.records.map((r) => (
          // Como en Notion: las propiedades a la derecha del título, en su orden, y una
          // casilla entre ellas se marca ahí mismo (sin abrir la ficha ni tachar nada).
          // El color de la fila como página: una barrita en el borde, sin mover el título.
          <li key={r.id} className="flex items-center hover:bg-[var(--border)]/30" style={sombraColor(r.color)}>
            <button onClick={() => abrir(r)} className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-3 text-left">
              <FileText size={14} className="shrink-0 text-[var(--muted)]" />
              <span className="min-w-0 flex-1 truncate font-medium"><RichText texto={recTitle(r)} /></span>
            </button>
            <span onClick={() => abrir(r)} className="flex shrink-0 cursor-pointer items-center gap-3 self-stretch pl-3 pr-3 text-xs text-[var(--muted)]">
              {propFields.map((f) => {
                if (f.type === "checkbox")
                  return (
                    <Casilla
                      key={f.id}
                      marcada={Boolean(r.cells?.[f.id])}
                      nombre={f.name}
                      onCambia={canEdit ? (v) => marcar(r.id, f.id, v) : undefined}
                    />
                  );
                // Selección, Estado y Selección múltiple, con sus pastillas de color, como Notion.
                if (["select", "status", "multiselect"].includes(f.type)) {
                  const v = r.cells?.[f.id];
                  const ids = (Array.isArray(v) ? v : v ? [v] : []).map(String);
                  const ops = optionsOf(f).filter((o) => ids.includes(o.id));
                  if (!ops.length) return null;
                  return (
                    <span key={f.id} className="hidden max-w-60 items-center gap-1 overflow-hidden sm:flex">
                      {ops.map((o) => (
                        <span key={o.id} className="truncate rounded px-1.5 py-0.5" style={{ background: OPTION_COLORS[o.color ?? "gray"], color: "var(--tag-fg)" }}>
                          {o.label}
                        </span>
                      ))}
                    </span>
                  );
                }
                const txt = displayValue(f, r.cells?.[f.id], people);
                if (!txt) return null;
                return (
                  <span key={f.id} className="hidden max-w-40 truncate sm:inline">
                    {txt}
                  </span>
                );
              })}
            </span>
          </li>
        ))}
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
