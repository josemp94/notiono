"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Database, FileText, Grid2x2, GripVertical, Lightbulb, Link2, MessageSquareQuote, X } from "lucide-react";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import {
  blockTypeSelectItems,
  FloatingComposerController,
  FloatingThreadController,
  FormattingToolbar,
  FormattingToolbarController,
  SideMenu,
  SideMenuController,
  ThreadsSidebar,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
  type BlockTypeSelectItem,
  type SideMenuProps,
} from "@blocknote/react";
import { es } from "@blocknote/core/locales";
import { CommentsExtension } from "@blocknote/core/comments";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { withCollaboration } from "@blocknote/core/yjs";
import { useCollaboration } from "./useCollaboration";
import { Presence } from "./Presence";
import { CollabStatus } from "./CollabStatus";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { editorSchema, MentionMenu, subirArchivo, type NotionoPartialBlock } from "./mention";
import { itemEcuacion, itemEnlaceWeb, itemIndice, itemLlamada, itemsColumnas } from "./menuBarra";
import { trpc } from "@/trpc/react";
import { instalarDropDeColumnas } from "./columnDrop";
import { useTheme } from "@/lib/theme";
import { IconoPagina, PageIcon } from "@/components/PageIcon";
import { AddCoverButton, CoverBand } from "@/components/PageCover";
import { TituloGrande } from "@/components/TituloGrande";
import { HojaBloque, MenuTirador, useAccionesBloque } from "./menuTirador";
import { arrastreDeBloques, idsArrastrados, MOVER_BLOQUES_EVENT } from "@/lib/subpaginas";
import { toast } from "@/components/Toast";

/** Lo que la página puede pedirle al editor desde fuera (restaurar una versión). */
export type EditorApi = { reemplazar: (bloques: unknown[]) => void };

export function Editor({
  pageId,
  initialTitle,
  initialContent,
  initialIcon,
  initialCover,
  fullWidth = false,
  canEdit = true,
  onApi,
  barraId = "barra-editor",
}: {
  pageId: string;
  initialTitle: string;
  initialContent: unknown;
  initialIcon?: string | null;
  initialCover?: string | null;
  fullWidth?: boolean;
  canEdit?: boolean;
  onApi?: (api: EditorApi | null) => void;
  /** Hueco de la barra donde van presencia y estado (el panel lateral trae el suyo). */
  barraId?: string;
}) {
  const utils = trpc.useUtils();
  const theme = useTheme();
  const [title, setTitle] = useState(initialTitle);
  const [icon, setIcon] = useState<string | null>(initialIcon ?? null);
  const [cover, setCover] = useState<string | null>(initialCover ?? null);
  const [showThreads, setShowThreads] = useState(false);
  // El hueco de la barra superior de la página donde va la presencia (page.tsx).
  const [barra, setBarra] = useState<HTMLElement | null>(null);
  useEffect(() => setBarra(document.getElementById(barraId)), [barraId]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveContent = trpc.pages.updateContent.useMutation();
  const rename = trpc.pages.rename.useMutation({
    onSuccess: () => utils.pages.tree.invalidate(),
  });
  const setCoverM = trpc.pages.setCover.useMutation();
  const createInlineDb = trpc.db.createInline.useMutation();
  const desdePlantilla = trpc.pages.createFromTemplate.useMutation();
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

  const acciones = useAccionesBloque(editor, pageId);
  // El menú del tirador tiene que ser SIEMPRE el mismo componente: si cambia en cada
  // render del editor (abrir un diálogo, guardar…), Mantine lo desmonta a medio abrir
  // y el siguiente clic en los 6 puntos ya no lo abría.
  const ejecutar = useRef(acciones.ejecutar);
  useEffect(() => {
    ejecutar.current = acciones.ejecutar;
  });
  const colaborativo = !!collab;
  const MenuDelTirador = useMemo(
    () =>
      function MenuDelTirador() {
        return <MenuTirador pageId={pageId} colaborativo={colaborativo} onAccion={(a, b) => ejecutar.current(a, b)} />;
      },
    [pageId, colaborativo],
  );
  const BarraDelTirador = useMemo(
    () =>
      function BarraDelTirador(props: SideMenuProps) {
        return <SideMenu {...props} dragHandleMenu={MenuDelTirador} />;
      },
    [MenuDelTirador],
  );

  // Bloques soltados en una página del panel lateral: se mueven allí (si son de este editor).
  const moverBloques = acciones.moverBloques;
  useEffect(() => {
    if (!canEdit) return;
    const h = (e: Event) => {
      const { ids, destino } = (e as CustomEvent<{ ids: string[]; destino: string }>).detail;
      const mios = ids.filter((id) => editor.getBlock(id));
      if (mios.length) void moverBloques(mios, destino);
    };
    window.addEventListener(MOVER_BLOQUES_EVENT, h);
    return () => window.removeEventListener(MOVER_BLOQUES_EVENT, h);
  }, [editor, canEdit, moverBloques]);

  // Al arrastrar con los 6 puntos, apuntar qué bloques viajan: el panel lateral los
  // recoge al soltarlos sobre una página (el navegador no deja leer el arrastre hasta soltar).
  useEffect(() => {
    if (!canEdit) return;
    const inicio = (e: DragEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.(".bn-side-menu")) return;
      let ids = idsArrastrados(e.dataTransfer?.getData("blocknote/html") ?? "").filter((id) => editor.getBlock(id));
      // Sin datos legibles, el bloque del tirador (el que BlockNote está arrastrando).
      if (!ids.length) {
        const b = (editor.getExtension(SideMenuExtension)?.store.state as { block?: { id: string } } | undefined)?.block;
        if (b && editor.getBlock(b.id)) ids = [b.id];
      }
      if (ids.length) arrastreDeBloques.ids = ids;
    };
    const fin = () => setTimeout(() => (arrastreDeBloques.ids = null), 0);
    document.addEventListener("dragstart", inicio);
    document.addEventListener("dragend", fin);
    return () => {
      document.removeEventListener("dragstart", inicio);
      document.removeEventListener("dragend", fin);
    };
  }, [editor, canEdit]);

  // En táctil no hay tirador de ratón (globals.css): al tocar un bloque sale uno compacto
  // a su derecha que abre las mismas acciones en una hoja, como la app de Notion.
  const [tiradorTactil, setTiradorTactil] = useState<{ id: string; top: number } | null>(null);
  const [hoja, setHoja] = useState<string | null>(null);
  useEffect(() => {
    if (!canEdit) return;
    const coloca = () => {
      const zona = zonaDropColumnas.current;
      if (!zona || !matchMedia("(pointer: coarse)").matches || !editor.isFocused()) return setTiradorTactil(null);
      const id = editor.getTextCursorPosition().block.id;
      const el = zona.querySelector(`.bn-block-outer[data-id="${CSS.escape(id)}"] > .bn-block > .bn-block-content`);
      if (!el) return setTiradorTactil(null);
      setTiradorTactil({ id, top: el.getBoundingClientRect().top - zona.getBoundingClientRect().top });
    };
    const quitar = () => setTimeout(() => !editor.isFocused() && setTiradorTactil(null), 150);
    const offSel = editor.onSelectionChange(coloca);
    const offCambio = editor.onChange(coloca);
    const dom = editor.domElement;
    dom?.addEventListener("focusout", quitar);
    return () => {
      offSel?.();
      offCambio?.();
      dom?.removeEventListener("focusout", quitar);
    };
  }, [editor, canEdit]);
  const bloqueHoja = hoja ? (editor.getBlock(hoja) as Parameters<typeof acciones.ejecutar>[1] | undefined) : undefined;

  // Ctrl+D duplica el bloque (o los bloques seleccionados), como en Notion.
  function alTeclear(e: React.KeyboardEvent) {
    if (!canEdit || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "d" || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void acciones.duplicar(editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block]);
  }

  // Soltar un bloque en la franja lateral de otro crea columnas (ver columnDrop.ts).
  const zonaDropColumnas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = zonaDropColumnas.current;
    if (!el || !canEdit) return;
    return instalarDropDeColumnas(editor as never, el);
  }, [editor, canEdit]);

  // Estrenar el documento compartido con lo que ya tenía la página. Lo hace el
  // navegador porque la conversión necesita el esquema del editor, y solo la
  // pestaña a la que el servidor le dio el turno, para no duplicar el contenido.
  useEffect(() => {
    const bloques = collab?.seed;
    if (!collab || !bloques?.length) return;
    const sembrar = () => {
      // Puede que ya no esté vacío: la copia local del navegador lo habrá llenado.
      if (collab.fragment.length === 0) editor.replaceBlocks(editor.document, bloques as never);
      collab.semillaUsada();
    };
    if (collab.provider.isSynced) sembrar();
    collab.provider.on("synced", sembrar);
    return () => {
      collab.provider.off("synced", sembrar);
    };
  }, [collab, editor]);

  // Borrar el enlace a una subpágina la manda a la papelera (lo decide el servidor de
  // colaboración y avisa a las pestañas de quien lo hizo): árbol al día y «Deshacer».
  const restaurarPagina = trpc.pages.restore.useMutation({
    onSuccess: () => Promise.all([utils.pages.tree.invalidate(), utils.pages.trash.invalidate()]),
  }).mutate;
  useEffect(() => {
    if (!collab) return;
    const alAviso = ({ payload }: { payload: string }) => {
      let aviso: { tipo?: string; pageId?: string; title?: string };
      try {
        aviso = JSON.parse(payload);
      } catch {
        return;
      }
      if (aviso.tipo !== "subpagina-papelera" && aviso.tipo !== "subpagina-restaurada") return;
      void utils.pages.tree.invalidate();
      void utils.pages.trash.invalidate();
      const id = aviso.pageId;
      if (aviso.tipo === "subpagina-papelera" && id)
        toast(`«${aviso.title || "Sin título"}» movida a la papelera`, { etiqueta: "Deshacer", onClick: () => restaurarPagina({ id }) });
    };
    collab.provider.on("stateless", alAviso);
    return () => {
      collab.provider.off("stateless", alAviso);
    };
  }, [collab, utils, restaurarPagina]);

  // Restaurar una versión pasa por el editor: con edición simultánea el
  // documento vive en Yjs y cambiar solo Page.content no se veía (al volver a
  // montar, el editor cargaba el estado compartido de antes y el siguiente
  // guardado pisaba la restauración). Así llega a todos y se guarda solo.
  useEffect(() => {
    if (!onApi) return;
    onApi({ reemplazar: (bloques) => editor.replaceBlocks(editor.document, bloques as never) });
    return () => onApi(null);
  }, [onApi, editor]);

  function scheduleSave() {
    if (!canEdit) return;
    // En modo colaborativo el estado vive en el servidor de Yjs; aquí solo se
    // refresca la copia legible (Page.content) que usan búsqueda, publicación y
    // export. Todos los editores abiertos guardan lo mismo, así que es inocuo.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveContent.mutate({ id: pageId, content: editor.document });
    }, 800);
  }

  function persist(nextTitle: string, nextIcon: string | null) {
    rename.mutate({ id: pageId, title: nextTitle, icon: nextIcon });
  }

  function onTitleChange(v: string) {
    setTitle(v);
    // El panel lateral y la miga de pan, al momento (el guardado va con retardo).
    utils.pages.tree.setData(undefined, (t) => t?.map((p) => (p.id === pageId ? { ...p, title: v } : p)));
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => persist(v, icon), 600);
  }

  /** Del título al primer bloque del cuerpo, como Enter en Notion. */
  function alCuerpo() {
    if (!canEdit) return;
    const primero = editor.document[0];
    if (primero) editor.setTextCursorPosition(primero, "start");
    editor.focus();
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
      <div className={`mx-auto ${fullWidth ? "max-w-none" : "max-w-3xl"} px-4 pb-6 md:px-12 md:pb-14 ${cover ? "pt-3" : "pt-8 md:pt-20"}`}>
      {/* Sin la fila de «Guardado ✓ · MD» de antes: Notion guarda sin avisar, y
          exportar a Markdown vive en el menú «⋯» de la página. Lo que sí importa
          —quién más está y si la conexión se ha caído— va a la barra superior. */}
      {barra &&
        createPortal(
          <>
            {collab && <Presence provider={collab.provider} />}
            {(collab || collabFallo) && <CollabStatus provider={collab?.provider ?? null} />}
            {!canEdit && <span>Solo lectura</span>}
            {collab && (
              <button
                onClick={() => setShowThreads((v) => !v)}
                className={`toque hidden items-center justify-center rounded-md px-2 py-1 hover:bg-[var(--hover)] md:flex ${showThreads ? "text-brand" : ""}`}
                title="Comentarios en el texto"
              >
                <MessageSquareQuote size={16} />
              </button>
            )}
          </>,
          barra,
        )}

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
        <TituloGrande
          value={title}
          onChange={onTitleChange}
          onEnter={alCuerpo}
          readOnly={!canEdit}
          autoFocus={canEdit && !initialTitle && !initial}
          className="mb-2 text-[2rem] md:text-[2.5rem]"
        />
      </div>

      <div ref={zonaDropColumnas} onKeyDownCapture={alTeclear} className="relative">
      {tiradorTactil && (
        <button
          // Sin quitarle el foco al editor: si no, el tirador desaparecería bajo el dedo.
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setHoja(tiradorTactil.id)}
          style={{ top: tiradorTactil.top }}
          className="absolute -right-3.5 z-10 flex h-7 w-5 items-center justify-center rounded text-[var(--muted)] active:bg-[var(--hover)]"
          aria-label="Acciones del bloque"
          title="Acciones del bloque"
        >
          <GripVertical size={16} />
        </button>
      )}
      {bloqueHoja && (
        <HojaBloque block={bloqueHoja} pageId={pageId} colaborativo={!!collab} onAccion={acciones.ejecutar} onClose={() => setHoja(null)} />
      )}
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
        {/* Menú del tirador (6 puntos), como el de Notion: ver menuTirador.tsx. */}
        <SideMenuController sideMenu={BarraDelTirador} />
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
                itemLlamada(editor),
                itemEnlaceWeb(editor, (url) => linkPreview.mutateAsync({ url })),
                ...itemsColumnas(editor),
                {
                  title: "Subpágina",
                  subtext: "Crea una página hija y la enlaza aquí",
                  aliases: ["subpagina", "subpágina", "pagina", "página", "page"],
                  group: "Bloques básicos",
                  icon: <FileText size={18} />,
                  onItemClick: async () => {
                    // Como en Notion: la página nace colgando de esta y queda enlazada
                    // en el sitio del cursor (la mención ya navega y sigue renombrados).
                    // El enlace lo pone el editor en el cursor; el servidor, que lo pondría al final, no.
                    const nueva = await createSubpage.mutateAsync({ parentId: pageId, title: "", enlazar: false });
                    insertOrUpdateBlockForSlashMenu(editor, {
                      type: "paragraph",
                      content: [{ type: "mention", props: { pageId: nueva.id, title: "", icon: "" } }],
                    });
                  },
                },
                itemEcuacion(editor),
                itemIndice(editor),
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
                {
                  title: "Matriz de Eisenhower",
                  subtext: "Urgente × Importante: las tareas se colocan solas",
                  aliases: ["eisenhower", "matriz", "urgente", "importante", "prioridades"],
                  group: "Bases de datos",
                  icon: <Grid2x2 size={18} />,
                  onItemClick: async () => {
                    const r = await desdePlantilla.mutateAsync({ key: "eisenhower", embebida: true });
                    if ("collectionId" in r)
                      insertOrUpdateBlockForSlashMenu(editor, { type: "database", props: { collectionId: r.collectionId, pageId: r.id } });
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
      </div>
      {acciones.dialogos}
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
