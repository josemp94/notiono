"use client";

import { useState } from "react";
import { DialogoEspacio } from "@/components/Espacios";

/**
 * «Exportar», como el de Notion (⋯ → Exportar): un diálogo con «Formato de exportación»
 * (PDF, HTML, Markdown y CSV) y sus opciones, más Word (.docx), que Notion no tiene y aquí
 * es un formato más de la misma lista. Quien lo abre pone qué hace cada formato.
 */
export type FormatoExport = "pdf" | "html" | "markdown" | "word";

const NOMBRES: Record<FormatoExport, string> = {
  pdf: "PDF",
  html: "HTML",
  markdown: "Markdown y CSV",
  word: "Word (.docx)",
};

/** Los tamaños de papel del «Formato de página» (valor de `@page size`). */
const PAPEL: [string, string][] = [
  ["A4", "A4"],
  ["letter", "Carta"],
  ["legal", "Legal"],
  ["A3", "A3"],
  ["A5", "A5"],
];

export type OpcionesExport = { formato: FormatoExport; subpaginas: boolean; papel: string; escala: number };

export function DialogoExportar({
  formatos,
  conSubpaginas = false,
  onExportar,
  onClose,
}: {
  formatos: FormatoExport[];
  /** Ofrecer «Incluir subpáginas» (Markdown y CSV: un .zip con todo lo que cuelga). */
  conSubpaginas?: boolean;
  onExportar: (o: OpcionesExport) => Promise<void> | void;
  onClose: () => void;
}) {
  const [o, setO] = useState<OpcionesExport>({ formato: formatos[0], subpaginas: false, papel: "A4", escala: 100 });
  const [ocupado, setOcupado] = useState(false);
  const pon = (p: Partial<OpcionesExport>) => setO((x) => ({ ...x, ...p }));
  const fila = "flex items-center justify-between gap-3 py-1.5 text-sm";
  const control = "rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm";
  return (
    <DialogoEspacio titulo="Exportar" onClose={onClose}>
      <div className="divide-y divide-[var(--border)]">
        <label className={fila}>
          Formato de exportación
          <select value={o.formato} onChange={(e) => pon({ formato: e.target.value as FormatoExport })} className={control}>
            {formatos.map((f) => (
              <option key={f} value={f}>
                {NOMBRES[f]}
              </option>
            ))}
          </select>
        </label>
        {o.formato === "pdf" && (
          <>
            <label className={fila}>
              Formato de página
              <select value={o.papel} onChange={(e) => pon({ papel: e.target.value })} className={control}>
                {PAPEL.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className={fila}>
              Porcentaje de escala
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={10}
                  max={200}
                  value={o.escala}
                  onChange={(e) => pon({ escala: Math.min(200, Math.max(10, Number(e.target.value) || 100)) })}
                  className={`${control} w-20 text-right`}
                />
                %
              </span>
            </label>
          </>
        )}
        {o.formato === "markdown" && conSubpaginas && (
          <label className={fila}>
            Incluir subpáginas
            <input type="checkbox" checked={o.subpaginas} onChange={(e) => pon({ subpaginas: e.target.checked })} className="size-4 accent-[var(--color-brand)]" />
          </label>
        )}
      </div>
      {o.formato === "pdf" && (
        <p className="mt-2 text-xs text-[var(--muted)]">Se abre el diálogo de imprimir: elige «Guardar como PDF».</p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="toque-estrecho rounded-md px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--hover)]">
          Cancelar
        </button>
        <button
          disabled={ocupado}
          onClick={async () => {
            setOcupado(true);
            try {
              await onExportar(o);
              onClose();
            } finally {
              setOcupado(false);
            }
          }}
          className="toque-estrecho rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {ocupado ? "Exportando…" : "Exportar"}
        </button>
      </div>
    </DialogoEspacio>
  );
}
