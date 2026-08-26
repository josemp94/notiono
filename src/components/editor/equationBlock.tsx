"use client";

import { useEffect, useRef, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Bloque «Ecuación»: LaTeX pintado con KaTeX, como en Notion. Clic para editar
 * con vista previa en vivo; el TeX vive en props.tex.
 * ponytail: solo en bloque — la ecuación en línea necesita editar props de un
 * inline content, cosa que BlockNote no da desde su render; si se echa en
 * falta, chip inline de solo lectura + edición reemplazando el nodo.
 */
export const EquationBlock = createReactBlockSpec(
  {
    type: "equation",
    propSchema: {
      tex: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => (
      <Ecuacion
        tex={block.props.tex}
        editable={editor.isEditable}
        onChange={(tex) => editor.updateBlock(block, { props: { tex } })}
      />
    ),
    // Al exportar (Markdown/HTML) sobrevive como $$…$$, el dialecto habitual.
    toExternalHTML: ({ block }) => <p>{`$$${block.props.tex}$$`}</p>,
  },
);

function pintar(tex: string): string {
  return katex.renderToString(tex || "\\;", { throwOnError: false, displayMode: true });
}

export function Ecuacion({
  tex,
  editable,
  onChange,
}: {
  tex: string;
  editable: boolean;
  onChange: (tex: string) => void;
}) {
  // Recién insertada (sin TeX) se abre sola para escribir directamente.
  const [abierta, setAbierta] = useState(editable && !tex);
  const [borrador, setBorrador] = useState(tex);
  const caja = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (abierta) caja.current?.select();
  }, [abierta]);

  const commit = () => {
    setAbierta(false);
    if (borrador !== tex) onChange(borrador);
  };

  return (
    <div className="relative my-1 w-full" contentEditable={false}>
      <button
        onClick={() => {
          if (!editable) return;
          setBorrador(tex);
          setAbierta(true);
        }}
        className={`block w-full rounded px-2 py-1.5 text-center ${
          editable ? "hover:bg-[var(--hover)]" : "cursor-default"
        } ${tex ? "" : "text-sm text-[var(--muted)]"}`}
      >
        {tex ? (
          <span dangerouslySetInnerHTML={{ __html: pintar(tex) }} />
        ) : editable ? (
          "Nueva ecuación — clic para escribir TeX"
        ) : null}
      </button>
      {abierta && (
        <div
          data-menu=""
          className="absolute left-1/2 top-full z-30 mt-1 w-[28rem] max-w-[90vw] -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 shadow-xl"
        >
          <textarea
            ref={caja}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") setAbierta(false);
            }}
            onBlur={commit}
            rows={2}
            placeholder="c = \sqrt{a^2 + b^2}"
            spellCheck={false}
            className="w-full resize-none rounded border border-[var(--border)] bg-transparent px-2 py-1 font-mono text-sm outline-none focus:border-[var(--muted)]"
          />
          <div
            className="mt-2 overflow-x-auto text-center"
            dangerouslySetInnerHTML={{ __html: pintar(borrador) }}
          />
          <div className="mt-1 text-right text-[10px] text-[var(--muted)]">Enter guarda · Mayús+Enter salta de línea</div>
        </div>
      )}
    </div>
  );
}
