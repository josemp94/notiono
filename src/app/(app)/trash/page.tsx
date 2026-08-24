"use client";

import { useEffect, useState } from "react";
import { CornerDownRight, FileText } from "lucide-react";
import { confirmar } from "@/components/Confirmar";
import { trpc } from "@/trpc/react";
import { IconoPagina } from "@/components/PageIcon";

type Item = {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  archivedAt: Date;
  archivedBy: { name: string | null; email: string } | null;
};

/** Debe coincidir con TRASH_TTL_DAYS del servidor. */
const TRASH_TTL_DAYS = 30;

function daysLeft(archivedAt: Date): number {
  return Math.max(1, Math.ceil(TRASH_TTL_DAYS - (Date.now() - archivedAt.getTime()) / 864e5));
}

export default function TrashPage() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.pages.trash.useQuery();
  const [query, setQuery] = useState("");
  const restore = trpc.pages.restore.useMutation({
    onSuccess: async () => {
      await utils.pages.trash.invalidate();
      await utils.pages.tree.invalidate();
    },
  });
  const remove = trpc.pages.remove.useMutation({
    onSuccess: async () => {
      await utils.pages.trash.invalidate();
    },
  });
  const emptyTrash = trpc.pages.emptyTrash.useMutation({
    onSuccess: async () => {
      await utils.pages.trash.invalidate();
    },
  });

  // Auto-purga perezosa al abrir la papelera (>30 días). Los viewer no pueden mutar: se ignora.
  const purge = trpc.pages.purgeExpired.useMutation({
    onSuccess: (r) => {
      if (r.purged > 0) utils.pages.trash.invalidate();
    },
    onError: () => {},
  });
  const purgeMutate = purge.mutate;
  useEffect(() => purgeMutate(), [purgeMutate]);

  // Construye el árbol dentro de la papelera: una entrada es "raíz" de la papelera
  // si no tiene padre o su padre NO está también en la papelera.
  const list = (items ?? []) as Item[];
  const inTrash = new Set(list.map((p) => p.id));
  const byParent = new Map<string | null, Item[]>();
  for (const p of list) {
    const key = p.parentId && inTrash.has(p.parentId) ? p.parentId : null;
    const arr = byParent.get(key) ?? [];
    arr.push(p);
    byParent.set(key, arr);
  }
  const roots = byParent.get(null) ?? [];

  // Buscador en cliente: una raíz se muestra si su título (o el de alguna subpágina) coincide.
  const q = query.trim().toLowerCase();
  const matches = (p: Item): boolean =>
    (p.title || "Sin título").toLowerCase().includes(q) || (byParent.get(p.id) ?? []).some(matches);
  const shown = q ? roots.filter(matches) : roots;

  const countDesc = (id: string): number => {
    const kids = byParent.get(id) ?? [];
    return kids.reduce((n, k) => n + 1 + countDesc(k.id), 0);
  };

  const renderChildren = (id: string, depth: number) =>
    (byParent.get(id) ?? []).map((c) => (
      <div key={c.id}>
        <div
          className="flex items-center gap-2 py-1 text-sm text-[var(--muted)]"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <CornerDownRight size={14} className="shrink-0 opacity-60" />
          <span className="truncate">
            {c.icon ? `${c.icon} ` : <FileText size={13} className="mr-1 inline align-[-2px]" />}
            {c.title || "Sin título"}
          </span>
        </div>
        {renderChildren(c.id, depth + 1)}
      </div>
    ));

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 md:px-12 md:py-16">
      <h1 className="font-display mb-2 text-4xl font-extrabold">Papelera</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Al restaurar o borrar un elemento, se aplica también a sus subpáginas (mostradas debajo). Lo que lleve
        más de {TRASH_TTL_DAYS} días aquí se borra definitivamente de forma automática.
      </p>
      {roots.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en la papelera…"
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            onClick={async () => {
              if (await confirmar(`¿Vaciar la papelera? Se borrarán definitivamente ${list.length} páginas.`, "Vaciar"))
                emptyTrash.mutate();
            }}
            disabled={emptyTrash.isPending}
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:border-red-500 hover:text-red-500 disabled:opacity-50"
          >
            Vaciar papelera
          </button>
        </div>
      )}
      {isLoading ? (
        <p className="text-[var(--muted)]">Cargando…</p>
      ) : roots.length === 0 ? (
        <p className="text-[var(--muted)]">La papelera está vacía.</p>
      ) : shown.length === 0 ? (
        <p className="text-[var(--muted)]">Nada en la papelera coincide con «{query.trim()}».</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {shown.map((p) => {
            const n = countDesc(p.id);
            return (
              <li key={p.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">
                    {p.icon ? <><IconoPagina icon={p.icon} size={14} />{" "}</> : <FileText size={14} className="mr-1 inline align-[-2px]" />}
                    {p.title || "Sin título"}
                    {n > 0 && (
                      <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                        +{n} subpágina{n > 1 ? "s" : ""}
                      </span>
                    )}
                    <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                      {p.archivedBy ? `· por ${p.archivedBy.name || p.archivedBy.email} ` : ""}· se borrará en{" "}
                      {daysLeft(p.archivedAt)} día{daysLeft(p.archivedAt) === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-3 text-sm">
                    <button onClick={() => restore.mutate({ id: p.id })} className="text-brand hover:underline">
                      Restaurar
                    </button>
                    <button
                      onClick={async () => {
                        if (await confirmar(n > 0 ? `¿Borrar definitivamente esta página y sus ${n} subpáginas?` : "¿Borrar definitivamente?"))
                          remove.mutate({ id: p.id });
                      }}
                      className="text-[var(--muted)] hover:text-red-500"
                    >
                      Borrar
                    </button>
                  </span>
                </div>
                {renderChildren(p.id, 1)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
