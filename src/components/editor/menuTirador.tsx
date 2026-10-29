"use client";

/**
 * El menú del tirador (los 6 puntos de cada bloque), como el de Notion: buscador
 * arriba, Convertir en, Color, Duplicar, Mover a, Copiar enlace, Comentar y Eliminar,
 * y para los bloques de página (párrafo con solo la mención de una página, ver
 * src/lib/subpaginas.ts), además Abrir en nueva pestaña o en el panel lateral,
 * Renombrar, Icono y Favoritos. Con un bloque de subpágina, «Mover a» y «Duplicar»
 * actúan sobre LA PÁGINA (el servidor recoloca el enlace), nunca dejan dos.
 *
 * Todo pasa por la API del editor (getBlock, updateBlock, insertBlocks…), nunca por
 * el DOM que pinta ProseMirror.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight, ChevronRight, Code, Copy, FileText, FolderInput, Heading1, Heading2, Heading3, Lightbulb, Link2,
  List, ListChecks, ListOrdered, MessageSquare, Palette, PanelRight, Pencil, PenLine, Quote, Repeat, SmilePlus, Star, StarOff, Trash2, Type,
} from "lucide-react";
import { useBlockNoteEditor, useComponentsContext, useExtensionState, usePortalElement } from "@blocknote/react";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { CommentsExtension } from "@blocknote/core/comments";
import { trpc } from "@/trpc/react";
import { toast } from "@/components/Toast";
import { SelectorIcono } from "@/components/PageIcon";
import { MovePageModal } from "@/components/MovePage";
import { abrirEnPanel } from "@/lib/vistazo";
import { enlaceDe } from "@/lib/subpaginas";
import { abrirAlMontar } from "./drawingBlock";

/** Bloque tal como lo da el editor (solo lo que se usa aquí). */
type Bloque = { id: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: Bloque[] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ed = any;

/** Tipos de «Convertir en»: los de texto del menú «/», con los nuestros (Llamada) y «Página». */
const CONVERTIR: { etiqueta: string; type: string; props?: Record<string, unknown>; icono: React.ReactNode }[] = [
  { etiqueta: "Texto", type: "paragraph", icono: <Type size={16} /> },
  { etiqueta: "Página", type: "pagina", icono: <FileText size={16} /> },
  { etiqueta: "Encabezado 1", type: "heading", props: { level: 1, isToggleable: false }, icono: <Heading1 size={16} /> },
  { etiqueta: "Encabezado 2", type: "heading", props: { level: 2, isToggleable: false }, icono: <Heading2 size={16} /> },
  { etiqueta: "Encabezado 3", type: "heading", props: { level: 3, isToggleable: false }, icono: <Heading3 size={16} /> },
  { etiqueta: "Lista con viñetas", type: "bulletListItem", icono: <List size={16} /> },
  { etiqueta: "Lista numerada", type: "numberedListItem", icono: <ListOrdered size={16} /> },
  { etiqueta: "Lista de tareas", type: "checkListItem", icono: <ListChecks size={16} /> },
  { etiqueta: "Lista desplegable", type: "toggleListItem", icono: <ChevronRight size={16} /> },
  { etiqueta: "Cita", type: "quote", icono: <Quote size={16} /> },
  { etiqueta: "Código", type: "codeBlock", icono: <Code size={16} /> },
  { etiqueta: "Llamada", type: "callout", icono: <Lightbulb size={16} /> },
  { etiqueta: "Dibujo", type: "drawing", icono: <PenLine size={16} /> },
];
/** Los colores de BlockNote, con su nombre como en Notion. */
const COLORES = [
  ["default", "Predeterminado"], ["gray", "Gris"], ["brown", "Marrón"], ["red", "Rojo"], ["orange", "Naranja"],
  ["yellow", "Amarillo"], ["green", "Verde"], ["blue", "Azul"], ["purple", "Morado"], ["pink", "Rosa"],
] as const;

/** Los que tienen texto que convertir (a los demás —imágenes, tablas, BD…— no se les ofrece). */
const CON_TEXTO = new Set(["paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem", "quote", "codeBlock", "callout"]);

export type Accion =
  | "duplicar" | "mover" | "copiarEnlace" | "comentar" | "eliminar"
  | "pestana" | "panel" | "renombrar" | "icono" | "favorito"
  | { convertir: number }
  | { color: "textColor" | "backgroundColor"; valor: string };

const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

/** Texto plano de un bloque (para el título al convertirlo en página). */
const textoDe = (b: Bloque): string =>
  Array.isArray(b.content)
    ? (b.content as { type: string; text?: string; content?: { text?: string }[] }[])
        .map((c) => c.text ?? (c.content ?? []).map((x) => x.text ?? "").join(""))
        .join("")
    : "";

type Item = { id: string; etiqueta: string; icono: React.ReactNode; accion: Accion; atajo?: string; peligro?: boolean };

/** Lo que se ofrece para un bloque: lo comparten el menú del tirador y la hoja del móvil. */
function useItemsBloque(block: Bloque | undefined, pageId: string, colaborativo: boolean) {
  const { data: tree } = trpc.pages.tree.useQuery();
  const { data: favs } = trpc.favorites.list.useQuery();
  if (!block) return { deEnlace: [], comunes: [], convertir: [], eliminar: null, colores: false };
  const enlazada = enlaceDe(block);
  const pagina = enlazada ? tree?.find((p) => p.id === enlazada) : undefined;
  const esHija = pagina?.parentId === pageId;
  const favorita = !!enlazada && (favs ?? []).some((f) => f.id === enlazada);
  const conTexto = CON_TEXTO.has(block.type);
  const colores = "textColor" in (block.props ?? {}) || "backgroundColor" in (block.props ?? {});

  const deEnlace: Item[] = enlazada
    ? [
        { id: "pestana", etiqueta: "Abrir en nueva pestaña", icono: <ArrowUpRight size={16} />, accion: "pestana" },
        { id: "panel", etiqueta: "Abrir en panel lateral", icono: <PanelRight size={16} />, accion: "panel", atajo: "Alt+clic" },
        { id: "renombrar", etiqueta: "Renombrar", icono: <Pencil size={16} />, accion: "renombrar" },
        { id: "icono", etiqueta: "Icono", icono: <SmilePlus size={16} />, accion: "icono" },
        {
          id: "favorito",
          etiqueta: favorita ? "Quitar de Favoritos" : "Añadir a Favoritos",
          icono: favorita ? <StarOff size={16} /> : <Star size={16} />,
          accion: "favorito",
        },
      ]
    : [];
  const comunes: Item[] = [
    { id: "duplicar", etiqueta: "Duplicar", icono: <Copy size={16} />, accion: "duplicar", atajo: `${mod}D` },
    { id: "mover", etiqueta: esHija ? "Mover página a…" : "Mover a…", icono: <FolderInput size={16} />, accion: "mover" },
    { id: "copiarEnlace", etiqueta: "Copiar enlace al bloque", icono: <Link2 size={16} />, accion: "copiarEnlace" },
    ...(colaborativo && conTexto ? [{ id: "comentar", etiqueta: "Comentar", icono: <MessageSquare size={16} />, accion: "comentar" as const }] : []),
  ];
  const eliminar: Item = { id: "eliminar", etiqueta: "Eliminar", icono: <Trash2 size={16} />, accion: "eliminar", atajo: "Supr", peligro: true };
  const convertir: Item[] = conTexto
    ? CONVERTIR.map((c, i) => ({ id: `convertir-${i}`, etiqueta: c.etiqueta, icono: c.icono, accion: { convertir: i } }))
        .filter((c) => !(enlazada && CONVERTIR[(c.accion as { convertir: number }).convertir].type === "pagina"))
    : [];

  return { deEnlace, comunes, convertir, eliminar, colores };
}

/** El menú en sí: se pinta dentro del desplegable del tirador de BlockNote (Mantine). */
export function MenuTirador({
  pageId,
  colaborativo,
  onAccion,
}: {
  pageId: string;
  colaborativo: boolean;
  onAccion: (accion: Accion, bloque: Bloque) => void;
}) {
  const Components = useComponentsContext()!;
  const portalElement = usePortalElement();
  const editor = useBlockNoteEditor<Ed, Ed, Ed>();
  const block = useExtensionState(SideMenuExtension, { editor, selector: (s) => s?.block }) as Bloque | undefined;
  const items = useItemsBloque(block, pageId, colaborativo);
  const [q, setQ] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLInputElement>(null);
  // Al abrir, el foco al buscador: la trampa de foco de Mantine lo pone en un hueco
  // suyo del principio del menú al acabar de abrirse; de ahí se pasa a la caja.
  useEffect(() => {
    const aCaja = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (t.getAttribute?.("role") === "presentation" && t.parentElement?.classList.contains("menu-tirador")) caja.current?.focus();
    };
    document.addEventListener("focusin", aCaja);
    const t = setTimeout(() => caja.current?.focus(), 60);
    return () => {
      document.removeEventListener("focusin", aCaja);
      clearTimeout(t);
    };
  }, []);
  if (!block) return null;

  const { deEnlace, comunes, convertir, colores } = items;
  const eliminar = items.eliminar!;

  const pinta = (it: Item, etiqueta = it.etiqueta) => (
    <Components.Generic.Menu.Item
      key={it.id}
      className={`bn-menu-item menu-tirador-item${it.peligro ? " menu-tirador-peligro" : ""}`}
      icon={it.icono}
      onClick={() => onAccion(it.accion, block)}
    >
      <span data-accion={it.id} className="flex w-full items-center justify-between gap-4">
        <span>{etiqueta}</span>
        {it.atajo && <span className="text-xs text-[var(--muted)]">{it.atajo}</span>}
      </span>
    </Components.Generic.Menu.Item>
  );

  const buscar = q.trim().toLowerCase();
  // Buscando, todo en una lista plana (los tipos como «Convertir en Cita»), como Notion.
  const encontrados = buscar
    ? [...deEnlace, ...comunes, ...convertir.map((c) => ({ ...c, etiqueta: `Convertir en ${c.etiqueta}` })), eliminar].filter((it) =>
        it.etiqueta.toLowerCase().includes(buscar),
      )
    : [];

  // Atajos con el menú abierto: pulsan el elemento (así Mantine cierra el menú como con
  // un clic). Intro, el primero de la búsqueda, como Notion.
  const atajos = (e: React.KeyboardEvent) => {
    const pulsa = (sel: string) => {
      e.preventDefault();
      raiz.current?.querySelector<HTMLElement>(sel)?.click();
    };
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") pulsa('[data-accion="duplicar"]');
    else if ((e.key === "Delete" || e.key === "Backspace") && !(e.target instanceof HTMLInputElement && e.target.value)) pulsa('[data-accion="eliminar"]');
    else if (e.key === "Enter" && e.target instanceof HTMLInputElement && buscar) pulsa("[data-accion]");
  };

  return (
    <Components.Generic.Menu.Dropdown className="bn-menu-dropdown bn-drag-handle-menu menu-tirador">
      <div ref={raiz} onKeyDown={atajos}>
        <input
          ref={caja}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          // Mantine navega con las flechas; las letras y el espacio son del buscador.
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Escape") return;
            atajos(e);
            e.stopPropagation();
          }}
          placeholder="Buscar acciones…"
          className="mb-1 w-full rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-brand"
        />
        {buscar ? (
          encontrados.length ? encontrados.map((it) => pinta(it)) : <div className="px-2 py-1.5 text-sm text-[var(--muted)]">Sin resultados</div>
        ) : (
          <>
            {deEnlace.map((it) => pinta(it))}
            {deEnlace.length > 0 && <Components.Generic.Menu.Divider className="bn-menu-divider" />}
            {convertir.length > 0 && (
              <Components.Generic.Menu.Root position="right" sub={true} portalElement={portalElement}>
                <Components.Generic.Menu.Trigger sub={true}>
                  <Components.Generic.Menu.Item className="bn-menu-item menu-tirador-item" subTrigger={true} icon={<Repeat size={16} />}>
                    Convertir en
                  </Components.Generic.Menu.Item>
                </Components.Generic.Menu.Trigger>
                <Components.Generic.Menu.Dropdown sub={true} className="bn-menu-dropdown menu-tirador">
                  {convertir.map((it) => pinta(it))}
                </Components.Generic.Menu.Dropdown>
              </Components.Generic.Menu.Root>
            )}
            {colores && (
              <Components.Generic.Menu.Root position="right" sub={true} portalElement={portalElement}>
                <Components.Generic.Menu.Trigger sub={true}>
                  <Components.Generic.Menu.Item className="bn-menu-item menu-tirador-item" subTrigger={true} icon={<Palette size={16} />}>
                    Color
                  </Components.Generic.Menu.Item>
                </Components.Generic.Menu.Trigger>
                <Components.Generic.Menu.Dropdown sub={true} className="bn-menu-dropdown menu-tirador">
                  {(["textColor", "backgroundColor"] as const).filter((k) => k in (block.props ?? {})).map((k) => (
                    <div key={k}>
                      <Components.Generic.Menu.Label className="bn-menu-label">{k === "textColor" ? "Texto" : "Fondo"}</Components.Generic.Menu.Label>
                      {COLORES.map(([c, nombre]) => (
                        <Components.Generic.Menu.Item
                          key={c}
                          className="bn-menu-item menu-tirador-item"
                          icon={
                            <span
                              data-text-color={k === "textColor" ? c : undefined}
                              data-background-color={k === "backgroundColor" ? c : undefined}
                              className="flex size-5 items-center justify-center rounded border border-[var(--border)] text-xs font-semibold"
                            >
                              A
                            </span>
                          }
                          checked={(block.props?.[k] ?? "default") === c}
                          onClick={() => onAccion({ color: k, valor: c }, block)}
                        >
                          {nombre}
                        </Components.Generic.Menu.Item>
                      ))}
                    </div>
                  ))}
                </Components.Generic.Menu.Dropdown>
              </Components.Generic.Menu.Root>
            )}
            {comunes.map((it) => pinta(it))}
            <Components.Generic.Menu.Divider className="bn-menu-divider" />
            {pinta(eliminar)}
          </>
        )}
      </div>
    </Components.Generic.Menu.Dropdown>
  );
}

/**
 * Lo que hacen las acciones (y sus diálogos: mover, renombrar, icono). Lo usa el
 * menú del tirador y el atajo Ctrl+D del editor.
 */
export function useAccionesBloque(editor: Ed, pageId: string) {
  const utils = trpc.useUtils();
  const [dialogo, setDialogo] = useState<
    | { tipo: "moverPagina"; pagina: string }
    | { tipo: "moverBloques"; ids: string[] }
    | { tipo: "renombrar"; pagina: string }
    | { tipo: "icono"; pagina: string }
    | null
  >(null);
  const duplicarPagina = trpc.pages.duplicate.useMutation({ onSuccess: () => utils.pages.tree.invalidate() });
  const moverPagina = trpc.pages.move.useMutation({ onSuccess: () => utils.pages.tree.invalidate() });
  const anadirBloques = trpc.pages.anadirBloques.useMutation();
  const favorito = trpc.pages.toggleFavorite.useMutation({ onSuccess: () => utils.favorites.list.invalidate() });
  const crear = trpc.pages.create.useMutation({ onSuccess: () => utils.pages.tree.invalidate() });
  const guardar = trpc.pages.updateContent.useMutation();

  const hijaDe = (b: Bloque): string | null => {
    const id = enlaceDe(b);
    return id && utils.pages.tree.getData()?.find((p) => p.id === id)?.parentId === pageId ? id : null;
  };

  /** Duplica bloques; una subpágina se duplica entera (el servidor pone el enlace a la copia debajo). */
  async function duplicar(bloques: Bloque[]) {
    const sueltos = bloques.filter((b) => !hijaDe(b));
    for (const b of bloques) {
      const hija = hijaDe(b);
      if (hija) await duplicarPagina.mutateAsync({ id: hija });
    }
    if (sueltos.length) {
      const sinIds = (b: Bloque): Omit<Bloque, "id"> => ({ type: b.type, props: b.props, content: b.content, children: (b.children ?? []).map(sinIds) as Bloque[] });
      editor.insertBlocks(sueltos.map(sinIds), sueltos.at(-1)!.id, "after");
    }
  }

  /**
   * Lleva bloques a otra página (al final). Los de subpágina mueven LA PÁGINA: el
   * servidor quita el enlace de aquí y lo pone allí, así nunca quedan dos.
   */
  async function moverBloques(ids: string[], destino: string) {
    if (destino === pageId) return;
    const bloques = ids.map((id) => editor.getBlock(id) as Bloque | undefined).filter((b): b is Bloque => !!b);
    if (!bloques.length) return;
    try {
      const sueltos = bloques.filter((b) => !hijaDe(b));
      for (const b of bloques) {
        const hija = hijaDe(b);
        if (hija) await moverPagina.mutateAsync({ id: hija, parentId: destino });
      }
      if (sueltos.length) {
        await anadirBloques.mutateAsync({ id: destino, bloques: sueltos as never });
        editor.removeBlocks(sueltos.map((b) => b.id));
      }
      const t = utils.pages.tree.getData()?.find((p) => p.id === destino)?.title;
      toast(`Movido a «${t || "Sin título"}»`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo mover");
    }
  }

  async function convertir(b: Bloque, i: number) {
    const c = CONVERTIR[i];
    if (c.type === "drawing") abrirAlMontar.add(b.id);
    if (c.type !== "pagina") {
      editor.updateBlock(b.id, { type: c.type, props: c.props ?? {} });
      return;
    }
    // «Convertir en Página», como Notion: el texto es el título y lo de dentro, su contenido.
    const nueva = await crear.mutateAsync({ parentId: pageId, title: textoDe(b), enlazar: false });
    if (b.children?.length) await guardar.mutateAsync({ id: nueva.id, content: b.children });
    editor.replaceBlocks([b.id], [{ type: "paragraph", content: [{ type: "mention", props: { pageId: nueva.id, title: nueva.title, icon: "" } }] }]);
  }

  function ejecutar(accion: Accion, b: Bloque) {
    const enlazada = enlaceDe(b);
    if (typeof accion === "object" && "color" in accion) return editor.updateBlock(b.id, { props: { [accion.color]: accion.valor } });
    if (typeof accion === "object") return void convertir(b, accion.convertir);
    switch (accion) {
      case "duplicar":
        return void duplicar([b]);
      case "mover":
        return setDialogo(hijaDe(b) ? { tipo: "moverPagina", pagina: hijaDe(b)! } : { tipo: "moverBloques", ids: [b.id] });
      case "copiarEnlace":
        return void navigator.clipboard.writeText(`${location.origin}/p/${pageId}#${b.id}`).then(() => toast("Enlace del bloque copiado"));
      case "comentar":
        // El comentario va sobre el texto del bloque entero, como al seleccionarlo a mano.
        editor.setSelection(b.id, b.id);
        return editor.getExtension(CommentsExtension)?.startPendingComment();
      case "eliminar":
        return editor.removeBlocks([b.id]);
      case "pestana":
        return void (enlazada && window.open(`/p/${enlazada}`, "_blank"));
      case "panel":
        return enlazada && abrirEnPanel(enlazada);
      case "renombrar":
        return enlazada && setDialogo({ tipo: "renombrar", pagina: enlazada });
      case "icono":
        return enlazada && setDialogo({ tipo: "icono", pagina: enlazada });
      case "favorito":
        return enlazada && favorito.mutate({ pageId: enlazada });
    }
  }

  const cerrar = () => setDialogo(null);
  const dialogos =
    dialogo?.tipo === "moverPagina" ? (
      <MovePageModal pageId={dialogo.pagina} onClose={cerrar} />
    ) : dialogo?.tipo === "moverBloques" ? (
      <MovePageModal
        pageId={pageId}
        soloDocumentos
        onElegir={(destino) => {
          cerrar();
          void moverBloques(dialogo.ids, destino);
        }}
        onClose={cerrar}
      />
    ) : dialogo?.tipo === "renombrar" ? (
      <RenombrarPagina pageId={dialogo.pagina} onClose={cerrar} />
    ) : dialogo?.tipo === "icono" ? (
      <IconoDePagina pageId={dialogo.pagina} onClose={cerrar} />
    ) : null;

  return { ejecutar, duplicar, moverBloques, dialogos };
}

/** Ventanita centrada (renombrar, icono), con el estilo de «Mover a». */
function Ventana({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 pt-[15vh]" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 font-display text-base font-bold">{titulo}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function usePagina(pageId: string) {
  const { data: tree } = trpc.pages.tree.useQuery();
  return useMemo(() => tree?.find((p) => p.id === pageId), [tree, pageId]);
}

function useRenombrar() {
  const utils = trpc.useUtils();
  return trpc.pages.rename.useMutation({ onSuccess: () => utils.pages.tree.invalidate() });
}

function RenombrarPagina({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const p = usePagina(pageId);
  const rename = useRenombrar();
  const [titulo, setTitulo] = useState(p?.title ?? "");
  const guardar = () => {
    rename.mutate({ id: pageId, title: titulo.trim() });
    onClose();
  };
  return (
    <Ventana titulo="Renombrar" onClose={onClose}>
      <input
        autoFocus
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && guardar()}
        placeholder="Sin título"
        className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <div className="mt-3 flex justify-end gap-2 text-sm">
        <button onClick={onClose} className="rounded-md px-3 py-1.5 hover:bg-[var(--hover)]">Cancelar</button>
        <button onClick={guardar} className="rounded-md bg-brand px-3 py-1.5 font-medium text-white">Guardar</button>
      </div>
    </Ventana>
  );
}

function IconoDePagina({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const p = usePagina(pageId);
  const rename = useRenombrar();
  return (
    <Ventana titulo="Icono" onClose={onClose}>
      <div className="relative h-0">
        <SelectorIcono
          icon={p?.icon ?? null}
          elegir={(icon, seguir) => {
            rename.mutate({ id: pageId, title: p?.title ?? "", icon });
            if (!seguir) onClose();
          }}
        />
      </div>
      <div className="h-[22rem]" />
    </Ventana>
  );
}

/**
 * Las mismas acciones en una hoja que sube desde abajo: en táctil no hay tirador de
 * ratón (ver globals.css), y al tocar un bloque sale uno compacto que abre esto.
 */
export function HojaBloque({
  block,
  pageId,
  colaborativo,
  onAccion,
  onClose,
}: {
  block: Bloque;
  pageId: string;
  colaborativo: boolean;
  onAccion: (accion: Accion, bloque: Bloque) => void;
  onClose: () => void;
}) {
  const { deEnlace, comunes, convertir, eliminar, colores } = useItemsBloque(block, pageId, colaborativo);
  const [vista, setVista] = useState<"inicio" | "convertir" | "color">("inicio");
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const fila = "toque-estrecho flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] hover:bg-[var(--hover)]";
  const haz = (accion: Accion) => {
    onClose();
    onAccion(accion, block);
  };
  const boton = (it: Item) => (
    <button key={it.id} data-accion={it.id} onClick={() => haz(it.accion)} className={`${fila} ${it.peligro ? "text-red-500" : ""}`}>
      <span className="flex w-5 justify-center text-[var(--muted)]">{it.icono}</span>
      {it.etiqueta}
    </button>
  );
  const separador = <div className="my-1 h-px bg-[var(--border)]" />;
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/40" onClick={onClose} data-hoja-bloque="">
      <div
        className="zona-segura-abajo absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-[var(--border)] bg-[var(--background)] p-2 shadow-2xl md:inset-x-auto md:bottom-auto md:left-1/2 md:top-[15vh] md:w-80 md:-translate-x-1/2 md:rounded-2xl md:border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2 mt-1 h-1 w-10 rounded-full bg-[var(--border)] md:hidden" />
        {vista === "inicio" ? (
          <>
            {deEnlace.map(boton)}
            {deEnlace.length > 0 && separador}
            {convertir.length > 0 && (
              <button onClick={() => setVista("convertir")} className={fila}>
                <span className="flex w-5 justify-center text-[var(--muted)]"><Repeat size={16} /></span>
                <span className="flex-1">Convertir en</span>
                <ChevronRight size={16} className="text-[var(--muted)]" />
              </button>
            )}
            {colores && (
              <button onClick={() => setVista("color")} className={fila}>
                <span className="flex w-5 justify-center text-[var(--muted)]"><Palette size={16} /></span>
                <span className="flex-1">Color</span>
                <ChevronRight size={16} className="text-[var(--muted)]" />
              </button>
            )}
            {comunes.map(boton)}
            {separador}
            {eliminar && boton(eliminar)}
          </>
        ) : (
          <>
            <button onClick={() => setVista("inicio")} className={`${fila} font-medium`}>
              <span className="flex w-5 justify-center text-[var(--muted)]"><ChevronRight size={16} className="rotate-180" /></span>
              {vista === "convertir" ? "Convertir en" : "Color"}
            </button>
            {separador}
            {vista === "convertir"
              ? convertir.map(boton)
              : (["textColor", "backgroundColor"] as const)
                  .filter((k) => k in (block.props ?? {}))
                  .map((k) => (
                    <div key={k} className="px-1 pb-2">
                      <div className="px-2 pb-1 pt-2 text-xs font-medium text-[var(--muted)]">{k === "textColor" ? "Texto" : "Fondo"}</div>
                      <div className="flex flex-wrap gap-2 px-2">
                        {COLORES.map(([c, nombre]) => (
                          <button
                            key={c}
                            title={nombre}
                            aria-label={`${k === "textColor" ? "Texto" : "Fondo"} ${nombre}`}
                            onClick={() => haz({ color: k, valor: c })}
                            data-text-color={k === "textColor" ? c : undefined}
                            data-background-color={k === "backgroundColor" ? c : undefined}
                            className={`toque flex size-9 items-center justify-center rounded-lg border text-sm font-semibold ${
                              (block.props?.[k] ?? "default") === c ? "border-brand ring-1 ring-brand" : "border-[var(--border)]"
                            }`}
                          >
                            A
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
