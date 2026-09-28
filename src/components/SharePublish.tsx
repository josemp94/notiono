"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Globe, Lock, X } from "lucide-react";
import { trpc } from "@/trpc/react";

const NIVELES: [string, string][] = [
  ["view", "Ver"],
  ["comment", "Comentar"],
  ["edit", "Editar"],
  ["full", "Acceso total"],
];

/**
 * Acceso por página: restringir corta la herencia y deja pasar solo a los de la
 * lista (owner/admin del espacio entran siempre). Solo la ve quien tiene acceso
 * total (el botón Compartir ya exige eso). La lista se siembra en el servidor con
 * los miembros actuales, así que activar el candado no cambia nada por sí solo.
 */
function AccesoSection({ pageId }: { pageId: string }) {
  const utils = trpc.useUtils();
  const { data } = trpc.pages.perms.get.useQuery({ pageId });
  const { data: ws } = trpc.workspace.members.useQuery();
  const invalidate = () => {
    utils.pages.perms.get.invalidate({ pageId });
    utils.pages.tree.invalidate();
  };
  const setRestricted = trpc.pages.perms.setRestricted.useMutation({ onSuccess: invalidate });
  const setPerm = trpc.pages.perms.set.useMutation({ onSuccess: invalidate });
  const removePerm = trpc.pages.perms.remove.useMutation({ onSuccess: invalidate });
  if (!data) return null;

  const sinPermiso = (ws?.members ?? []).filter(
    (m) => m.role !== "admin" && m.role !== "owner" && !data.permisos.some((p) => p.userId === m.userId),
  );

  return (
    <div className="mb-3 border-b border-[var(--border)] pb-3">
      <div className="mb-1 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Lock size={13} /> Acceso
          </div>
          <div className="text-xs text-[var(--muted)]">
            {data.restricted ? "Restringida: solo la gente de la lista." : "Todo el espacio, según su rol."}
          </div>
        </div>
        <button
          onClick={() => setRestricted.mutate({ pageId, restricted: !data.restricted })}
          disabled={setRestricted.isPending}
          role="switch"
          aria-checked={data.restricted}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            data.restricted ? "bg-brand" : "bg-[var(--border)]"
          }`}
          title={data.restricted ? "Volver a heredar del espacio" : "Restringir esta página"}
        >
          <span
            className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${
              data.restricted ? "left-4.5" : "left-0.5"
            }`}
          />
        </button>
      </div>
      {data.restricted && (
        <div className="mt-2 space-y-1">
          {data.permisos.map((p) => (
            <div key={p.userId} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <select
                value={p.level}
                onChange={(e) => setPerm.mutate({ pageId, userId: p.userId, level: e.target.value as "view" | "comment" | "edit" | "full" })}
                className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
              >
                {NIVELES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <button
                onClick={() => removePerm.mutate({ pageId, userId: p.userId })}
                className="toque-estrecho shrink-0 text-[var(--muted)] hover:text-red-500"
                title="Quitar acceso"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          {data.permisos.length === 0 && (
            <p className="text-xs text-[var(--muted)]">Solo tú (y los administradores).</p>
          )}
          {sinPermiso.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) setPerm.mutate({ pageId, userId: e.target.value, level: "view" });
              }}
              className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs text-[var(--muted)]"
            >
              <option value="">+ Dar acceso a alguien…</option>
              {sinPermiso.map((m) => (
                <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
              ))}
            </select>
          )}
          <p className="pt-1 text-[11px] text-[var(--muted)]">
            Vale también para todas sus subpáginas (herencia).
          </p>
        </div>
      )}
    </div>
  );
}

/** Botón de cabecera con popover Publicar/Despublicar y URL pública copiable. */
export function ShareButton({ pageId, publicToken }: { pageId: string; publicToken: string | null }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const invalidate = () => utils.pages.get.invalidate({ id: pageId });
  const publish = trpc.pages.publish.useMutation({ onSuccess: invalidate });
  const unpublish = trpc.pages.unpublish.useMutation({ onSuccess: invalidate });
  const setOptions = trpc.pages.setPublicOptions.useMutation({ onSuccess: invalidate });
  // Caducidad y contraseña actuales (pages.get ya está en caché por la propia página).
  const { data: pagina } = trpc.pages.get.useQuery({ id: pageId }, { enabled: open && !!publicToken });

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // `open` solo puede ser true tras interacción (post-montaje), así que window existe.
  const url = open && publicToken ? `${window.location.origin}/s/${publicToken}` : null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`toque inline-flex items-center justify-center rounded-md px-2 py-1 text-sm hover:bg-[var(--hover)] ${
          publicToken ? "text-brand" : "text-[var(--muted)]"
        }`}
        title="Compartir / Publicar en la web"
      >
        {/* Como Notion: «Compartir» con palabra en escritorio; en el móvil no cabe. */}
        <Globe size={16} className="md:hidden" />
        <span className="hidden md:inline">Compartir</span>
        {publicToken && <Globe size={13} className="ml-1 hidden md:inline" />}
      </button>
      {open && (
        <div data-menu=""
          className="absolute right-0 top-full z-30 mt-1 w-80 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 shadow-xl">
          <AccesoSection pageId={pageId} />
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Publicar en la web</div>
              <div className="text-xs text-[var(--muted)]">
                {publicToken ? "Cualquiera con el enlace puede verla." : "Crea un enlace público de solo lectura."}
              </div>
            </div>
            <button
              onClick={() =>
                publicToken ? unpublish.mutate({ id: pageId }) : publish.mutate({ id: pageId })
              }
              disabled={publish.isPending || unpublish.isPending}
              role="switch"
              aria-checked={!!publicToken}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                publicToken ? "bg-brand" : "bg-[var(--border)]"
              }`}
              title={publicToken ? "Despublicar" : "Publicar"}
            >
              <span
                className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${
                  publicToken ? "left-4.5" : "left-0.5"
                }`}
              />
            </button>
          </div>
          {url && (
            <div className="mt-3 flex gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 font-mono text-xs outline-none focus:border-brand"
              />
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
              >
                {copied ? (
                  <>
                    Copiado <Check size={12} />
                  </>
                ) : (
                  "Copiar"
                )}
              </button>
            </div>
          )}
          {/* Opciones del enlace público, como en Notion: caducidad y contraseña. */}
          {url && (
            <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
              <label className="flex items-center justify-between gap-2 text-xs">
                <span className="text-[var(--muted)]">Caduca al acabar el día</span>
                <input
                  type="date"
                  key={String(pagina?.publicExpiresAt ?? "")}
                  defaultValue={
                    pagina?.publicExpiresAt ? new Date(pagina.publicExpiresAt).toISOString().slice(0, 10) : ""
                  }
                  onChange={(e) => setOptions.mutate({ id: pageId, expiresAt: e.target.value || null })}
                  className="rounded border border-[var(--border)] bg-transparent px-1.5 py-1 text-xs outline-none focus:border-brand"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs">
                <span className="shrink-0 text-[var(--muted)]">Contraseña</span>
                <span className="flex min-w-0 items-center gap-1">
                  <input
                    type="text"
                    placeholder={pagina?.hasPublicPassword ? "guardada — escribe para cambiarla" : "sin contraseña"}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (v) {
                        setOptions.mutate({ id: pageId, password: v });
                        (e.target as HTMLInputElement).value = "";
                      }
                    }}
                    className="w-40 min-w-0 rounded border border-[var(--border)] bg-transparent px-1.5 py-1 text-xs outline-none placeholder:text-[var(--muted)] focus:border-brand"
                    title="Escribe la contraseña y pulsa Enter"
                  />
                  {pagina?.hasPublicPassword && (
                    <button
                      onClick={() => setOptions.mutate({ id: pageId, password: null })}
                      className="shrink-0 text-xs text-[var(--muted)] hover:text-red-500"
                      title="Quitar la contraseña"
                    >
                      Quitar
                    </button>
                  )}
                </span>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
