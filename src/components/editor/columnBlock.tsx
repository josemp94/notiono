"use client";

import { useEffect, useRef } from "react";
import { createReactBlockSpec } from "@blocknote/react";

/**
 * Columnas del editor, a mano.
 *
 * BlockNote solo trae las columnas en su paquete de pago (`xl-multi-column`), pero
 * **su hoja de estilos ya define** `.bn-block-column-list` y `.bn-block-column`: lo
 * único que falta son los dos bloques. Se llaman igual que los suyos (`columnList`
 * y `column`) para que el documento siga siendo compatible si algún día se compra.
 *
 * Los bloques de dentro NO los pinta este bloque: BlockNote saca los hijos en un
 * `.bn-block-group` hermano del contenido. Por eso el reparto del ancho está en
 * `globals.css`, colgando del tipo de bloque, y no aquí — y por eso el ancho por
 * columna (prop `ancho`, un factor de flex-grow) se aplica con un efecto sobre el
 * `.bn-block-outer` ancestro: el CSS no puede subir un valor de un hijo al padre.
 */

/** Contenedor: no pinta nada propio, pero cuelga el «+» de añadir columna. */
function ListaColumnas({
  block,
  editor,
}: {
  block: { children?: { id: string }[] };
  editor: { insertBlocks: (b: unknown[], ref: string, pos: "after") => void };
}) {
  const añadir = () => {
    const ultima = block.children?.at(-1);
    if (ultima) editor.insertBlocks([emptyColumn()], ultima.id, "after");
  };
  return (
    <div className="bn-block-column-list">
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
    </div>
  );
}

export const ColumnListBlock = createReactBlockSpec(
  { type: "columnList", propSchema: {}, content: "none" },
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render: ({ block, editor }) => <ListaColumnas block={block as any} editor={editor as any} />,
    toExternalHTML: () => <div />,
  },
);

/** Una columna: aplica su ancho al contenedor real y lleva el tirador de resize. */
function Columna({
  block,
  editor,
}: {
  block: { id: string; props: { ancho?: number | string } };
  editor: {
    getBlock: (id: string) => { props?: { ancho?: number | string } } | undefined;
    updateBlock: (id: string | { id: string }, u: { props: { ancho: number } }) => void;
  };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ancho = Number(block.props.ancho) || 1;

  // El flex vive en el .bn-block-outer ancestro (lo pinta BlockNote, no nosotros).
  useEffect(() => {
    const outer = ref.current?.closest<HTMLElement>(".bn-block-outer");
    if (outer) outer.style.flexGrow = String(ancho);
  }, [ancho]);

  // Arrastrar el borde derecho reparte el ancho entre esta columna y la siguiente
  // (la suma de ambas se conserva, como en Notion). Solo ratón: en táctil se apilan.
  const empezarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const outer = ref.current?.closest<HTMLElement>(".bn-block-outer");
    const next = outer?.nextElementSibling as HTMLElement | null;
    const nextId = next?.getAttribute("data-id");
    if (!outer || !next || !nextId) return;
    const w1 = outer.getBoundingClientRect().width;
    const w2 = next.getBoundingClientRect().width;
    const g1 = ancho;
    const g2 = Number(editor.getBlock(nextId)?.props?.ancho) || 1;
    const total = g1 + g2;
    const porPx = total / (w1 + w2);
    const x0 = e.clientX;
    let ng1 = g1;
    const move = (ev: MouseEvent) => {
      ng1 = Math.min(total - 0.2, Math.max(0.2, g1 + (ev.clientX - x0) * porPx));
      outer.style.flexGrow = String(ng1);
      next.style.flexGrow = String(total - ng1);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      const r = (x: number) => Math.round(x * 100) / 100;
      editor.updateBlock(block, { props: { ancho: r(ng1) } });
      editor.updateBlock(nextId, { props: { ancho: r(total - ng1) } });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div ref={ref} className="bn-block-column">
      <span contentEditable={false} className="asa-columna" onMouseDown={empezarResize} title="Ajustar el ancho" />
    </div>
  );
}

export const ColumnBlock = createReactBlockSpec(
  { type: "column", propSchema: { ancho: { default: 1 } }, content: "none" },
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render: ({ block, editor }) => <Columna block={block as any} editor={editor as any} />,
    toExternalHTML: () => <div />,
  },
);

/** Una columna vacía, lista para escribir. */
export const emptyColumn = () => ({ type: "column" as const, children: [{ type: "paragraph" as const }] });
