"use client";

import { useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";

/** Colores del callout: los 10 de Notion, sobre las variables --tag-* (variante clara/oscura). */
const tinta = (v: string) => ({ bg: `var(${v})`, border: `color-mix(in srgb, var(--tag-fg) 15%, var(${v}))` });
const COLORS: Record<string, { bg: string; border: string }> = {
  fondo: tinta("--tag-default"),
  gris: tinta("--tag-gray"),
  marron: tinta("--tag-brown"),
  naranja: tinta("--tag-orange"),
  amarillo: tinta("--tag-yellow"),
  verde: tinta("--tag-green"),
  azul: tinta("--tag-blue"),
  morado: tinta("--tag-purple"),
  rosa: tinta("--tag-pink"),
  rojo: tinta("--tag-red"),
};

const EMOJIS = ["💡", "📌", "⚠️", "✅", "❌", "🔥", "📝", "❓", "🎯", "🧡"];

/**
 * Bloque "callout": emoji + texto destacado, como en Notion.
 * El emoji y el color se eligen desde el propio bloque (solo si el editor es editable).
 */
export const CalloutBlock = createReactBlockSpec(
  {
    type: "callout",
    propSchema: {
      emoji: { default: "💡" },
      color: { default: "naranja" },
    },
    content: "inline",
  },
  {
    render: ({ block, editor, contentRef }) => (
      <Callout
        emoji={block.props.emoji}
        color={block.props.color}
        editable={editor.isEditable}
        onChange={(props) => editor.updateBlock(block, { props })}
        contentRef={contentRef}
      />
    ),
    // Sin esto, exportar a Markdown perdería el texto del callout (bloque desconocido).
    // Como cita, que es lo más parecido que tiene Markdown.
    toExternalHTML: ({ block, contentRef }) => (
      <blockquote>
        <p>
          {block.props.emoji}{" "}
          <span ref={contentRef} />
        </p>
      </blockquote>
    ),
  },
);

function Callout({
  emoji,
  color,
  editable,
  onChange,
  contentRef,
}: {
  emoji: string;
  color: string;
  editable: boolean;
  onChange: (props: { emoji?: string; color?: string }) => void;
  contentRef: (node: HTMLElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const c = COLORS[color] ?? COLORS.naranja;

  return (
    <div
      className="relative my-1 flex w-full gap-3 rounded-lg border px-3 py-2.5"
      style={{ background: c.bg, borderColor: c.border }}
    >
      <button
        onClick={() => editable && setOpen((o) => !o)}
        className={`h-6 shrink-0 select-none text-lg leading-6 ${editable ? "cursor-pointer" : "cursor-default"}`}
        contentEditable={false}
        title={editable ? "Cambiar icono y color" : undefined}
      >
        {emoji}
      </button>
      <div ref={contentRef} className="min-w-0 flex-1 py-0.5" />
      {open && (
        <div
          contentEditable={false}
          data-menu=""
          className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 shadow-xl"
        >
          <div className="mb-2 flex flex-wrap gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => { onChange({ emoji: e }); setOpen(false); }}
                className="rounded px-1 py-0.5 text-lg hover:bg-[var(--border)]/50"
              >
                {e}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(COLORS).map(([name, v]) => (
              <button
                key={name}
                onClick={() => { onChange({ color: name }); setOpen(false); }}
                className="size-5 rounded border"
                style={{ background: v.bg, borderColor: v.border }}
                title={name}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
