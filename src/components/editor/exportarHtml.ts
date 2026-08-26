/**
 * «Exportar HTML»: un .html autocontenido, legible en cualquier navegador sin
 * Notiono delante. HTML semántico (blocksToHTMLLossy, mismo schema que el
 * editor) + una hoja mínima a juego con la app. La mitad PDF del export es
 * imprimir la propia página (Ctrl+P / guardar como PDF).
 */
import { BlockNoteEditor } from "@blocknote/core";
import { editorSchema, type NotionoPartialBlock } from "./mention";
import { esIconoImagen } from "@/components/PageIcon";
import { downloadText } from "@/lib/download";

const escapa = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function exportaHtml(args: { titulo: string; icon?: string | null; content: unknown }) {
  const bloques = args.content as NotionoPartialBlock[];
  const ed = BlockNoteEditor.create({
    schema: editorSchema,
    initialContent: Array.isArray(bloques) && bloques.length ? bloques : undefined,
  });
  const cuerpo = ed.blocksToHTMLLossy(ed.document);
  const titulo = args.titulo || "Sin título";
  // El icono solo si es emoji: una imagen subida no viaja en un .html suelto.
  const icono = args.icon && !esIconoImagen(args.icon) ? `${args.icon} ` : "";
  const html = `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapa(titulo)}</title>
<style>
  body { max-width: 44rem; margin: 2rem auto; padding: 0 1rem; font-family: system-ui, sans-serif; line-height: 1.6; color: #1c1b19; }
  img { max-width: 100%; }
  pre { overflow-x: auto; background: #f5f4f1; padding: .75rem; border-radius: 6px; }
  code { background: #f5f4f1; padding: .1em .3em; border-radius: 4px; }
  blockquote { border-left: 3px solid #e8e6e2; margin-left: 0; padding-left: 1rem; color: #5a5850; }
  a { color: #ff5c28; }
  table { border-collapse: collapse; }
  td, th { border: 1px solid #e8e6e2; padding: .3rem .5rem; }
</style>
<h1>${escapa(icono)}${escapa(titulo)}</h1>
${cuerpo}
</html>`;
  // Nombre sin acentos, espacios ni raros: regla de la casa para ficheros generados.
  const nombre =
    titulo
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "pagina";
  downloadText(`${nombre}.html`, html, "text/html");
}
