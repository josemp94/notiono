"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Folder, FolderInput, X } from "lucide-react";
import { trpc } from "@/trpc/react";
import { IconoPagina } from "@/components/PageIcon";

/**
 * Modal "Mover a…": buscador sobre el árbol del workspace; al elegir destino
 * reparenta con pages.move (el servidor revalida los ciclos). Excluye en cliente
 * la propia página y su subárbol.
 */
export function MovePageModal({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: tree } = trpc.pages.tree.useQuery();
  const [q, setQ] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const move = trpc.pages.move.useMutation({
    onSuccess: async () => {
      await utils.pages.tree.invalidate();
      onClose();
    },
  });

  // La página y sus descendientes no son destino válido.
  const excluded = useMemo(() => {
    const byParent = new Map<string, string[]>();
    for (const p of tree ?? []) {
      if (p.parentId) byParent.set(p.parentId, [...(byParent.get(p.parentId) ?? []), p.id]);
    }
    const set = new Set<string>();
    const stack = [pageId];
    while (stack.length) {
      const id = stack.pop()!;
      set.add(id);
      stack.push(...(byParent.get(id) ?? []));
    }
    return set;
  }, [tree, pageId]);

  const query = q.trim().toLowerCase();
  const candidates = (tree ?? []).filter(
    (p) => !excluded.has(p.id) && (p.title || "Sin título").toLowerCase().includes(query),
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
            <FolderInput size={18} /> Mover a
          </h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar">
            <X size={16} />
          </button>
        </div>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar página de destino…"
          className="mb-2 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <div className="min-h-0 overflow-y-auto">
          <button
            disabled={move.isPending}
            onClick={() => move.mutate({ id: pageId, parentId: null })}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-[var(--hover)] disabled:opacity-50"
          >
            <Folder size={14} className="shrink-0 text-[var(--muted)]" />
            <span className="truncate">Raíz de {me?.workspace?.name ?? "este espacio"}</span>
          </button>
          {candidates.map((p) => (
            <button
              key={p.id}
              disabled={move.isPending}
              onClick={() => move.mutate({ id: pageId, parentId: p.id })}
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
        {move.error && <p className="mt-2 text-xs text-red-500">{move.error.message}</p>}
      </div>
    </div>,
    document.body,
  );
}
