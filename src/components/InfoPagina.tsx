"use client";

import { trpc } from "@/trpc/react";

const fecha = (d: Date | string) =>
  new Date(d).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const n = (x: number, uno: string, varios: string) => `${x.toLocaleString("es-ES")} ${x === 1 ? uno : varios}`;

/**
 * Al pie del menú ⋯ (como el recuento de Notion): palabras y caracteres, casillas hechas,
 * imágenes y adjuntos, y cuándo se creó y se editó (`app.info`, lo mismo que en la app).
 */
export function InfoPagina({ id, recordId }: { id: string; recordId?: string }) {
  const { data: i } = trpc.app.info.useQuery({ id, recordId }, { staleTime: 0 });
  if (!i) return <div className="px-3 py-2 text-xs text-[var(--muted)]">…</div>;
  const lineas = [
    `${n(i.palabras, "palabra", "palabras")} · ${n(i.caracteres, "carácter", "caracteres")}`,
    i.casillas ? `Casillas: ${i.hechas} de ${i.casillas} hechas` : null,
    i.imagenes || i.adjuntos ? [i.imagenes ? n(i.imagenes, "imagen", "imágenes") : null, i.adjuntos ? n(i.adjuntos, "adjunto", "adjuntos") : null].filter(Boolean).join(" · ") : null,
    `Creada el ${fecha(i.creada)}${i.creadaPor ? ` por ${i.creadaPor}` : ""}`,
    `Editada el ${fecha(i.editada)}${i.editadaPor ? ` por ${i.editadaPor}` : ""}`,
  ].filter(Boolean);
  return (
    <div className="space-y-0.5 px-3 py-2 text-xs text-[var(--muted)]" aria-label="Información de la página">
      {lineas.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}
