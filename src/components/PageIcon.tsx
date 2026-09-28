"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, SmilePlus } from "lucide-react";

const COMMON = [
  "📄","📝","📌","✅","📆","💡","🔥","⭐","🎯","🚀","📊","📈","💰","🏦","🧾","🛒",
  "🏠","🍔","✈️","🎓","💼","🔧","🎨","🎵","📚","❤️","🧡","🌟","⚡","🌈","🐢","🧠",
];

/** ¿El icono es una imagen subida (URL) en vez de un emoji? */
export const esIconoImagen = (icon?: string | null): boolean =>
  !!icon && (icon.startsWith("/") || /^https?:\/\//i.test(icon));

/** El icono para contextos de SOLO texto (notificaciones…): el emoji seguido de
 *  espacio, o nada si es una imagen (su URL como texto no pinta nada). */
export const emojiIcono = (icon?: string | null): string =>
  icon && !esIconoImagen(icon) ? `${icon} ` : "";

/**
 * Icono de página en cualquier lista (árbol, migas, buscador…): el emoji tal
 * cual, o la imagen subida a su tamaño. `fallback` para cuando no hay icono.
 */
export function IconoPagina({
  icon,
  size = 16,
  fallback = null,
}: {
  icon?: string | null;
  size?: number;
  fallback?: React.ReactNode;
}) {
  if (!icon) return <>{fallback}</>;
  if (esIconoImagen(icon)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt=""
        style={{ width: size, height: size }}
        className="inline-block shrink-0 rounded-sm object-cover align-[-2px]"
      />
    );
  }
  return <>{icon}</>;
}

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
  const [subiendo, setSubiendo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // Subir una imagen como icono, como en Notion (va a /api/upload; el icono
  // guarda la URL del Asset — un string, igual que el emoji).
  const subir = async (picked: FileList | null) => {
    const file = picked?.[0];
    if (!file) return;
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data?.url) {
        onChange(data.url);
        setOpen(false);
      }
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!icon && !editable) return null;

  return (
    <div className="relative inline-block" ref={ref}>
      {icon ? (
        <button
          onClick={() => editable && setOpen((o) => !o)}
          className={`leading-none ${esIconoImagen(icon) ? "" : "text-6xl"} ${editable ? "cursor-pointer rounded-lg p-1 hover:bg-[var(--hover)]" : "cursor-default"}`}
          title={editable ? "Cambiar icono" : undefined}
        >
          {esIconoImagen(icon) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icon} alt="" className="size-16 rounded-lg object-cover" />
          ) : (
            icon
          )}
        </button>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          // .al-pasar y no opacity-0 a pelo: en táctil no hay hover y el botón
          // quedaba invisible (aunque pulsable a ciegas).
          className="al-pasar flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
        >
          <SmilePlus size={16} /> Añadir icono
        </button>
      )}

      {open && (
        <div data-menu="" className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-[var(--border)] bg-[var(--background)] p-2 shadow-xl">
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
              defaultValue={esIconoImagen(icon) ? "" : (icon ?? "")}
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
          <button
            onClick={() => fileRef.current?.click()}
            disabled={subiendo}
            className="mt-1.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] disabled:opacity-60"
          >
            <ImagePlus size={15} /> {subiendo ? "Subiendo…" : "Subir una imagen"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => subir(e.target.files)} />
        </div>
      )}
    </div>
  );
}
