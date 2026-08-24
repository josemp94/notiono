"use client";

import { useEffect, useRef, useState } from "react";

const COMMON = [
  "📄","📝","📌","✅","📆","💡","🔥","⭐","🎯","🚀","📊","📈","💰","🏦","🧾","🛒",
  "🏠","🍔","✈️","🎓","💼","🔧","🎨","🎵","📚","❤️","🧡","🌟","⚡","🌈","🐢","🧠",
];

export function PageIcon({
  icon,
  onChange,
  editable,
}: {
  icon: string | null;
  onChange: (icon: string | null) => void;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (!icon && !editable) return null;

  return (
    <div className="relative inline-block" ref={ref}>
      {icon ? (
        <button
          onClick={() => editable && setOpen((o) => !o)}
          className={`text-6xl leading-none ${editable ? "cursor-pointer rounded-lg p-1 hover:bg-[var(--hover)]" : "cursor-default"}`}
          title={editable ? "Cambiar icono" : undefined}
        >
          {icon}
        </button>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          // .al-pasar y no opacity-0 a pelo: en táctil no hay hover y el botón
          // quedaba invisible (aunque pulsable a ciegas).
          className="al-pasar rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
        >
          😀 Añadir icono
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-[var(--border)] bg-[var(--background)] p-2 shadow-xl">
          <div className="grid grid-cols-8 gap-0.5">
            {COMMON.map((e) => (
              <button
                key={e}
                onClick={() => {
                  onChange(e);
                  setOpen(false);
                }}
                className="rounded-md p-1 text-xl hover:bg-[var(--hover)]"
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-[var(--border)] pt-2">
            <input
              defaultValue={icon ?? ""}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  const v = (ev.target as HTMLInputElement).value.trim();
                  onChange(v || null);
                  setOpen(false);
                }
              }}
              placeholder="pega un emoji…"
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-brand"
            />
            {icon && (
              <button
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:text-red-500"
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
