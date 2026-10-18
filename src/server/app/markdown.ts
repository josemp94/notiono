/**
 * Markdown ↔ bloques en el servidor, para importar y exportar desde la app nativa
 * con el MISMO conversor que usa la web (el de BlockNote, que en el navegador tiene
 * DOM y aquí lo pone jsdom).
 *
 * ponytail: se cambian `window`/`document` globales mientras dura la conversión (que
 * es síncrona, así que nada más corre a la vez); es lo que hace @blocknote/server-util,
 * que aquí no se puede usar porque arrastra React.
 */
import { aplanarParaExport } from "@/lib/exportBloques";
import { editorServidor } from "./esquema";
import type { BloqueBN } from "./bloquesYjs";

let dom: Promise<import("jsdom").JSDOM> | null = null; // uno por proceso

async function conDom<T>(fn: (doc: Document) => T): Promise<T> {
  dom ??= import("jsdom").then(({ JSDOM }) => new JSDOM());
  const { window } = await dom;
  const g = globalThis as { window?: unknown; document?: unknown };
  const antes = [g.window, g.document];
  g.window = window;
  g.document = window.document;
  try {
    return fn(window.document);
  } finally {
    [g.window, g.document] = antes;
  }
}

export async function markdownABloques(md: string): Promise<BloqueBN[]> {
  const editor = await editorServidor();
  return conDom(() => editor.tryParseMarkdownToBlocks(md) as unknown as BloqueBN[]);
}

export async function bloquesAMarkdown(bloques: BloqueBN[]): Promise<string> {
  const editor = await editorServidor();
  const { blocksToMarkdown } = await import("@blocknote/core");
  // Columnas en secuencia y BD embebida como enlace, como el export de la web.
  const llanos = aplanarParaExport(bloques) as never;
  return conDom((document) => blocksToMarkdown(llanos, editor.pmSchema, editor, { document }));
}
