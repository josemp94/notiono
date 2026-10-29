"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { createReactBlockSpec } from "@blocknote/react";
import { PenLine } from "lucide-react";
import { configDibujo } from "./esquemaBloques";

// Excalidraw pesa: solo se descarga al abrir un lienzo.
const LienzoDibujo = dynamic(() => import("@/components/dibujo/LienzoDibujo"), { ssr: false });

/**
 * Bloques recién creados aquí (menú «/», «Convertir en»): se abren solos al montarse.
 * Solo los de esta pestaña: uno que llegue de otra persona por la edición simultánea no.
 */
export const abrirAlMontar = new Set<string>();

/**
 * Bloque «Dibujo»: en la página se ve la vista previa (PNG); con un clic se abre el
 * lienzo a pantalla completa y al pulsar Hecho se guardan los trazos y la imagen nueva.
 */
export const DrawingBlock = createReactBlockSpec(configDibujo, {
  render: ({ block, editor }) => {
    return (
      <Dibujo
        id={block.id}
        imagen={block.props.imagen}
        escena={block.props.escena}
        editable={editor.isEditable}
        onGuardar={(props) => editor.updateBlock(block, { props })}
      />
    );
  },
  // Al exportar (Markdown/HTML/Word) sale la imagen.
  toExternalHTML: ({ block }) => (block.props.imagen ? <img src={block.props.imagen} alt="Dibujo" /> : <p>Dibujo</p>),
});

function Dibujo({
  id,
  imagen,
  escena,
  editable,
  onGuardar,
}: {
  id: string;
  imagen: string;
  escena: string;
  editable: boolean;
  onGuardar: (p: { escena: string; imagen: string; texto: string }) => void;
}) {
  const [abrir, setAbrir] = useState(() => editable && abrirAlMontar.has(id));
  useEffect(() => void abrirAlMontar.delete(id), [id]);
  return (
    <div className="bloque-dibujo my-1 w-full" contentEditable={false}>
      <button
        type="button"
        onClick={() => editable && setAbrir(true)}
        className={`block w-full overflow-hidden rounded-md ${editable ? "cursor-pointer hover:ring-1 hover:ring-[var(--border)]" : "cursor-default"} ${imagen ? "" : "border border-dashed border-[var(--border)]"}`}
        aria-label={editable ? "Editar dibujo" : "Dibujo"}
      >
        {imagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagen} alt="Dibujo" className="dibujo-vista mx-auto max-h-[70vh] max-w-full" draggable={false} />
        ) : (
          <span className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--muted)]">
            <PenLine size={16} strokeWidth={1.75} />
            {editable ? "Dibujo vacío · toca para dibujar" : "Dibujo vacío"}
          </span>
        )}
      </button>
      {abrir &&
        createPortal(
          <LienzoDibujo
            escena={escena}
            onCerrar={() => setAbrir(false)}
            onGuardar={(g) => {
              onGuardar(g);
              setAbrir(false);
            }}
          />,
          document.body,
        )}
    </div>
  );
}
