"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { trpc } from "@/trpc/react";
import { pieInfo } from "@/lib/infoPagina";

/**
 * Al pie del menú ⋯, como en Notion: «Recuento de palabras», «Última edición por …» y
 * cuándo. Lo que Notion no enseña (caracteres, casillas, imágenes y adjuntos, creada)
 * va plegado en «Más información» para no ensuciar el pie (`app.info`, igual que la app).
 */
export function InfoPagina({ id, recordId }: { id: string; recordId?: string }) {
  const { data: i } = trpc.app.info.useQuery({ id, recordId }, { staleTime: 0 });
  const [mas, setMas] = useState(false);
  if (!i) return <div className="px-3 py-2 text-xs text-[var(--muted)]">…</div>;
  const { principal, extra } = pieInfo(i);
  return (
    <div className="px-3 py-2 text-xs leading-5 text-[var(--muted)]" aria-label="Información de la página">
      {principal.map((l) => (
        <div key={l}>{l}</div>
      ))}
      <button onClick={() => setMas((m) => !m)} aria-expanded={mas} className="-ml-1 mt-0.5 flex items-center gap-0.5 rounded px-1 hover:bg-[var(--hover)] hover:text-[var(--foreground)]">
        <ChevronRight size={12} className={`transition-transform ${mas ? "rotate-90" : ""}`} />
        Más información
      </button>
      {mas && (
        <div className="mt-0.5 pl-4">
          {extra.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
