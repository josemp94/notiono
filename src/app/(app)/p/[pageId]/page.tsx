"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, FileArchive, FileCode, FileDown, FileText, FolderInput, History, Link as LinkIcon, Lock, MessageSquare, MoreHorizontal, MoveHorizontal, Star } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@/trpc/react";
import { pushRecent } from "@/lib/recents";
import { Editor } from "@/components/editor/Editor";
import { Database } from "@/components/database/Database";
import { CommentsButton, CommentsPanel } from "@/components/CommentsPanel";
import { HistoryButton, VersionHistoryModal } from "@/components/VersionHistory";
import { ShareButton } from "@/components/SharePublish";
import { MovePageModal } from "@/components/MovePage";
import { toast } from "@/components/Toast";
import { BotonPanel } from "@/components/AppShell";
import { usePeople } from "@/components/database/Cell";
import { IconoPagina } from "@/components/PageIcon";
import { exportaZipConEditor } from "@/components/editor/exportarZip";
import { exportaHtml } from "@/components/editor/exportarHtml";
import { nombreSeguro, type PaginaExport } from "@/lib/exportZip";
import { editorParaExport } from "@/components/editor/bloquesExport";
import { downloadText } from "@/lib/download";

/** "hace 5 min", "hace 3 h", "ayer", "hace 12 días" — para la barra superior. */
function haceCuanto(d: Date | string): string {
  const min = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.floor(h / 24);
  return dias === 1 ? "ayer" : `hace ${dias} días`;
}

export default function PageView() {
  const params = useParams<{ pageId: string }>();
  const pageId = params.pageId;
  const utils = trpc.useUtils();
  const { data: page, isLoading, error } = trpc.pages.get.useQuery({ id: pageId });
  const { data: me } = trpc.auth.me.useQuery();
  const [comments, setComments] = useState(false);
  const [history, setHistory] = useState(false);
  // Remonta el editor tras restaurar una versión (initialContent solo se lee al montar).
  const [editorEpoch, setEditorEpoch] = useState(0);
  // El nivel por página viene del servidor con pages.get; el rol viewer sigue mandando.
  const nivel = page?.nivel ?? "edit";
  const canEdit = me?.wsRole !== "viewer" && (nivel === "edit" || nivel === "full");
  // El candado apaga la edición del CONTENIDO sin tocar permisos: quien puede
  // editar puede quitarlo (es un «no tocar sin querer», como en Notion).
  const editable = canEdit && !page?.locked;

  // Registra la visita en 🕘 Recientes (localStorage, por workspace).
  const workspaceId = me?.workspace?.id;
  useEffect(() => {
    if (page && workspaceId) pushRecent(workspaceId, { id: page.id, title: page.title, icon: page.icon });
  }, [page, workspaceId]);

  if (isLoading) {
    return (
      <div className="px-12 py-16">
        <div className="esqueleto h-9 w-1/3" />
        <div className="mt-8 space-y-3">
          <div className="esqueleto h-4 w-2/3" />
          <div className="esqueleto h-4 w-1/2" />
          <div className="esqueleto h-4 w-3/5" />
        </div>
      </div>
    );
  }
  if (error || !page) {
    return <div className="px-12 py-16 text-[var(--muted)]">Página no encontrada.</div>;
  }

  return (
    <div className="relative flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="no-imprimir flex h-11 shrink-0 items-center gap-1 px-3">
          <BotonPanel />
          <Breadcrumbs pageId={page.id} />
          {/* Aquí pinta el editor quién más está en la página y si la conexión falla
              (ver Editor.tsx): Notion enseña los avatares en esta misma barra. */}
          <div id="barra-editor" className="ml-auto flex shrink-0 items-center gap-2 text-xs text-[var(--muted)]" />
          {!comments && (
            <div className="flex shrink-0 items-center gap-1">
              {/* «Editado por X hace Y», como Notion en su barra superior. */}
              <span
                className="hidden whitespace-nowrap px-1 text-xs text-[var(--muted)] lg:block"
                title={new Date(page.updatedAt).toLocaleString("es")}
              >
                {page.editadoPor ? `Editado por ${page.editadoPor} ` : "Editado "}
                {haceCuanto(page.updatedAt)}
              </span>
              {page.locked && <LockedPill pageId={page.id} canEdit={canEdit} />}
              {nivel === "full" && <ShareButton pageId={page.id} publicToken={page.publicToken} />}
              {/* En el móvil no caben: van dentro del «⋯», como en la app de Notion. */}
              <div className="hidden items-center gap-1 md:flex">
                <CommentsButton pageId={page.id} onClick={() => setComments(true)} />
                {page.type !== "database" && <HistoryButton onClick={() => setHistory(true)} />}
                {canEdit && <FavoriteButton pageId={page.id} />}
                <FollowButton pageId={page.id} siguiendo={page.siguiendo} />
              </div>
              <PageMenu
                page={page}
                canEdit={canEdit}
                onComments={() => setComments(true)}
                onHistory={() => setHistory(true)}
              />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto" data-font={page.type === "database" ? undefined : (page.font ?? "sans")}>
          {page.type === "database" ? (
            <Database
              key={page.id}
              pageId={page.id}
              initialTitle={page.title || "Base de datos"}
              initialIcon={page.icon}
              initialCover={page.cover}
              canEdit={editable}
            />
          ) : (
            <Editor
              key={`${page.id}:${editorEpoch}`}
              pageId={page.id}
              initialTitle={page.title}
              initialContent={page.content}
              initialIcon={page.icon}
              initialCover={page.cover}
              fullWidth={page.fullWidth}
              canEdit={editable}
            />
          )}
        </div>
      </div>
      {comments && <CommentsPanel pageId={page.id} onClose={() => setComments(false)} />}
      {history && (
        <VersionHistoryModal
          pageId={page.id}
          canEdit={canEdit}
          onClose={() => setHistory(false)}
          onRestored={async () => {
            await utils.pages.get.invalidate({ id: pageId });
            setEditorEpoch((e) => e + 1);
          }}
        />
      )}
    </div>
  );
}

/** Miga de pan: Espacio ▸ ancestros ▸ página actual, resuelta desde el árbol ya cargado. */
function Breadcrumbs({ pageId }: { pageId: string }) {
  const { data: tree } = trpc.pages.tree.useQuery();

  const byId = new Map((tree ?? []).map((p) => [p.id, p]));
  const chain: NonNullable<typeof tree> = [];
  let cur = byId.get(pageId);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  // Como en Notion: solo las páginas, separadas por «/», sin el espacio delante. En el
  // móvil, solo la página actual: no cabe más y el cajón ya enseña dónde cuelga.
  const sep = <span className="hidden shrink-0 text-[var(--muted)] opacity-60 md:inline">/</span>;
  return (
    <nav className="flex min-w-0 items-center gap-1 text-sm text-[var(--muted)]">
      {chain.map((p, i) => (
        <span key={p.id} className={`min-w-0 items-center gap-1 ${i === chain.length - 1 ? "flex" : "hidden md:flex"}`}>
          {i > 0 && sep}
          {i === chain.length - 1 ? (
            <span className="flex min-w-0 items-center gap-1 px-1 py-0.5 text-[var(--foreground)]">
              {p.icon ? <span className="shrink-0"><IconoPagina icon={p.icon} size={14} /></span> : <FileText size={13} className="shrink-0" />}
              <span className="truncate">{p.title || "Sin título"}</span>
            </span>
          ) : (
            <Link
              href={`/p/${p.id}`}
              className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
            >
              {p.icon ? <span className="shrink-0"><IconoPagina icon={p.icon} size={14} /></span> : <FileText size={13} className="shrink-0" />}
              <span className="max-w-32 truncate">{p.title || "Sin título"}</span>
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Pill «Bloqueada» de la barra: enseña el candado y, con permiso, lo quita. */
function LockedPill({ pageId, canEdit }: { pageId: string; canEdit: boolean }) {
  const utils = trpc.useUtils();
  const setLocked = trpc.pages.setLocked.useMutation();
  return (
    <button
      disabled={!canEdit}
      onClick={() => {
        utils.pages.get.setData({ id: pageId }, (p) => (p ? { ...p, locked: false } : p));
        setLocked.mutate({ id: pageId, value: false });
      }}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] disabled:cursor-default"
      title={canEdit ? "Pulsar para desbloquear" : "Página bloqueada"}
    >
      <Lock size={13} /> Bloqueada
    </button>
  );
}

const itemMenu = "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-[var(--hover)]";

/**
 * Menú «⋯» de la cabecera. En el móvil recoge además lo que en escritorio va suelto
 * en la barra (comentarios, historial, favorito, seguir), que ahí no cabe.
 */
function PageMenu({
  page,
  canEdit,
  onComments,
  onHistory,
}: {
  page: { id: string; title: string; type: string; fullWidth: boolean; locked: boolean; font?: string; icon?: string | null; content?: unknown; siguiendo?: boolean };
  canEdit: boolean;
  onComments: () => void;
  onHistory: () => void;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [exportando, setExportando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const setFullWidth = trpc.pages.setFullWidth.useMutation();
  const setLocked = trpc.pages.setLocked.useMutation();
  const setFont = trpc.pages.setFont.useMutation();
  const people = usePeople();
  const { data: favs } = trpc.favorites.list.useQuery();
  const esFavorita = (favs ?? []).some((f) => f.id === page.id);
  const favorita = trpc.pages.toggleFavorite.useMutation({ onSuccess: () => utils.favorites.list.invalidate() });
  const seguir = trpc.pages.toggleFollow.useMutation({
    onSuccess: (r) => utils.pages.get.setData({ id: page.id }, (p) => (p ? { ...p, siguiendo: r.siguiendo } : p)),
  });

  async function exportarMarkdown() {
    setOpen(false);
    // Lo último guardado (el editor guarda a los 800 ms): la caché podría ir por detrás.
    const fresca = await utils.pages.get.fetch({ id: page.id }, { staleTime: 0 });
    const ed = editorParaExport(fresca.content);
    downloadText(`${nombreSeguro(page.title || "Sin titulo")}.md`, ed.blocksToMarkdownLossy(ed.document), "text/markdown");
  }

  async function exportarZip() {
    setOpen(false);
    setExportando(true);
    try {
      const pages = await utils.pages.exportTree.fetch({ pageId: page.id });
      const r = await exportaZipConEditor({
        pages: pages as unknown as PaginaExport[],
        rootId: page.id,
        people,
        nombre: page.title || "pagina",
      });
      window.alert(`Exportadas ${r.paginas} páginas${r.adjuntos ? ` y ${r.adjuntos} adjuntos` : ""}.`);
    } finally {
      setExportando(false);
    }
  }

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function toggleFullWidth() {
    const value = !page.fullWidth;
    // Actualiza la caché al vuelo (mismo estado que persistirá el servidor).
    utils.pages.get.setData({ id: page.id }, (p) => (p ? { ...p, fullWidth: value } : p));
    setFullWidth.mutate({ id: page.id, value });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="toque inline-flex items-center justify-center rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)]"
        title="Opciones de página"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div data-menu="" className="absolute right-0 top-full z-30 mt-1 max-h-[calc(100dvh-4rem)] w-60 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 shadow-xl">
          <div className="md:hidden">
            <button onClick={() => { setOpen(false); onComments(); }} className={itemMenu}>
              <MessageSquare size={16} />
              Comentarios
            </button>
            {page.type !== "database" && (
              <button onClick={() => { setOpen(false); onHistory(); }} className={itemMenu}>
                <History size={16} />
                Historial de versiones
              </button>
            )}
            {canEdit && (
              <button onClick={() => favorita.mutate({ pageId: page.id })} className={itemMenu}>
                <Star size={16} fill={esFavorita ? "currentColor" : "none"} className={esFavorita ? "text-brand" : ""} />
                {esFavorita ? "Quitar de favoritos" : "Añadir a favoritos"}
              </button>
            )}
            <button onClick={() => seguir.mutate({ pageId: page.id })} className={itemMenu}>
              <Bell size={16} fill={page.siguiendo ? "currentColor" : "none"} className={page.siguiendo ? "text-brand" : ""} />
              {page.siguiendo ? "Dejar de seguir" : "Seguir los cambios"}
            </button>
            <div className="my-1 border-t border-[var(--border)]" />
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${location.origin}/p/${page.id}`);
              setOpen(false);
              toast("Enlace copiado");
            }}
            className={itemMenu}
          >
            <LinkIcon size={16} />
            Copiar enlace
          </button>
          {canEdit && (
          <>
          <button
            onClick={() => {
              const value = !page.locked;
              utils.pages.get.setData({ id: page.id }, (p) => (p ? { ...p, locked: value } : p));
              setLocked.mutate({ id: page.id, value });
              setOpen(false);
            }}
            className={itemMenu}
          >
            <Lock size={16} />
            {page.type === "database" ? "Bloquear base de datos" : "Bloquear página"}
            {page.locked && <Check size={14} className="ml-auto text-brand" />}
          </button>
          {page.type !== "database" && (
            <button
              onClick={toggleFullWidth}
              className={itemMenu}
            >
              <MoveHorizontal size={16} />
              Ancho completo
              {page.fullWidth && <Check size={14} className="ml-auto text-brand" />}
            </button>
          )}
          {/* Estilo (el «Style» de Notion): tipografía del cuerpo y los títulos. */}
          {page.type !== "database" && (
            <div className="px-3 py-1.5">
              <div className="mb-1 text-xs text-[var(--muted)]">Estilo</div>
              <div className="flex gap-1">
                {([["sans", "Normal"], ["serif", "Serif"], ["mono", "Mono"]] as const).map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => {
                      utils.pages.get.setData({ id: page.id }, (p) => (p ? { ...p, font: v } : p));
                      setFont.mutate({ id: page.id, font: v });
                    }}
                    className={`flex-1 rounded-md border px-1 py-1 text-center ${
                      (page.font ?? "sans") === v
                        ? "border-brand text-brand"
                        : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <span className={`block text-base leading-none ${v === "serif" ? "font-serif" : v === "mono" ? "font-mono" : ""}`}>Ag</span>
                    <span className="text-[10px]">{l}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          </>
          )}
          <div className="my-1 border-t border-[var(--border)]" />
          <button
            onClick={exportarZip}
            disabled={exportando}
            className={`${itemMenu} disabled:opacity-60`}
          >
            <FileArchive size={16} />
            {exportando ? "Exportando…" : "Exportar con subpáginas (ZIP)"}
          </button>
          {/* Solo docs: una BD ya exporta a CSV desde su barra. */}
          {page.type !== "database" && (
            <button onClick={exportarMarkdown} className={itemMenu}>
              <FileDown size={16} />
              Exportar Markdown
            </button>
          )}
          {page.type !== "database" && (
            <button
              onClick={() => {
                setOpen(false);
                exportaHtml({ titulo: page.title, icon: page.icon, content: page.content });
              }}
              className={itemMenu}
              title="Un .html que se abre en cualquier navegador; para PDF, imprime la página (Ctrl+P)"
            >
              <FileCode size={16} />
              Exportar HTML
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => {
                setOpen(false);
                setMoving(true);
              }}
              className={itemMenu}
            >
              <FolderInput size={16} />
              Mover a…
            </button>
          )}
        </div>
      )}
      {moving && <MovePageModal pageId={page.id} onClose={() => setMoving(false)} />}
    </div>
  );
}

/** Campana de la cabecera: seguir la página (aviso cuando otro la edita). */
function FollowButton({ pageId, siguiendo }: { pageId: string; siguiendo?: boolean }) {
  const utils = trpc.useUtils();
  const toggle = trpc.pages.toggleFollow.useMutation({
    onSuccess: (r) => {
      utils.pages.get.setData({ id: pageId }, (p) => (p ? { ...p, siguiendo: r.siguiendo } : p));
      toast(r.siguiendo ? "Siguiendo la página: te avisaremos de los cambios" : "Has dejado de seguirla");
    },
  });
  return (
    <button
      onClick={() => toggle.mutate({ pageId })}
      disabled={toggle.isPending}
      className={`toque inline-flex items-center justify-center rounded-md px-2 py-1 text-sm hover:bg-[var(--hover)] ${siguiendo ? "text-brand" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
      title={siguiendo ? "Dejar de seguir la página" : "Seguir la página (aviso cuando alguien la edite)"}
    >
      <Bell size={16} fill={siguiendo ? "currentColor" : "none"} />
    </button>
  );
}

/** Estrella de la cabecera: añade/quita la página de Favoritos. */
function FavoriteButton({ pageId }: { pageId: string }) {
  const utils = trpc.useUtils();
  const { data: favs } = trpc.favorites.list.useQuery();
  const isFav = (favs ?? []).some((f) => f.id === pageId);
  const toggle = trpc.pages.toggleFavorite.useMutation({
    onSuccess: () => utils.favorites.list.invalidate(),
  });
  return (
    <button
      onClick={() => toggle.mutate({ pageId })}
      disabled={toggle.isPending}
      className={`toque inline-flex items-center justify-center rounded-md px-2 py-1 text-sm hover:bg-[var(--hover)] ${isFav ? "text-brand" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
      title={isFav ? "Quitar de favoritos" : "Añadir a favoritos"}
    >
      <Star size={16} fill={isFav ? "currentColor" : "none"} />
    </button>
  );
}
