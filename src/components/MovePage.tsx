"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Folder, FolderInput, X } from "lucide-react";
import { trpc } from "@/trpc/react";
import { IconoPagina } from "@/components/PageIcon";
import { IconoEspacio } from "@/components/Espacios";
import { confirmar } from "@/components/Confirmar";
import { toast } from "@/components/Toast";

/**
 * Modal "Mover a…": buscador sobre el árbol del workspace; al elegir destino
 * reparenta con pages.move (el servidor revalida los ciclos). Excluye en cliente
 * la propia página y su subárbol.
 */
export function MovePageModal({
  pageId,
  onClose,
  onElegir,
  soloDocumentos = false,
  titulo = "Mover a",
}: {
  pageId: string;
  onClose: () => void;
  /** Elegir destino para otra cosa (mover bloques): solo se excluye la propia página y no hay «Raíz». */
  onElegir?: (destino: string) => void;
  soloDocumentos?: boolean;
  /** Para usarlo como selector de páginas (Inicio, «Abrir al iniciar»). */
  titulo?: string;
}) {
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: arbolActivo } = trpc.pages.tree.useQuery();
  const { data: spaces } = trpc.workspace.list.useQuery(undefined, { enabled: !onElegir });
  // Como Notion: abajo del diálogo se elige el espacio; en otro espacio, la página se duplica allí.
  const [espacio, setEspacio] = useState<string | null>(null);
  const actual = me?.workspace?.id ?? null;
  const enOtro = !!espacio && espacio !== actual;
  const destinos = (spaces ?? []).filter((s) => s.id === actual || s.rol === "owner" || s.rol === "editor");
  const elegido = destinos.find((s) => s.id === (espacio ?? actual));
  const { data: arbolOtro } = trpc.pages.arbolDe.useQuery({ workspaceId: espacio ?? "" }, { enabled: enOtro });
  const tree = enOtro ? arbolOtro : arbolActivo;
  const [q, setQ] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const move = trpc.pages.move.useMutation({
    onSuccess: async () => {
      await utils.pages.tree.invalidate();
      onClose();
    },
  });
  const copiar = trpc.pages.copiarAEspacio.useMutation({
    onSuccess: ({ id, workspaceId }) => {
      onClose();
      toast(`Duplicada en «${elegido?.name ?? "el otro espacio"}»`, {
        etiqueta: "Abrir",
        onClick: () => (window.location.href = `/api/espacio/${workspaceId}?a=${encodeURIComponent(`/p/${id}`)}`),
      });
    },
  });
  const ocupado = move.isPending || copiar.isPending;
  const elegir = async (parentId: string | null) => {
    if (!enOtro || !espacio) return move.mutate({ id: pageId, parentId });
    const ok = await confirmar(
      `La página y sus subpáginas se duplicarán en «${elegido?.name}» y el original se quedará aquí. ` +
        "En la copia pueden romperse enlaces, relaciones con otras bases de datos y permisos.",
      "Entiendo, duplicar",
    );
    if (ok) copiar.mutate({ id: pageId, workspaceId: espacio, parentId });
  };

  // La página y sus descendientes no son destino válido.
  const excluded = useMemo(() => {
    const byParent = new Map<string, string[]>();
    for (const p of tree ?? []) {
      if (p.parentId) byParent.set(p.parentId, [...(byParent.get(p.parentId) ?? []), p.id]);
    }
    const set = new Set<string>();
    if (onElegir || enOtro) return set.add(pageId);
    const stack = [pageId];
    while (stack.length) {
      const id = stack.pop()!;
      set.add(id);
      stack.push(...(byParent.get(id) ?? []));
    }
    return set;
  }, [tree, pageId, onElegir, enOtro]);

  const query = q.trim().toLowerCase();
  const candidates = (tree ?? []).filter(
    (p) =>
      !excluded.has(p.id) &&
      (!soloDocumentos || p.type === "doc") &&
      (p.title || "Sin título").toLowerCase().includes(query),
  );

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-full max-w-md flex-col rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <FolderInput size={18} /> {titulo}
          </h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar">
            <X size={16} />
          </button>
        </div>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={onElegir ? "Buscar página…" : "Buscar página de destino…"}
          className="mb-2 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <div className="min-h-0 overflow-y-auto">
          {!onElegir && <button
            disabled={ocupado}
            onClick={() => elegir(null)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-[var(--hover)] disabled:opacity-50"
          >
            {elegido ? <IconoEspacio nombre={elegido.name} icon={elegido.icon} size={14} /> : <Folder size={14} className="shrink-0 text-[var(--muted)]" />}
            <span className="truncate">Raíz de {elegido?.name ?? me?.workspace?.name ?? "este espacio"}</span>
          </button>}
          {candidates.map((p) => (
            <button
              key={p.id}
              disabled={ocupado}
              onClick={() => (onElegir ? onElegir(p.id) : elegir(p.id))}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-[var(--hover)] disabled:opacity-50"
            >
              {p.icon ? (
                <span className="w-4 shrink-0 text-center"><IconoPagina icon={p.icon} size={14} /></span>
              ) : (
                <FileText size={14} className="shrink-0 text-[var(--muted)]" />
              )}
              <span className="truncate">{p.title || "Sin título"}</span>
            </button>
          ))}
          {candidates.length === 0 && query && (
            <p className="px-3 py-4 text-center text-sm text-[var(--muted)]">Sin resultados para «{q}».</p>
          )}
        </div>
        {(move.error ?? copiar.error) && <p className="mt-2 text-xs text-red-500">{(move.error ?? copiar.error)?.message}</p>}
        {!onElegir && destinos.length > 1 && (
          <label className="mt-3 flex items-center gap-2 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
            Espacio
            <select
              value={espacio ?? actual ?? ""}
              onChange={(e) => {
                setEspacio(e.target.value);
                setQ("");
              }}
              className="toque-estrecho min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)]"
            >
              {destinos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.isOwner ? "" : ` (de ${s.ownerName})`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>,
    document.body,
  );
}
