"use client";

import { useState } from "react";
import { createReactBlockSpec, useEditorChange } from "@blocknote/react";
import { configIndice } from "./esquemaBloques";
import type { BlockNoteEditor } from "@blocknote/core";

type Heading = { id: string; level: number; text: string };

/** Texto plano del contenido inline de un bloque (los chips de mención incluidos). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function textOf(content: any): string {
  if (!Array.isArray(content)) return "";
  return content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((c: any) => c?.text ?? c?.props?.title ?? c?.props?.name ?? "")
    .join("")
    .trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function headingsOf(editor: any): Heading[] {
  const out: Heading[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (blocks: any[]) => {
    for (const b of blocks ?? []) {
      if (b.type === "heading") {
        const text = textOf(b.content);
        if (text) out.push({ id: b.id, level: Number(b.props?.level ?? 1), text });
      }
      if (b.children?.length) walk(b.children);
    }
  };
  walk(editor.document);
  return out;
}

/** Bloque "Tabla de contenidos": índice de los encabezados de la página, clicable. */
export const TocBlock = createReactBlockSpec(
  configIndice,
  {
    render: ({ editor }) => <Toc editor={editor} />,
    // En Markdown y en el HTML exportado, una lista de enlaces internos.
    toExternalHTML: ({ editor }) => (
      <ul>
        {headingsOf(editor).map((h) => (
          <li key={h.id}>{h.text}</li>
        ))}
      </ul>
    ),
  },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Toc({ editor }: { editor: BlockNoteEditor<any, any, any> }) {
  const [headings, setHeadings] = useState<Heading[]>(() => headingsOf(editor));
  // El índice se rehace cuando cambia el documento (nuevo encabezado, texto editado…).
  useEditorChange(() => setHeadings(headingsOf(editor)), editor);

  const go = (id: string) => {
    const el = editor.domElement?.querySelector(`[data-id="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div contentEditable={false} className="my-1 w-full rounded-lg border border-[var(--border)] px-3 py-2">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
        Tabla de contenidos
      </div>
      {headings.length === 0 ? (
        <p className="py-1 text-sm text-[var(--muted)]">Esta página aún no tiene encabezados.</p>
      ) : (
        <ul className="space-y-0.5">
          {headings.map((h) => (
            <li key={h.id} style={{ paddingLeft: (Math.min(h.level, 4) - 1) * 14 }}>
              <button onClick={() => go(h.id)} className="text-left text-sm hover:text-[var(--foreground)] hover:underline">
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
