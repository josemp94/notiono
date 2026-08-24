"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/trpc/react";
import { RichText } from "@/lib/mdInline";
import { RecordPanel } from "./RecordPanel";
import { dayOf, endDayOf, shiftDateValue, stretchDateValue } from "@/lib/cellText";
import type { FieldLite } from "@/lib/cellText";

type Rec = { id: string; cells: Record<string, unknown>; order: string };

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Zoom: cuántos meses se ven y cuánto mide un día. */
const ZOOMS: Record<string, { meses: number; diaW: number; label: string }> = {
  mes: { meses: 1, diaW: 34, label: "Mes" },
  trimestre: { meses: 3, diaW: 12, label: "Trimestre" },
  año: { meses: 12, diaW: 4, label: "Año" },
};

function parseDay(day: string | null): Date | null {
  if (!day) return null;
  const d = new Date(`${day}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

const díasEntre = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 864e5);

export function TimelineView({
  pageId,
  collectionId,
  fields,
  records,
  view,
  openIn = "side",
  openFull,
}: {
  pageId: string;
  collectionId: string;
  fields: FieldLite[];
  records: Rec[];
  view: { id: string; config: unknown };
  /** Cómo abrir la ficha (lateral/centrado/página completa). */
  openIn?: "side" | "center" | "full";
  openFull?: (recId: string) => void;
}) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.db.get.invalidate({ pageId });
  const updateView = trpc.db.updateView.useMutation({ onSuccess: invalidate });
  const updateCell = trpc.db.updateCell.useMutation({ onSuccess: invalidate });

  const dateFields = fields.filter((f) => f.type === "date");
  const cfg = (view.config ?? {}) as { dateFieldId?: string; endFieldId?: string; zoom?: string };
  const startFieldId = cfg.dateFieldId ?? dateFields[0]?.id ?? null;
  const endFieldId = cfg.endFieldId ?? null;
  const titleField = fields.find((f) => f.type === "text") ?? fields[0];
  const zoom = ZOOMS[cfg.zoom ?? "mes"] ?? ZOOMS.mes;
  const DAY_W = zoom.diaW;

  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [openRec, setOpenRec] = useState<Rec | null>(null);
  // Arrastre de barras: mover (toda la barra) o redimensionar (tirador derecho).
  const [drag, setDrag] = useState<{ recId: string; mode: "move" | "resize"; x0: number; dx: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  // Ventana visible: desde el 1 del mes del cursor, tantos meses como diga el zoom.
  const winStart = new Date(cursor.y, cursor.m, 1);
  const winEnd = new Date(cursor.y, cursor.m + zoom.meses, 0);
  const totalDays = díasEntre(winStart, winEnd) + 1;
  const gridW = totalDays * DAY_W;

  const bars = useMemo(() => {
    if (!startFieldId) return [];
    const out: { rec: Rec; off: number; span: number }[] = [];
    for (const r of records) {
      const cell = r.cells?.[startFieldId];
      const s = parseDay(dayOf(cell));
      if (!s) continue;
      const e = (endFieldId ? parseDay(dayOf(r.cells?.[endFieldId])) : parseDay(endDayOf(cell))) ?? s;
      if (e < winStart || s > winEnd) continue;
      const clampS = s < winStart ? winStart : s;
      const clampE = e > winEnd ? winEnd : e;
      const off = díasEntre(winStart, clampS);
      out.push({ rec: r, off, span: Math.max(1, díasEntre(clampS, clampE) + 1) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, startFieldId, endFieldId, cursor.y, cursor.m, zoom.meses]);

  // El arrastre se sigue en window, como el ancho de columna de la Tabla.
  useEffect(() => {
    if (!drag) return;
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (d) setDrag({ ...d, dx: e.clientX - d.x0 });
    };
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d || !startFieldId) return;
      const dias = Math.round(d.dx / DAY_W);
      const rec = records.find((r) => r.id === d.recId);
      if (!rec) return;
      // Sin desplazamiento real: era un clic → abrir la ficha.
      if (!dias && Math.abs(d.dx) < 5) {
        if (d.mode === "move") (openIn === "full" ? openFull?.(rec.id) : setOpenRec(rec));
        return;
      }
      if (!dias) return;
      if (d.mode === "move") {
        updateCell.mutate({ recordId: rec.id, fieldId: startFieldId, value: shiftDateValue(rec.cells?.[startFieldId], dias) });
        // Con campo de fin aparte, el fin viaja junto para conservar la duración.
        if (endFieldId && rec.cells?.[endFieldId])
          updateCell.mutate({ recordId: rec.id, fieldId: endFieldId, value: shiftDateValue(rec.cells?.[endFieldId], dias) });
      } else if (endFieldId) {
        // Redimensionar con fin aparte: se mueve solo el campo de fin.
        const base = rec.cells?.[endFieldId] ?? rec.cells?.[startFieldId];
        updateCell.mutate({ recordId: rec.id, fieldId: endFieldId, value: shiftDateValue(base, dias) });
      } else {
        updateCell.mutate({ recordId: rec.id, fieldId: startFieldId, value: stretchDateValue(rec.cells?.[startFieldId], dias) });
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag, DAY_W, startFieldId, endFieldId, records]);

  if (!startFieldId) {
    return (
      <div className="py-10 text-[var(--muted)]">
        Esta base de datos no tiene ningún campo de fecha. Añade uno para usar el cronograma.
      </div>
    );
  }

  const recTitle = (r: Rec) => {
    const t = titleField ? r.cells?.[titleField.id] : "";
    return (typeof t === "string" && t) || "Sin título";
  };
  const prev = () => setCursor((c) => {
    const d = new Date(c.y, c.m - zoom.meses, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const next = () => setCursor((c) => {
    const d = new Date(c.y, c.m + zoom.meses, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const goToday = () => setCursor({ y: today.getFullYear(), m: today.getMonth() });

  const hoyOff = today >= winStart && today <= winEnd ? díasEntre(winStart, new Date(today.getFullYear(), today.getMonth(), today.getDate())) : null;
  const titulo =
    zoom.meses === 1
      ? `${MONTHS[cursor.m]} ${cursor.y}`
      : `${MONTHS[winStart.getMonth()]} ${winStart.getFullYear()} – ${MONTHS[winEnd.getMonth()]} ${winEnd.getFullYear()}`;

  // Cabecera: días numerados con zoom de mes; bandas de mes en trimestre/año.
  const mesesVentana = Array.from({ length: zoom.meses }, (_, i) => {
    const d = new Date(cursor.y, cursor.m + i, 1);
    return { label: `${MONTHS[d.getMonth()]}${zoom.meses > 3 ? ` ${String(d.getFullYear()).slice(2)}` : ""}`, dias: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() };
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={prev} className="rounded px-2 py-1 hover:bg-[var(--border)]/30" aria-label="Anterior"><ChevronLeft size={16} /></button>
        <span className="font-display min-w-[9rem] text-center text-lg font-bold">{titulo}</span>
        <button onClick={next} className="rounded px-2 py-1 hover:bg-[var(--border)]/30" aria-label="Siguiente"><ChevronRight size={16} /></button>
        <button onClick={goToday} className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--border)]/30">Hoy</button>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={cfg.zoom ?? "mes"}
            onChange={(e) => updateView.mutate({ id: view.id, config: { ...cfg, zoom: e.target.value } })}
            className="rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs outline-none"
            title="Zoom"
          >
            {Object.entries(ZOOMS).map(([v, z]) => <option key={v} value={v}>{z.label}</option>)}
          </select>
          {dateFields.length > 1 && (
            <select
              value={startFieldId}
              onChange={(e) => updateView.mutate({ id: view.id, config: { ...cfg, dateFieldId: e.target.value } })}
              className="rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs outline-none"
            >
              {dateFields.map((f) => <option key={f.id} value={f.id}>Inicio: {f.name}</option>)}
            </select>
          )}
          {dateFields.length > 1 && (
            <select
              value={endFieldId ?? ""}
              onChange={(e) => updateView.mutate({ id: view.id, config: { ...cfg, endFieldId: e.target.value || undefined } })}
              className="rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs outline-none"
            >
              <option value="">Fin: (1 día)</option>
              {dateFields.filter((f) => f.id !== startFieldId).map((f) => <option key={f.id} value={f.id}>Fin: {f.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <div style={{ width: 180 + gridW }}>
          {/* Cabecera. La columna de títulos va sticky: es la «tabla lateral» que
              se queda quieta mientras el gantt se desplaza en horizontal. */}
          <div className="flex border-b border-[var(--border)] bg-[var(--background)]">
            <div className="sticky left-0 z-20 w-[180px] shrink-0 border-r border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs font-medium text-[var(--muted)]">Registro</div>
            {zoom.meses === 1 ? (
              <div className="flex">
                {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
                  <div
                    key={d}
                    className={`shrink-0 border-l border-[var(--border)] py-1.5 text-center text-[10px] ${
                      hoyOff === d - 1 ? "font-bold text-brand" : "text-[var(--muted)]"
                    }`}
                    style={{ width: DAY_W }}
                  >
                    {d}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex">
                {mesesVentana.map((m, i) => (
                  <div
                    key={i}
                    className="shrink-0 truncate border-l border-[var(--border)] py-1.5 pl-2 text-[10px] text-[var(--muted)]"
                    style={{ width: m.dias * DAY_W }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Filas */}
          {bars.length === 0 && (
            <div className="px-3 py-6 text-sm text-[var(--muted)]">Sin registros con fecha en este periodo.</div>
          )}
          {bars.map(({ rec, off, span }) => {
            const esta = drag?.recId === rec.id;
            const dx = esta ? drag!.dx : 0;
            return (
              <div key={rec.id} className="flex items-center border-b border-[var(--border)] last:border-0 hover:bg-[var(--border)]/15">
                <button
                  onClick={() => (openIn === "full" ? openFull?.(rec.id) : setOpenRec(rec))}
                  className="sticky left-0 z-10 w-[180px] shrink-0 self-stretch truncate border-r border-[var(--border)] bg-[var(--background)] px-2 py-2 text-left text-sm hover:text-brand"
                  title={recTitle(rec)}
                >
                  <RichText texto={recTitle(rec)} />
                </button>
                <div className="relative py-2" style={{ width: gridW }}>
                  {hoyOff !== null && (
                    <div className="pointer-events-none absolute inset-y-0 border-l border-brand/50" style={{ left: hoyOff * DAY_W }} />
                  )}
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDrag({ recId: rec.id, mode: "move", x0: e.clientX, dx: 0 });
                    }}
                    className={`absolute top-1/2 h-5 -translate-y-1/2 cursor-grab truncate rounded bg-brand/85 px-2 text-left text-[11px] leading-5 text-white hover:bg-brand active:cursor-grabbing ${
                      esta ? "opacity-80" : ""
                    }`}
                    style={{
                      left: off * DAY_W + 2 + (esta && drag!.mode === "move" ? dx : 0),
                      width: Math.max(DAY_W - 4, span * DAY_W - 4 + (esta && drag!.mode === "resize" ? dx : 0)),
                    }}
                    title={`${recTitle(rec)} — arrastra para mover; el borde derecho, para cambiar la duración`}
                  >
                    <RichText texto={recTitle(rec)} />
                    {/* Tirador de redimensionar (solo ratón, como el ancho de columna) */}
                    <span
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setDrag({ recId: rec.id, mode: "resize", x0: e.clientX, dx: 0 });
                      }}
                      className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r bg-white/25"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Registros sin fecha: como en Notion, se listan aparte para poder planificarlos. */}
      {(() => {
        const sinFecha = records.filter((r) => !dayOf(r.cells?.[startFieldId]));
        if (!sinFecha.length) return null;
        const hoyYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        return (
          <div className="mt-3 rounded-lg border border-dashed border-[var(--border)] p-2">
            <div className="mb-1 px-1 text-xs font-medium text-[var(--muted)]">
              Sin fecha ({sinFecha.length})
            </div>
            {sinFecha.map((r) => (
              <div key={r.id} className="group/sf flex items-center gap-2 rounded px-1 py-0.5 hover:bg-[var(--hover)]">
                <button
                  onClick={() => (openIn === "full" ? openFull?.(r.id) : setOpenRec(r))}
                  className="min-w-0 flex-1 truncate text-left text-sm"
                >
                  <RichText texto={recTitle(r)} />
                </button>
                <button
                  onClick={() => updateCell.mutate({ recordId: r.id, fieldId: startFieldId, value: hoyYmd })}
                  className="al-pasar toque-estrecho shrink-0 text-xs text-brand hover:underline"
                  title="Ponerle fecha de hoy para verlo en el cronograma"
                >
                  Planificar hoy
                </button>
              </div>
            ))}
          </div>
        );
      })()}

      {openRec && (
        <RecordPanel
          pageId={pageId}
          record={openRec}
          fields={fields}
          onClose={() => setOpenRec(null)}
          mode={openIn === "center" ? "center" : "side"}
          onExpand={openFull ? () => openFull(openRec.id) : undefined}
        />
      )}
    </div>
  );
}
