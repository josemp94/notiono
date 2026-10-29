"use client";

import { Check } from "lucide-react";
import { trpc } from "@/trpc/react";

/** Marca o desmarca una casilla al momento (se pinta ya y luego manda el servidor). */
export function useMarcarCasilla(pageId: string) {
  const utils = trpc.useUtils();
  const m = trpc.db.updateCell.useMutation({ onSettled: () => utils.db.get.invalidate({ pageId }) });
  return (recordId: string, fieldId: string, valor: boolean) => {
    void utils.db.get.cancel({ pageId });
    utils.db.get.setData({ pageId }, (d) =>
      d && {
        ...d,
        records: d.records.map((r) =>
          r.id === recordId ? { ...r, cells: { ...(r.cells as Record<string, boolean>), [fieldId]: valor } } : r,
        ),
      },
    );
    m.mutate({ recordId, fieldId, value: valor });
  };
}

/**
 * Una casilla de verdad en listas y tarjetas: pulsarla la cambia sin abrir la
 * ficha. Sin `onCambia` (solo lectura) se ve pero no se toca.
 */
export function Casilla({
  marcada,
  nombre,
  conNombre = false,
  onCambia,
}: {
  marcada: boolean;
  nombre: string;
  conNombre?: boolean;
  onCambia?: (v: boolean) => void;
}) {
  const caja = (
    <span
      className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] ${
        marcada ? "border-brand bg-brand text-white" : "border-[var(--muted)]"
      }`}
    >
      {marcada && <Check size={12} strokeWidth={3.5} />}
    </span>
  );
  const texto = conNombre && nombre.trim() && <span className="truncate text-xs text-[var(--muted)]">{nombre}</span>;
  if (!onCambia)
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5" title={nombre}>
        {caja}
        {texto}
      </span>
    );
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcada}
      aria-label={nombre || "Casilla"}
      title={nombre}
      // Ni abre la ficha ni empieza a arrastrar la tarjeta.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onCambia(!marcada);
      }}
      className="toque inline-flex shrink-0 items-center justify-center gap-1.5 rounded hover:bg-[var(--hover)]"
    >
      {caja}
      {texto}
    </button>
  );
}
