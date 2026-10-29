"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { createReactBlockSpec, ResizableFileBlockWrapper, type ReactCustomBlockRenderProps } from "@blocknote/react";
import { AlignCenter, AlignLeft, AlignRight, Download, MessageSquareText, PenLine } from "lucide-react";
import { configDibujo } from "./esquemaBloques";

// Excalidraw pesa: solo se descarga al abrir un lienzo.
const LienzoDibujo = dynamic(() => import("@/components/dibujo/LienzoDibujo"), { ssr: false });

/**
 * Bloques recién creados aquí (menú «/», «Convertir en»): se abren solos al montarse.
 * Solo los de esta pestaña: uno que llegue de otra persona por la edición simultánea no.
 */
export const abrirAlMontar = new Set<string>();

type Alineacion = "left" | "center" | "right";

/**
 * Bloque «Dibujo» (Notion no lo tiene): se comporta como una imagen. En la página se ve
 * la vista previa (PNG), con las guías de los lados para cambiar el ancho, y al pasar por
 * encima su barra (alinear, leyenda, descargar). Un clic abre el lienzo a pantalla
 * completa; al pulsar Hecho se guardan los trazos y la imagen nueva.
 */
type PropsBloque = ReactCustomBlockRenderProps<typeof configDibujo>;

function Dibujo(props: PropsBloque) {
    const { block, editor } = props;
    const editable = editor.isEditable;
    const [abrir, setAbrir] = useState(() => editable && abrirAlMontar.has(block.id));
    useEffect(() => void abrirAlMontar.delete(block.id), [block.id]);
    const pon = (p: Partial<typeof block.props>) => editor.updateBlock(block, { props: p });
    const alineacion = (block.props.textAlignment ?? "center") as Alineacion;
    const imagen = block.props.imagen;
    const lienzo =
      abrir &&
      createPortal(
        <LienzoDibujo
          escena={block.props.escena}
          onCerrar={() => setAbrir(false)}
          onGuardar={(g) => {
            pon(g);
            setAbrir(false);
          }}
        />,
        document.body,
      );

    if (!imagen)
      return (
        <div className="bloque-dibujo my-1 w-full" contentEditable={false}>
          <button
            type="button"
            onClick={() => editable && setAbrir(true)}
            className={`flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-[var(--border)] py-8 text-sm text-[var(--muted)] ${editable ? "cursor-pointer hover:bg-[var(--hover)]" : "cursor-default"}`}
            aria-label={editable ? "Editar dibujo" : "Dibujo"}
          >
            <PenLine size={16} strokeWidth={1.75} />
            {editable ? "Dibujo vacío · haz clic para dibujar" : "Dibujo vacío"}
          </button>
          {lienzo}
        </div>
      );

    // El envoltorio de las imágenes de BlockNote (guías para cambiar el ancho), con la vista
    // previa como si fuera su archivo. La leyenda la pinta este bloque, debajo.
    const comoImagen = { ...block, props: { ...block.props, url: imagen, name: "Dibujo", caption: "", showPreview: true } };
    const boton = "toque flex items-center justify-center rounded p-1 hover:bg-[var(--hover)]";
    return (
      <div
        className={`bloque-dibujo group/dibujo relative my-1 flex w-full flex-col ${alineacion === "left" ? "items-start" : alineacion === "right" ? "items-end" : "items-center"}`}
        contentEditable={false}
      >
        <ResizableFileBlockWrapper {...(props as never as Parameters<typeof ResizableFileBlockWrapper>[0])} block={comoImagen as never}>
          <button type="button" onClick={() => (editable ? setAbrir(true) : window.open(imagen, "_blank"))} className="block w-full cursor-pointer" aria-label={editable ? "Editar dibujo" : "Dibujo"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagen} alt="Dibujo" className="dibujo-vista block max-h-[70vh] w-full rounded-md object-contain" draggable={false} />
          </button>
        </ResizableFileBlockWrapper>
        {block.props.caption && (
          <button
            type="button"
            disabled={!editable}
            onClick={() => {
              const c = prompt("Leyenda", block.props.caption);
              if (c !== null) pon({ caption: c.trim() });
            }}
            className="mt-1 max-w-full text-sm text-[var(--muted)] disabled:cursor-default"
          >
            {block.props.caption}
          </button>
        )}
        {/* La barra de la imagen de Notion, al pasar (en táctil, siempre: .al-pasar). */}
        {editable && (
          <div className="al-pasar absolute right-1 top-1 flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--background)] p-0.5 text-[var(--muted)] shadow-sm md:opacity-0 md:group-hover/dibujo:opacity-100">
            {([["left", AlignLeft, "Alinear a la izquierda"], ["center", AlignCenter, "Centrar"], ["right", AlignRight, "Alinear a la derecha"]] as const).map(([a, Icono, t]) => (
              <button key={a} type="button" title={t} aria-label={t} onClick={() => pon({ textAlignment: a })} className={`${boton} ${alineacion === a ? "text-[var(--foreground)]" : ""}`}>
                <Icono size={15} />
              </button>
            ))}
            <button
              type="button"
              title="Leyenda"
              aria-label="Leyenda"
              onClick={() => {
                const c = prompt("Leyenda", block.props.caption);
                if (c !== null) pon({ caption: c.trim() });
              }}
              className={boton}
            >
              <MessageSquareText size={15} />
            </button>
            <a href={imagen} download="dibujo.png" title="Descargar" aria-label="Descargar" className={boton}>
              <Download size={15} />
            </a>
          </div>
        )}
        {lienzo}
      </div>
    );
}

export const DrawingBlock = createReactBlockSpec(configDibujo, {
  render: (props) => <Dibujo {...props} />,
  // Al exportar (Markdown/HTML/Word) sale la imagen, con su leyenda.
  toExternalHTML: ({ block }) =>
    block.props.imagen ? (
      <figure>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={block.props.imagen} alt="Dibujo" width={block.props.previewWidth} />
        {block.props.caption && <figcaption>{block.props.caption}</figcaption>}
      </figure>
    ) : (
      <p>Dibujo</p>
    ),
});
