/**
 * Exportar en HTML: un .html autocontenido, legible en cualquier navegador sin
 * Notiono delante. HTML semántico (blocksToHTMLLossy, mismo schema que el
 * editor) + una hoja mínima a juego con la app. El PDF es ese mismo HTML
 * impreso (con su tamaño de página y escala) desde un marco oculto: el
 * navegador ofrece «Guardar como PDF».
 */
import { emojiIcono } from "@/components/PageIcon";
import { downloadText } from "@/lib/download";
import { documentoHtml } from "@/lib/htmlExport";
import { editorParaExport } from "./bloquesExport";

type Pagina = { titulo: string; icon?: string | null; content: unknown };

function htmlDe(args: Pagina, pdf?: { formato: string; escala: number }) {
  const ed = editorParaExport(args.content);
  const titulo = args.titulo || "Sin título";
  // El icono solo si es emoji: una imagen subida no viaja en un .html suelto.
  return { html: documentoHtml({ titulo, icono: emojiIcono(args.icon), cuerpo: ed.blocksToHTMLLossy(ed.document), pdf }), titulo };
}

export function exportaHtml(args: Pagina) {
  const { html, titulo } = htmlDe(args);
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

/** PDF: el HTML de la página impreso desde un marco oculto (A4, Letter…; escala en %). */
export function imprimePdf(args: Pagina, opciones: { formato: string; escala: number }) {
  const { html } = htmlDe(args, opciones);
  const marco = document.createElement("iframe");
  marco.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  marco.srcdoc = html;
  marco.onload = () => {
    // Las imágenes ya cargadas: si no, salen en blanco en el PDF.
    const imgs = [...(marco.contentDocument?.images ?? [])];
    Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r))))).then(() => {
      marco.contentWindow?.print();
      setTimeout(() => marco.remove(), 60_000);
    });
  };
  document.body.appendChild(marco);
}
