"use client";

import { Check } from "lucide-react";
import { COLORES_PAGINA, colorPagina, type ColorPagina } from "@/lib/colorPagina";

/**
 * «Color de página» dentro de ⋯ → Apariencia y diseño: la lista de colores con su
 * muestra, como los menús de color de Notion (cuadradito + nombre + marca).
 */
export function SelectorColorPagina({ valor, onElegir }: { valor: string | null | undefined; onElegir: (c: ColorPagina) => void }) {
  const actual = colorPagina(valor) ?? "default";
  return (
    <div role="radiogroup" aria-label="Color de página">
      <div className="px-3 pb-1 pt-1.5 text-xs text-[var(--muted)]">Color de página</div>
      {COLORES_PAGINA.map((c) => (
        <button
          key={c.id}
          role="radio"
          aria-checked={actual === c.id}
          onClick={() => onElegir(c.id)}
          className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-[var(--hover)]"
        >
          <span
            className="size-5 shrink-0 rounded border border-[var(--border)]"
            style={{ background: c.id === "default" ? "var(--background)" : `var(--pag-${c.id})` }}
          />
          {c.nombre}
          {actual === c.id && <Check size={14} className="ml-auto text-brand" />}
        </button>
      ))}
    </div>
  );
}

/** La barrita del color de página donde se lista (nada si no tiene color). */
export function BarraColor({ color, className = "" }: { color: string | null | undefined; className?: string }) {
  const c = colorPagina(color);
  return c ? <span aria-hidden className={`barra-color ${className}`} data-barra={c} /> : null;
}

/** La misma barrita como sombra interior (para una celda de tabla, que no admite hijos sueltos). */
export function sombraColor(color: string | null | undefined): { boxShadow?: string } {
  const c = colorPagina(color);
  return c ? { boxShadow: `inset 3px 0 0 var(--ico-${c})` } : {};
}
