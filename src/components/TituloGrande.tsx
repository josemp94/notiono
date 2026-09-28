"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * El título grande de una página, una base de datos o la ficha de una fila.
 *
 * Es un área de texto y no un input para que un título largo salte de línea, como
 * en Notion, en vez de cortarse. Crece con el texto (field-sizing aún no llega a
 * Safari). Enter no parte el título: llama a `onEnter` (en una página, baja al
 * cuerpo). En Android el Enter del teclado puede llegar como un salto dentro del
 * texto y no como tecla, así que se trata igual.
 */
export function TituloGrande({
  value,
  onChange,
  onEnter,
  readOnly,
  className = "",
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  readOnly?: boolean;
  className?: string;
  /** Para quien necesita saber si el título tiene el foco. */
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const propio = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? propio;
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight}px`;
  }, [value, ref]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(e) => {
        const v = e.target.value;
        if (v.includes("\n")) {
          onChange(v.replace(/\n/g, ""));
          onEnter?.();
        } else onChange(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onEnter?.();
        }
      }}
      placeholder="Sin título"
      readOnly={readOnly}
      className={`font-display block w-full resize-none overflow-hidden bg-transparent font-bold leading-tight outline-none placeholder:text-[var(--border)] ${className}`}
    />
  );
}
