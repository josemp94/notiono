"use client";

import { useRef } from "react";
import { createExtension } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { configColumna, configListaColumnas } from "./esquemaBloques";
import { Plugin, PluginKey } from "prosemirror-state";
import type { DecorationSet } from "prosemirror-view";
import {
  decorarAnchos,
  desindentarEnColumna,
  indentarTrasColumnas,
  introEnColumna,
  normalizarColumnas,
  retrocesoEnColumna,
} from "./columnas";

/**
 * Columnas del editor, a mano.
 *
 * BlockNote solo trae las columnas en su paquete de pago (`xl-multi-column`).
 * Estos dos bloques se llaman igual que los suyos (`columnList` y `column`) para
 * que el documento siga siendo compatible si algún día se compra, pero NO usan
 * sus clases (`bn-block-column…`): su hoja de estilos les mete relleno y flex
 * pensados para otra estructura.
 *
 * Los bloques de dentro NO los pinta este bloque: BlockNote saca los hijos en un
 * `.bn-block-group` hermano del contenido. Por eso el reparto del ancho está en
 * `globals.css`, colgando del tipo de bloque, y el ancho de cada columna (prop
 * `ancho`, un factor de flex-grow) lo pone ProseMirror con una decoración: ese
 * DOM es suyo y no se toca a mano (ver `columnas.ts`, que también lleva la
 * normalización de la estructura y el teclado dentro de las columnas).
 */

const claveColumnas = new PluginKey<DecorationSet>("columnasNotiono");

/** ¿Viene de otro (colaboración, o deshacer de Yjs)? Eso ya lo normalizó quien lo hizo. */
const esRemota = (tr: { getMeta: (k: string) => unknown }) =>
  !!(tr.getMeta("y-sync$") as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin;

const pluginColumnas = new Plugin<DecorationSet>({
  key: claveColumnas,
  state: {
    init: (_, state) => decorarAnchos(state.doc),
    apply: (tr, decos) => (tr.docChanged ? decorarAnchos(tr.doc) : decos),
  },
  props: { decorations: (state) => claveColumnas.getState(state) },
  appendTransaction: (trs, _antes, state) => {
    if (!trs.some((t) => t.docChanged) || trs.some(esRemota)) return null;
    const tr = state.tr;
    try {
      return normalizarColumnas(tr) ? tr : null;
    } catch {
      return null; // antes una estructura rara que un editor roto
    }
  },
});

/** Atajo que corre un comando de columnas.ts sobre la vista del editor. */
const atajo =
  (cmd: (s: never, d: never) => boolean) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ({ editor }: { editor: any }) => {
    const v = editor.prosemirrorView;
    return v ? cmd(v.state as never, v.dispatch as never) : false;
  };

const extensionColumnas = createExtension({
  key: "columnasNotiono",
  prosemirrorPlugins: [pluginColumnas],
  keyboardShortcuts: {
    Backspace: atajo(retrocesoEnColumna),
    Enter: atajo(introEnColumna),
    "Shift-Enter": atajo(introEnColumna),
    "Shift-Tab": atajo(desindentarEnColumna),
    Tab: atajo(indentarTrasColumnas),
  },
});

type EditorColumnas = {
  isEditable: boolean;
  getBlock: (id: string) => { props?: { ancho?: number | string } } | undefined;
  updateBlock: (id: string, u: { props: { ancho: number } }) => void;
  insertBlocks: (b: unknown[], ref: string, pos: "after") => { children?: { id: string }[] }[];
  setTextCursorPosition: (id: string, pos: "start") => void;
  transact: <T>(fn: () => T) => T;
};

/** Contenedor: no pinta nada propio, pero cuelga el «+» de añadir columna. */
function ListaColumnas({ block, editor }: { block: { children?: { id: string }[] }; editor: EditorColumnas }) {
  const añadir = () => {
    const ultima = block.children?.at(-1);
    if (!ultima) return;
    const [nueva] = editor.insertBlocks([emptyColumn()], ultima.id, "after");
    const linea = nueva?.children?.[0];
    if (linea) editor.setTextCursorPosition(linea.id, "start");
  };
  return (
    <div className="notiono-lista-columnas">
      {editor.isEditable && (
        <button
          contentEditable={false}
          className="asa-anadir-columna"
          onMouseDown={(e) => e.preventDefault()} // que el caret no salte al pulsar
          onClick={añadir}
          title="Añadir columna"
          type="button"
        >
          +
        </button>
      )}
    </div>
  );
}

export const ColumnListBlock = createReactBlockSpec(
  configListaColumnas,
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render: ({ block, editor }) => <ListaColumnas block={block as any} editor={editor as any} />,
    toExternalHTML: () => <div />,
  },
);

/** Una columna: solo lleva el tirador de ajustar el ancho. */
function Columna({ block, editor }: { block: { id: string; props: { ancho?: number | string } }; editor: EditorColumnas }) {
  const ref = useRef<HTMLDivElement>(null);

  // Arrastrar el borde derecho reparte el ancho entre esta columna y la siguiente
  // (la suma de ambas se conserva, como en Notion). Solo ratón: en táctil se apilan.
  // Mientras se arrastra, el ancho se previsualiza con una hoja de estilos aparte
  // (fuera del editor); al soltar se guarda en los dos bloques de una vez.
  const empezarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const outer = ref.current?.closest<HTMLElement>(".bn-block-outer");
    const next = outer?.nextElementSibling as HTMLElement | null;
    const nextId = next?.getAttribute("data-id");
    if (!outer || !next || !nextId) return;
    const w1 = outer.getBoundingClientRect().width;
    const w2 = next.getBoundingClientRect().width;
    const g1 = Number(block.props.ancho) || 1;
    const g2 = Number(editor.getBlock(nextId)?.props?.ancho) || 1;
    const total = g1 + g2;
    const porPx = total / (w1 + w2);
    const x0 = e.clientX;
    let ng1 = g1;
    const previa = document.createElement("style");
    document.head.appendChild(previa);
    const sel = (id: string) => `.bn-block-outer[data-id="${CSS.escape(id)}"]`;
    const cursor = document.body.style.cursor;
    document.body.style.cursor = "col-resize";
    const move = (ev: MouseEvent) => {
      ng1 = Math.min(total - 0.2, Math.max(0.2, g1 + (ev.clientX - x0) * porPx));
      previa.textContent =
        `${sel(block.id)}{flex-grow:${ng1}!important}` + `${sel(nextId)}{flex-grow:${total - ng1}!important}`;
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = cursor;
      const r = (x: number) => Math.round(x * 100) / 100;
      if (r(ng1) !== r(g1)) {
        editor.transact(() => {
          editor.updateBlock(block.id, { props: { ancho: r(ng1) } });
          editor.updateBlock(nextId, { props: { ancho: r(total - ng1) } });
        });
      }
      previa.remove();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div ref={ref} className="notiono-columna">
      {editor.isEditable && (
        <span contentEditable={false} className="asa-columna" onMouseDown={empezarResize} title="Ajustar el ancho" />
      )}
    </div>
  );
}

export const ColumnBlock = createReactBlockSpec(
  configColumna,
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render: ({ block, editor }) => <Columna block={block as any} editor={editor as any} />,
    toExternalHTML: () => <div />,
  },
  [extensionColumnas],
);

/** Una columna vacía, lista para escribir. */
export const emptyColumn = () => ({ type: "column" as const, children: [{ type: "paragraph" as const }] });
