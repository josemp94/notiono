"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type Aviso = { id: number; mensaje: string; accion?: { etiqueta: string; onClick: () => void } };

let empujar: ((a: Omit<Aviso, "id">) => void) | null = null;

/**
 * Aviso flotante abajo, con acción opcional («Deshacer»). Necesita <ToastHost/>
 * montado (lo hace AppShell); sin host el aviso se pierde en silencio.
 */
export function toast(mensaje: string, accion?: { etiqueta: string; onClick: () => void }) {
  empujar?.({ mensaje, accion });
}

export function ToastHost() {
  const [items, setItems] = useState<Aviso[]>([]);

  useEffect(() => {
    let seq = 0;
    empujar = (a) => {
      const id = ++seq;
      // Como mucho 3 a la vez; el más viejo cede el sitio.
      setItems((xs) => [...xs.slice(-2), { ...a, id }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 6000);
    };
    return () => {
      empujar = null;
    };
  }, []);

  if (!items.length) return null;
  const quitar = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));

  return createPortal(
    <div className="fixed bottom-24 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2 md:bottom-4">
      {items.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-sm shadow-xl"
        >
          <span>{a.mensaje}</span>
          {a.accion && (
            <button
              onClick={() => {
                a.accion!.onClick();
                quitar(a.id);
              }}
              className="font-medium text-brand hover:underline"
            >
              {a.accion.etiqueta}
            </button>
          )}
          <button onClick={() => quitar(a.id)} className="toque-estrecho text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
