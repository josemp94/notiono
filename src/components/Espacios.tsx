"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { trpc } from "@/trpc/react";
import { IconoPagina, SelectorIcono } from "@/components/PageIcon";

/** El icono del espacio (el que se elige, como el de una página) o el cuadradito con su inicial. */
export function IconoEspacio({ nombre, icon, size = 20 }: { nombre: string; icon?: string | null; size?: number }) {
  const inicial = (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
      className="flex shrink-0 items-center justify-center rounded bg-[var(--active)] font-semibold text-[var(--foreground)]"
    >
      {nombre.trim().charAt(0).toUpperCase() || "·"}
    </span>
  );
  if (!icon) return inicial;
  return (
    <span style={{ width: size, height: size, fontSize: Math.round(size * 0.8) }} className="flex shrink-0 items-center justify-center leading-none">
      <IconoPagina icon={icon} size={size} fallback={inicial} />
    </span>
  );
}

/** Botón con el icono que abre el selector de iconos de las páginas (emoji, dibujo o imagen). */
export function ElegirIconoEspacio({
  nombre,
  icon,
  onChange,
  disabled = false,
}: {
  nombre: string;
  icon: string | null;
  onChange: (icon: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("touchstart", h);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title={disabled ? undefined : "Cambiar icono"}
        className="toque flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] hover:bg-[var(--hover)] disabled:cursor-default disabled:hover:bg-transparent"
      >
        <IconoEspacio nombre={nombre || "?"} icon={icon} size={24} />
      </button>
      {open && (
        <SelectorIcono
          icon={icon}
          elegir={(v, seguir) => {
            onChange(v);
            if (!seguir) setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Marco de los diálogos de espacio: fondo oscuro, tarjeta y cierre con Escape. */
export function DialogoEspacio({ titulo, onClose, children }: { titulo: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">{titulo}</h2>
          <button onClick={onClose} className="toque text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** «Nuevo espacio»: nombre e icono; al crearlo se pasa a él (el servidor fija la cookie). */
export function NuevoEspacio({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const create = trpc.workspace.create.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
  });
  const crear = () => name.trim() && !create.isPending && create.mutate({ name, icon });
  return (
    <DialogoEspacio titulo={<><Plus size={18} /> Nuevo espacio</>} onClose={onClose}>
      <p className="mb-4 text-xs text-[var(--muted)]">
        Un espacio aparte, con sus páginas y sus personas. Lo puedes compartir luego con quien quieras.
      </p>
      <div className="flex items-center gap-2">
        <ElegirIconoEspacio nombre={name} icon={icon} onChange={setIcon} />
        <input
          autoFocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && crear()}
          placeholder="Nombre del espacio (p. ej. Casa)"
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </div>
      {create.error && <p className="mt-2 text-xs text-red-500">{create.error.message}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="toque-estrecho rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--hover)]">
          Cancelar
        </button>
        <button
          onClick={crear}
          disabled={!name.trim() || create.isPending}
          className="toque-estrecho rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Crear espacio
        </button>
      </div>
    </DialogoEspacio>
  );
}

/** Ajustes → Espacio: nombre e icono (el dueño) y lo que se puede hacer con el espacio. */
export function AjustesEspacio() {
  const { data: me } = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const ws = me?.workspace;
  const esDueno = me?.wsRole === "owner";
  const [name, setName] = useState("");
  // Sembrar una sola vez por espacio: re-sembrar en cada refetch machacaba lo tecleado.
  const sembrado = useRef<string | null>(null);
  useEffect(() => {
    if (ws && sembrado.current !== ws.id) {
      sembrado.current = ws.id;
      setName(ws.name);
    }
  }, [ws]);
  const [msg, setMsg] = useState<string | null>(null);
  const update = trpc.workspace.update.useMutation({
    onSuccess: async () => {
      setMsg("Guardado");
      await Promise.all([utils.auth.me.invalidate(), utils.workspace.list.invalidate()]);
    },
    onError: (e) => setMsg(e.message),
  });

  return (
    <section id="espacio" className="mt-8 scroll-mt-4">
      <h2 className="font-display mb-2 font-bold">Espacio</h2>
      <div className="flex items-center gap-2">
        <ElegirIconoEspacio
          nombre={name}
          icon={ws?.icon ?? null}
          disabled={!esDueno}
          onChange={(icon) => {
            setMsg(null);
            update.mutate({ icon });
          }}
        />
        <input
          value={name}
          maxLength={80}
          disabled={!esDueno}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && update.mutate({ name })}
          placeholder="Nombre del espacio"
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-70"
        />
        {esDueno && (
          <button
            onClick={() => {
              setMsg(null);
              update.mutate({ name });
            }}
            disabled={!name.trim() || name.trim() === ws?.name || update.isPending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Guardar
          </button>
        )}
      </div>
      {!esDueno && ws && <p className="mt-2 text-xs text-[var(--muted)]">Solo quien es propietario cambia el nombre y el icono.</p>}
      {msg && <p className="mt-2 text-xs text-[var(--muted)]">{msg}</p>}
    </section>
  );
}
