"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Columns2, Columns3, Database, Download, FileText, Lightbulb, Link as LinkIcon, Link2, ListTree, MessageSquare, Sigma, X } from "lucide-react";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import {
  BlockColorsItem,
  blockTypeSelectItems,
  DragHandleMenu,
  FloatingComposerController,
  FloatingThreadController,
  FormattingToolbar,
  FormattingToolbarController,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  ThreadsSidebar,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useBlockNoteEditor,
  useComponentsContext,
  useCreateBlockNote,
  useExtensionState,
  type BlockTypeSelectItem,
} from "@blocknote/react";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { es } from "@blocknote/core/locales";
import { CommentsExtension } from "@blocknote/core/comments";
import { withCollaboration } from "@blocknote/core/yjs";
import { useCollaboration } from "./useCollaboration";
import { Presence } from "./Presence";
import { CollabStatus } from "./CollabStatus";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { editorSchema, MentionMenu, subirArchivo, type NotionoPartialBlock } from "./mention";
import { emptyColumn } from "./columnBlock";
import { trpc } from "@/trpc/react";
import { toast } from "@/components/Toast";
import { downloadText } from "@/lib/download";
import { editorParaExport } from "./bloquesExport";
import { useTheme } from "@/lib/theme";
import { IconoPagina, PageIcon } from "@/components/PageIcon";
import { AddCoverButton, CoverBand } from "@/components/PageCover";

type SaveState = "saved" | "saving" | "idle";

/**
 * Item del menú del tirador: copia /p/<página>#<bloque>. Mismo patrón que los
 * items de serie de BlockNote (el bloque llega por el estado del SideMenu).
 */
function CopiarEnlaceBloqueItem({ pageId }: { pageId: string }) {
  const Components = useComponentsContext()!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bnEditor = useBlockNoteEditor<any, any, any>();
  const block = useExtensionState(SideMenuExtension, {
    editor: bnEditor,
    selector: (state) => state?.block,
  });
  if (!block) return null;
  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      onClick={() =>
        navigator.clipboard
          .writeText(`${location.origin}/p/${pageId}#${block.id}`)
          .then(() => toast("Enlace del bloque copiado"))
      }
    >
      Copiar enlace al bloque
    </Components.Generic.Menu.Item>
  );
}

export function Editor({
  pageId,
  initialTitle,
  initialContent,
  initialIcon,
  initialCover,
  fullWidth = false,
  canEdit = true,
}: {
  pageId: string;
  initialTitle: string;
  initialContent: unknown;
  initialIcon?: string | null;
  initialCover?: string | null;
  fullWidth?: boolean;
  canEdit?: boolean;
}) {
  const utils = trpc.useUtils();
  const theme = useTheme();
  const [title, setTitle] = useState(initialTitle);
  const [icon, setIcon] = useState<string | null>(initialIcon ?? null);
  const [cover, setCover] = useState<string | null>(initialCover ?? null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [showThreads, setShowThreads] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveContent = trpc.pages.updateContent.useMutation({
    onSuccess: () => setSaveState("saved"),
  });
  const rename = trpc.pages.rename.useMutation({
    onSuccess: () => utils.pages.tree.invalidate(),
  });
  const setCoverM = trpc.pages.setCover.useMutation();
  const createInlineDb = trpc.db.createInline.useMutation();
  const createSubpage = trpc.pages.create.useMutation({ onSuccess: () => utils.pages.tree.invalidate() });
  const linkPreview = trpc.pages.linkPreview.useMutation();

  const initial = useMemo<NotionoPartialBlock[] | undefined>(() => {
    const c = initialContent as NotionoPartialBlock[] | undefined;
    return Array.isArray(c) && c.length > 0 ? c : undefined;
  }, [initialContent]);

  // Edición simultánea: si la instalación tiene servidor de colaboración, el
  // documento se sincroniza en vivo; si no, el editor funciona como siempre.
  const { data: me } = trpc.auth.me.useQuery();

  // Enlace profundo a un bloque (/p/<id>#<bloque>): al abrir, desplazarse hasta él
  // y destacarlo. Con reintentos: el contenido puede tardar (colaboración, carga).
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    let intentos = 0;
    const timer = setInterval(() => {
      const el = document.querySelector<HTMLElement>(`.bn-block-outer[data-id="${CSS.escape(id)}"]`);
      if (el) {
        clearInterval(timer);
        el.scrollIntoView({ block: "center" });
        el.classList.add("bloque-enlazado");
        setTimeout(() => el.classList.remove("bloque-enlazado"), 2500);
      } else if (++intentos > 20) {
        clearInterval(timer);
      }
    }, 250);
    return () => clearInterval(timer);
  }, []);
  // Sin permiso de edición no se entra en la sala Yjs (el servidor tampoco daría
  // el token): se enseña la instantánea de content en solo lectura.
  const { collab, fallo: collabFallo } = useCollaboration(pageId, canEdit ? me : null);

  const editor = useCreateBlockNote(
    collab
      ? withCollaboration({
          dictionary: es,
          schema: editorSchema,
          uploadFile: subirArchivo,
          // Comentarios en línea: los hilos viven en el mismo documento compartido,
          // así que se sincronizan y se guardan con él, sin modelo aparte.
          extensions: [
            CommentsExtension({ threadStore: collab.threadStore, resolveUsers: collab.userStore }),
          ],
          collaboration: {
            // El proveedor expone awareness como null hasta conectar; el tipo de
            // BlockNote lo espera opcional.
            provider: collab.provider as unknown as { awareness: undefined },
            fragment: collab.fragment,
            user: collab.user,
            resolveUsers: collab.userStore,
            showCursorLabels: "activity",
          },
        })
      : { dictionary: es, schema: editorSchema, initialContent: initial, uploadFile: subirArchivo },
    [collab],
  );

  // Estrenar el documento compartido con lo que ya tenía la página. Lo hace el
  // navegador porque la conversión necesita el esquema del editor, y solo la
  // pestaña a la que el servidor le dio el turno, para no duplicar el contenido.
  useEffect(() => {
    const bloques = collab?.seed;
    if (!collab || !bloques?.length) return;
    const sembrar = () => {
      // Puede que ya no esté vacío: la copia local del navegador lo habrá llenado.
      if (collab.fragment.length > 0) return;
      editor.replaceBlocks(editor.document, bloques as never);
    };
    if (collab.provider.isSynced) sembrar();
    collab.provider.on("synced", sembrar);
    return () => {
      collab.provider.off("synced", sembrar);
    };
  }, [collab, editor]);

  function scheduleSave() {
    if (!canEdit) return;
    // En modo colaborativo el estado vive en el servidor de Yjs; aquí solo se
    // refresca la copia legible (Page.content) que usan búsqueda, publicación y
    // export. Todos los editores abiertos guardan lo mismo, así que es inocuo.
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveContent.mutate({ id: pageId, content: editor.document });
    }, 800);
  }

  function persist(nextTitle: string, nextIcon: string | null) {
    setSaveState("saving");
    rename.mutate(
      { id: pageId, title: nextTitle, icon: nextIcon },
      { onSuccess: () => setSaveState("saved") },
    );
  }

  function onTitleChange(v: string) {
    setTitle(v);
    setSaveState("saving");
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => persist(v, icon), 600);
  }

  function onIconChange(next: string | null) {
    setIcon(next);
    persist(title, next);
  }

  function onCoverChange(next: string | null) {
    setCover(next);
    setCoverM.mutate({ id: pageId, cover: next });
  }

  // Últimos valores a mano para el flush del desmontaje (el cleanup de [] ve
  // el primer render).
  const ultimo = useRef({ title, icon });
  ultimo.current = { title, icon };

  useEffect(() => {
    return () => {
      // Flushear, no descartar: navegar a otra página antes del debounce (600 y
      // 800 ms) perdía el último cambio de título/cuerpo. Las mutaciones de
      // React Query sobreviven al desmontaje.
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveContent.mutate({ id: pageId, content: editor.document });
      }
      if (titleTimer.current) {
        clearTimeout(titleTimer.current);
        rename.mutate({ id: pageId, title: ultimo.current.title, icon: ultimo.current.icon });
      }
    };
    // Solo al desmontar; editor, pageId y los mutate son estables en el montaje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {cover && <CoverBand cover={cover} onChange={onCoverChange} editable={canEdit} />}
      <div className={`mx-auto ${fullWidth ? "max-w-none" : "max-w-3xl"} px-4 pb-6 md:px-12 md:pb-14 ${cover ? "pt-3" : "pt-6 md:pt-14"}`}>
      <div className={`mb-3 flex h-6 items-center gap-2 font-mono text-[11px] text-[var(--muted)] ${cover ? "justify-end" : ""}`}>
        {/* Quién más está en la página ahora mismo, y si la conexión falla. */}
        {collab && <Presence provider={collab.provider} />}
        {(collab || collabFallo) && <CollabStatus provider={collab?.provider ?? null} />}
        {collab && (
          <button
            onClick={() => setShowThreads((v) => !v)}
            className={`flex items-center gap-1 rounded px-1.5 hover:bg-[var(--hover)] ${showThreads ? "text-brand" : ""}`}
            title="Comentarios del texto"
          >
            <MessageSquare size={12} />
          </button>
        )}
        {canEdit ? (
          saveState === "saving" ? (
            "Guardando…"
          ) : (
            <span className="flex items-center gap-1">
              Guardado <Check size={12} />
            </span>
          )
        ) : (
          "Solo lectura"
        )}
        <button
          onClick={() =>
            (() => {
              // Por el aplanador: columnas en secuencia y BD embebidas como enlace.
              const ed = editorParaExport(editor.document);
              downloadText(`${title.trim() || "Sin título"}.md`, ed.blocksToMarkdownLossy(ed.document), "text/markdown");
            })()
          }
          className="flex items-center gap-1 rounded px-1.5 hover:bg-[var(--hover)]"
          title="Exportar a Markdown"
        >
          <Download size={12} /> MD
        </button>
      </div>

      <div className="group/header">
        {icon && (
          <div className={`mb-1 ${cover ? "relative z-10 -mt-14" : ""}`}>
            <PageIcon icon={icon} onChange={onIconChange} editable={canEdit} />
          </div>
        )}
        {canEdit && (!icon || !cover) && (
          <div className="mb-1 flex h-7 items-center gap-1">
            {!icon && <PageIcon icon={null} onChange={onIconChange} editable={canEdit} />}
            {!cover && <AddCoverButton onChange={onCoverChange} />}
          </div>
        )}
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Sin título"
          readOnly={!canEdit}
          className="font-display mb-3 w-full bg-transparent text-4xl font-extrabold outline-none placeholder:text-[var(--border)] md:text-5xl"
        />
      </div>

      <BlockNoteView
        editor={editor}
        editable={canEdit}
        onChange={scheduleSave}
        slashMenu={false}
        formattingToolbar={false}
        sideMenu={false}
        theme={theme}
      >
        {/* Barra de formato con la Llamada en «Convertir en» (los bloques propios no salen solos). */}
        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar
              blockTypeSelectItems={[
                ...blockTypeSelectItems(editor.dictionary),
                { name: "Llamada", type: "callout", icon: Lightbulb } satisfies BlockTypeSelectItem,
              ]}
            />
          )}
        />
        {/* Menú del tirador: lo de siempre + copiar el enlace directo al bloque (#ancla). */}
        <SideMenuController
          sideMenu={(props) => (
            <SideMenu
              {...props}
              dragHandleMenu={() => (
                <DragHandleMenu>
                  <RemoveBlockItem>Eliminar</RemoveBlockItem>
                  <BlockColorsItem>Colores</BlockColorsItem>
                  <CopiarEnlaceBloqueItem pageId={pageId} />
                </DragHandleMenu>
              )}
            />
          )}
        />
        {/* Comentar una selección: el compositor y el hilo flotante solo existen
            con la edición simultánea activa, que es donde viven los hilos. */}
        {collab && (
          <>
            <FloatingComposerController />
            <FloatingThreadController />
            {showThreads && (
              <aside className="fixed right-4 top-24 z-30 max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--background)] p-2 shadow-xl">
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                    Comentarios del texto
                  </span>
                  <button onClick={() => setShowThreads(false)} className="text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar">
                    <X size={14} />
                  </button>
                </div>
                <ThreadsSidebar filter="open" sort="position" />
              </aside>
            )}
          </>
        )}
        <MentionMenu editor={editor} pageId={pageId} />
        {/* Menú "/" propio: los ítems por defecto + "Base de datos" embebida. */}
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [
                ...getDefaultReactSlashMenuItems(editor),
                {
                  title: "Llamada",
                  subtext: "Bloque destacado con icono",
                  aliases: ["callout", "llamada", "destacado", "aviso", "nota"],
                  group: "Bloques básicos",
                  icon: <Lightbulb size={18} />,
                  onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "callout" }),
                },
                {
                  title: "Enlace web",
                  subtext: "Tarjeta con la vista previa, o el vídeo incrustado",
                  aliases: ["enlace", "link", "bookmark", "marcador", "youtube", "video", "vídeo", "embed"],
                  group: "Bloques básicos",
                  icon: <LinkIcon size={18} />,
                  onItemClick: async () => {
                    const url = prompt("Pega la dirección del enlace o del vídeo");
                    if (!url?.trim()) return;
                    // Si la vista previa falla (sitio caído o que bloquea bots), se inserta igual con la URL.
                    const preview = await linkPreview
                      .mutateAsync({ url: url.trim() })
                      .catch(() => ({ url: url.trim(), title: url.trim(), description: "", image: "", siteName: "" }));
                    insertOrUpdateBlockForSlashMenu(editor, { type: "bookmark", props: preview });
                  },
                },
                ...[2, 3].map((n) => ({
                  title: n === 2 ? "Dos columnas" : "Tres columnas",
                  subtext: "Reparte el ancho de la página",
                  aliases: ["columna", "columnas", "column", "lado", n === 2 ? "dos" : "tres"],
                  group: "Bloques básicos",
                  icon: n === 2 ? <Columns2 size={18} /> : <Columns3 size={18} />,
                  onItemClick: () => {
                    insertOrUpdateBlockForSlashMenu(editor, {
                      type: "columnList",
                      children: Array.from({ length: n }, emptyColumn),
                    });
                    // El cursor al primer hueco, para poder escribir sin buscarlo.
                    const lista = editor.getTextCursorPosition().block;
                    const primero = lista.children?.[0]?.children?.[0];
                    if (primero) editor.setTextCursorPosition(primero, "end");
                  },
                })),
                {
                  title: "Subpágina",
                  subtext: "Crea una página hija y la enlaza aquí",
                  aliases: ["subpagina", "subpágina", "pagina", "página", "page"],
                  group: "Bloques básicos",
                  icon: <FileText size={18} />,
                  onItemClick: async () => {
                    // Como en Notion: la página nace colgando de esta y queda enlazada
                    // en el sitio del cursor (la mención ya navega y sigue renombrados).
                    const nueva = await createSubpage.mutateAsync({ parentId: pageId, title: "" });
                    insertOrUpdateBlockForSlashMenu(editor, {
                      type: "paragraph",
                      content: [{ type: "mention", props: { pageId: nueva.id, title: "Sin título", icon: "" } }],
                    });
                  },
                },
                {
                  title: "Ecuación",
                  subtext: "Fórmula matemática en TeX (KaTeX)",
                  aliases: ["ecuacion", "ecuación", "formula", "fórmula", "matematicas", "matemáticas", "latex", "katex", "math"],
                  group: "Bloques básicos",
                  icon: <Sigma size={18} />,
                  onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "equation" }),
                },
                {
                  title: "Tabla de contenidos",
                  subtext: "Índice de los encabezados de la página",
                  aliases: ["toc", "indice", "índice", "contenidos", "tabla de contenidos"],
                  group: "Bloques básicos",
                  icon: <ListTree size={18} />,
                  onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "toc" }),
                },
                {
                  title: "Base de datos",
                  subtext: "Tabla embebida en esta página",
                  aliases: ["bd", "db", "tabla", "database", "base de datos"],
                  group: "Bases de datos",
                  icon: <Database size={18} />,
                  onItemClick: async () => {
                    const { pageId: dbPageId, collectionId } = await createInlineDb.mutateAsync();
                    insertOrUpdateBlockForSlashMenu(editor, {
                      type: "database",
                      props: { collectionId, pageId: dbPageId },
                    });
                  },
                },
                // Vista enlazada: apunta a una BD que ya existe, no crea otra.
                ...(await utils.db.listDatabases.fetch()).map((d) => ({
                  title: `Enlazar: ${d.title || "Sin título"}`,
                  subtext: "Vista de una base de datos que ya existe",
                  aliases: ["enlazar", "linked", "vista", d.title?.toLowerCase() ?? ""],
                  group: "Bases de datos",
                  icon: <Link2 size={18} />,
                  onItemClick: () =>
                    insertOrUpdateBlockForSlashMenu(editor, {
                      type: "database",
                      props: { collectionId: d.collectionId, pageId: d.pageId },
                    }),
                })),
              ],
              query,
            )
          }
        />
      </BlockNoteView>
      <Backlinks pageId={pageId} />
      </div>
    </div>
  );
}

/** "Enlaces entrantes": otras páginas que mencionan a esta. Oculto si no hay ninguna. */
function Backlinks({ pageId }: { pageId: string }) {
  const { data } = trpc.pages.backlinks.useQuery({ id: pageId });
  if (!data?.length) return null;
  return (
    <div className="mt-10 border-t border-[var(--border)] pt-3">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
        {data.length} enlace{data.length > 1 ? "s" : ""} entrante{data.length > 1 ? "s" : ""}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {data.map((p) => (
          <li key={p.id}>
            <Link href={`/p/${p.id}`} className="flex items-center gap-1.5 py-0.5 text-sm hover:text-[var(--foreground)]">
              <span className="flex items-center text-[var(--muted)]">
                {p.icon ? <IconoPagina icon={p.icon} size={14} /> : p.type === "database" ? <Database size={14} /> : <FileText size={14} />}
              </span>
              {p.title || "Sin título"}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
