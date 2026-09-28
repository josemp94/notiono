"use client";

import { useEffect, useRef, useState } from "react";
import { Check, MessageSquare, Pencil, SmilePlus, X } from "lucide-react";
import { trpc } from "@/trpc/react";

function when(d: Date) {
  return d.toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Hilo de comentarios: lista + caja de escribir. Sin `recordId` es el hilo de la
 * página; con él, el de una fila de base de datos. `panel` activa el layout del
 * panel lateral (lista con scroll propio y caja pegada abajo).
 */
export function CommentThread({
  pageId,
  recordId,
  panel = false,
}: {
  pageId: string;
  recordId?: string;
  panel?: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: comments } = trpc.comments.list.useQuery({ pageId, recordId });
  const [body, setBody] = useState("");
  const canEdit = me?.wsRole !== "viewer";
  const canDelete = (authorId: string) =>
    canEdit && (authorId === me?.id || me?.role === "admin" || me?.wsRole === "owner");

  const refresh = () => utils.comments.list.invalidate();
  const add = trpc.comments.add.useMutation({
    onSuccess: () => {
      setBody("");
      refresh();
    },
  });
  const toggle = trpc.comments.toggleResolve.useMutation({ onSuccess: refresh });
  const react = trpc.comments.react.useMutation({ onSuccess: refresh });
  const remove = trpc.comments.remove.useMutation({ onSuccess: refresh });
  // Editar el propio comentario, inline.
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const edit = trpc.comments.edit.useMutation({
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });

  const send = () => {
    const text = body.trim();
    if (text && !add.isPending) add.mutate({ pageId, recordId, body: text });
  };

  return (
    <>
      <div className={panel ? "flex-1 space-y-3 overflow-y-auto px-4 py-3" : "space-y-3"}>
        {(comments ?? []).length === 0 && (
          <p className="text-sm text-[var(--muted)]">Todavía no hay comentarios.</p>
        )}
        {(comments ?? []).map((c) => (
          <div key={c.id} className={`group rounded-lg text-sm ${c.resolved ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[10px] font-bold text-brand">
                {(c.author.name || c.author.email)[0]?.toUpperCase()}
              </span>
              <span className="min-w-0 truncate font-medium">{c.author.name || c.author.email}</span>
              <span className="shrink-0 text-[10px] text-[var(--muted)]">{when(c.createdAt)}</span>
              {canEdit && (
                <span className="ml-auto flex shrink-0 items-center al-pasar">
                  <button
                    onClick={() => toggle.mutate({ id: c.id })}
                    className="rounded px-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                    title={c.resolved ? "Reabrir" : "Marcar como resuelto"}
                  >
                    <Check size={14} />
                  </button>
                  {c.author.id === me?.id && (
                    <button
                      onClick={() => setEditing({ id: c.id, body: c.body })}
                      className="rounded px-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                      title="Editar comentario"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  {canDelete(c.author.id) && (
                    <button
                      onClick={() => remove.mutate({ id: c.id })}
                      className="rounded px-1 text-xs text-[var(--muted)] hover:text-red-500"
                      title="Borrar comentario"
                    >
                      <X size={14} />
                    </button>
                  )}
                </span>
              )}
            </div>
            {editing?.id === c.id ? (
              <div className="mt-1 pl-7">
                <textarea
                  autoFocus
                  value={editing.body}
                  onChange={(e) => setEditing({ id: c.id, body: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (editing.body.trim()) edit.mutate({ id: c.id, body: editing.body.trim() });
                    }
                    if (e.key === "Escape") setEditing(null);
                  }}
                  rows={2}
                  className="w-full rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-brand"
                />
                <div className="mt-1 flex gap-2 text-xs">
                  <button
                    onClick={() => editing.body.trim() && edit.mutate({ id: c.id, body: editing.body.trim() })}
                    disabled={edit.isPending}
                    className="text-brand hover:underline disabled:opacity-50"
                  >
                    Guardar
                  </button>
                  <button onClick={() => setEditing(null)} className="text-[var(--muted)] hover:underline">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <p className={`mt-1 whitespace-pre-wrap pl-7 ${c.resolved ? "line-through" : ""}`}>{c.body}</p>
            )}
            <Reacciones
              reactions={(c.reactions ?? {}) as Record<string, string[]>}
              meId={me?.id}
              canReact={canEdit}
              onReact={(emoji) => react.mutate({ id: c.id, emoji })}
            />
          </div>
        ))}
      </div>

      {canEdit && (
        <div className={panel ? "border-t border-[var(--border)] p-3" : "mt-2"}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Escribe un comentario…"
            rows={2}
            className="w-full resize-none rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            onClick={send}
            disabled={!body.trim() || add.isPending}
            className={`mt-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${panel ? "w-full" : ""}`}
          >
            Enviar
          </button>
        </div>
      )}
    </>
  );
}

/** Panel lateral derecho con el hilo de comentarios de una página. */
export function CommentsPanel({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  return (
    // En el móvil, a pantalla completa: con 320 px quedaba una franja de página
    // asomando a la izquierda que no servía para nada.
    <aside className="pt-[env(safe-area-inset-top)] fixed inset-0 z-40 flex w-full flex-col bg-[var(--background)] md:static md:z-auto md:w-80 md:border-l md:border-[var(--border)] md:pt-0">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="flex items-center gap-2 font-display text-sm font-bold">
          <MessageSquare size={16} /> Comentarios
        </h2>
        <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar">
          <X size={16} />
        </button>
      </div>
      <CommentThread pageId={pageId} panel />
    </aside>
  );
}

/** Botón "Comentarios (N)" para la cabecera de la página. */
export function CommentsButton({ pageId, onClick }: { pageId: string; onClick: () => void }) {
  const { data: comments } = trpc.comments.list.useQuery({ pageId });
  return (
    <button
      onClick={onClick}
      className="toque flex items-center justify-center gap-1 rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)]"
      title="Comentarios"
    >
      <MessageSquare size={16} /> {comments?.length ?? 0}
    </button>
  );
}

/** Los seis de siempre; para más matices ya está el texto. */
const EMOJIS_RAPIDOS = ["👍", "❤️", "😂", "🎉", "😮", "😢"];

/** Reacciones de un comentario: pills emoji+recuento (toggle) y un «+» con los
 *  emojis rápidos, como en Notion. */
function Reacciones({
  reactions,
  meId,
  canReact,
  onReact,
}: {
  reactions: Record<string, string[]>;
  meId?: string;
  canReact: boolean;
  onReact: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const entries = Object.entries(reactions).filter(([, users]) => users.length > 0);
  if (!entries.length && !canReact) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 pl-7">
      {entries.map(([emoji, users]) => (
        <button
          key={emoji}
          onClick={() => canReact && onReact(emoji)}
          title={`${users.length} reacción${users.length > 1 ? "es" : ""}`}
          className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${
            meId && users.includes(meId)
              ? "border-brand/60 bg-brand-50 text-[var(--foreground)]"
              : "border-[var(--border)] hover:bg-[var(--hover)]"
          }`}
        >
          {emoji} {users.length}
        </button>
      ))}
      {canReact && (
        <span className="relative" ref={ref}>
          <button
            onClick={() => setOpen((o) => !o)}
            className={`${open ? "" : "al-pasar"} flex items-center rounded-full border border-[var(--border)] p-1 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]`}
            title="Reaccionar"
          >
            <SmilePlus size={13} />
          </button>
          {open && (
            <span
              data-menu=""
              className="absolute bottom-full left-0 z-30 mb-1 flex gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 shadow-xl"
            >
              {EMOJIS_RAPIDOS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    onReact(e);
                    setOpen(false);
                  }}
                  className="rounded p-1 text-base hover:bg-[var(--hover)]"
                >
                  {e}
                </button>
              ))}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
