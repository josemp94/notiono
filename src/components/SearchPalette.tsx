"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Database, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/react";
import { IconoPagina } from "@/components/PageIcon";
import { getRecents } from "@/lib/recents";

/** Evento global para abrir la paleta desde cualquier botón (p. ej. el sidebar). */
export const OPEN_SEARCH_EVENT = "notiono:open-search";

export function openSearchPalette() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

/** Paleta de comandos estilo Notion: Ctrl/Cmd+K, busca en títulos y en el contenido. */
export function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sel, setSel] = useState(0);
  // Filtros de la búsqueda (solo actúan sobre los resultados, como en Notion).
  const [tipo, setTipo] = useState<"all" | "doc" | "database">("all");
  const [dias, setDias] = useState<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && openRef.current) {
        // preventDefault síncrono (por eso la ref, no el estado): que este
        // Escape no cierre además el panel de ficha que hubiera debajo.
        e.preventDefault();
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, []);

  // Al abrir: limpiar y enfocar el input.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setDebounced("");
    setSel(0);
    setTipo("all");
    setDias(undefined);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Debounce ~150ms antes de consultar.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 150);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results } = trpc.pages.search.useQuery(
    { query: debounced, inContent: true, tipo, editadoDias: dias },
    { enabled: open && debounced.trim().length > 0 },
  );
  // Sin nada escrito, las últimas páginas visitadas — como Notion. Se cruzan con
  // el árbol para que solo salgan las vivas (y con su título/icono frescos).
  const { data: me } = trpc.auth.me.useQuery(undefined, { enabled: open });
  const { data: tree } = trpc.pages.tree.useQuery(undefined, { enabled: open });
  const byId = new Map((tree ?? []).map((p) => [p.id, p]));
  const recientes = (me?.workspace?.id && open ? getRecents(me.workspace.id) : [])
    .flatMap((r) => byId.get(r.pageId) ?? [])
    .slice(0, 8)
    .map((p) => ({ id: p.id, title: p.title, icon: p.icon, type: "doc", inTitle: false, reciente: true }));
  const items: (typeof recientes[number] | NonNullable<typeof results>[number])[] = debounced.trim()
    ? results ?? []
    : recientes;
  const selIdx = Math.min(sel, Math.max(items.length - 1, 0));

  if (!open) return null;

  const go = (id: string) => {
    setOpen(false);
    router.push(`/p/${id}`);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 md:p-4 md:pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      {/* En el móvil ocupa toda la pantalla, como la búsqueda de la app de Notion;
          en escritorio, la ventanita centrada de siempre. */}
      <div
        className="pt-[env(safe-area-inset-top)] flex h-dvh w-full max-w-lg flex-col overflow-hidden bg-[var(--background)] md:h-auto md:rounded-xl md:border md:border-[var(--border)] md:pt-0 md:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-[var(--border)]">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter" && items[selIdx]) {
              go(items[selIdx].id);
            }
          }}
          placeholder="Buscar en títulos y contenido…"
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-[var(--muted)]"
        />
          {/* Sin Escape a mano en el móvil: un «Cancelar» como el de Notion. */}
          <button onClick={() => setOpen(false)} className="shrink-0 px-4 py-3 text-sm text-brand md:hidden">
            Cancelar
          </button>
        </div>
        {/* Filtros: tipo y editado recientemente. Solo tocan los resultados de búsqueda. */}
        <div className="sin-barra flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--border)] px-3 py-1.5 text-xs md:flex-wrap">
          {(
            [
              ["all", "Todo"],
              ["doc", "Páginas"],
              ["database", "Bases de datos"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setTipo(v)}
              className={`toque-estrecho rounded-full px-2 py-0.5 ${
                tipo === v ? "bg-brand text-white" : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {l}
            </button>
          ))}
          <span className="mx-1 h-4 border-l border-[var(--border)]" />
          {(
            [
              [undefined, "Siempre"],
              [1, "Hoy"],
              [7, "7 días"],
              [30, "30 días"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={l}
              onClick={() => setDias(v)}
              className={`toque-estrecho rounded-full px-2 py-0.5 ${
                dias === v ? "bg-brand text-white" : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1 md:max-h-80 md:flex-none">
          {items.map((p, i) => (
            <button
              key={p.id}
              onClick={() => go(p.id)}
              onMouseEnter={() => setSel(i)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                i === selIdx ? "bg-[var(--active)] font-medium" : ""
              }`}
            >
              <span className="flex shrink-0 items-center text-[var(--muted)]">
                {p.icon ? <IconoPagina icon={p.icon} size={16} /> : p.type === "database" ? <Database size={16} /> : <FileText size={16} />}
              </span>
              <span className="min-w-0 flex-1 truncate">{p.title || "Sin título"}</span>
              <span className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--muted)]">
                {"reciente" in p && p.reciente ? (
                  <>
                    <Clock size={11} /> Reciente
                  </>
                ) : p.inTitle ? (
                  p.type === "database" ? "Base de datos" : "Página"
                ) : (
                  "En el contenido"
                )}
              </span>
            </button>
          ))}
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-[var(--muted)]">
              {debounced.trim() ? "Sin resultados" : "Busca en títulos y contenido de todo el espacio…"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
