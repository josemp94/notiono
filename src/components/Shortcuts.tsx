"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Keyboard, X } from "lucide-react";
import { SHORTCUTS_EVENT } from "@/lib/shortcuts";

/**
 * Todo lo que se puede hacer sin tocar el ratón, en un sitio.
 *
 * Se abre con «?» (o Ctrl+/) y desde el botón del pie del panel. Existe porque los
 * atajos estaban repartidos por títulos emergentes: se descubrían de casualidad, y
 * la mitad no se descubrían nunca.
 */
const GRUPOS: { titulo: string; items: { teclas: string[]; que: string }[] }[] = [
  {
    titulo: "Moverse",
    items: [
      { teclas: ["Ctrl", "K"], que: "Buscar páginas y contenido" },
      { teclas: ["Ctrl", "\\"], que: "Plegar o desplegar el panel lateral" },
      { teclas: ["Ctrl", "Mayús", "L"], que: "Cambiar entre modo claro y oscuro" },
      { teclas: ["?"], que: "Esta ventana" },
    ],
  },
  {
    titulo: "Crear",
    items: [
      { teclas: ["Ctrl", "Alt", "N"], que: "Nueva página" },
      { teclas: ["/"], que: "En el editor: insertar un bloque (llamada, columnas, tabla…)" },
      { teclas: ["@"], que: "En el editor: mencionar una página o a alguien" },
    ],
  },
  {
    titulo: "Con el ratón",
    items: [
      { teclas: ["Clic derecho"], que: "Sobre una pestaña de vista: sus opciones" },
      { teclas: ["Clic derecho"], que: "Sobre una página del panel: renombrar, duplicar, mover, borrar" },
      { teclas: ["Arrastrar"], que: "Páginas del panel y filas de una tabla, para reordenarlas" },
    ],
  },
  {
    titulo: "En el editor",
    items: [
      { teclas: ["Ctrl", "B"], que: "Negrita" },
      { teclas: ["Ctrl", "I"], que: "Cursiva" },
      { teclas: ["Ctrl", "Z"], que: "Deshacer" },
      { teclas: ["Tab"], que: "Anidar el bloque dentro del anterior" },
    ],
  },
];

/** Abre la ventana de atajos desde cualquier sitio. */
export function openShortcuts() {
  window.dispatchEvent(new Event(SHORTCUTS_EVENT));
}

export function Shortcuts() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const abrir = () => setOpen(true);
    window.addEventListener(SHORTCUTS_EVENT, abrir);
    return () => window.removeEventListener(SHORTCUTS_EVENT, abrir);
  }, []);

  useEffect(() => {
    if (!open) return;
    const cerrar = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <Keyboard size={16} className="text-[var(--muted)]" />
          <h2 className="font-display text-sm font-bold">Atajos</h2>
          <button
            onClick={() => setOpen(false)}
            className="ml-auto rounded-md p-1 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-x-8 gap-y-5 overflow-y-auto p-4 sm:grid-cols-2">
          {GRUPOS.map((g) => (
            <section key={g.titulo}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                {g.titulo}
              </h3>
              <ul className="space-y-1.5">
                {g.items.map((it, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 flex-1">{it.que}</span>
                    <span className="flex shrink-0 gap-1">
                      {it.teclas.map((t) => (
                        <kbd
                          key={t}
                          className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)]"
                        >
                          {t}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
