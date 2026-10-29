/**
 * El .html exportado (web y app): autocontenido, legible en cualquier navegador sin
 * Notiono delante, con una hoja mínima a juego con la app. Con `pdf`, lo que se imprime
 * para guardar como PDF (tamaño de página y escala del diálogo «Exportar»).
 */
const escapa = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Los tamaños de papel del «Formato de página» (valor de `@page size`). */
export const PAPELES = ["A4", "letter", "legal", "A3", "A5"];

export function documentoHtml(a: { titulo: string; icono?: string; cuerpo: string; pdf?: { formato: string; escala: number } }) {
  const pdf = a.pdf && { formato: PAPELES.includes(a.pdf.formato) ? a.pdf.formato : "A4", escala: Math.min(200, Math.max(10, a.pdf.escala || 100)) };
  return `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapa(a.titulo)}</title>
<style>
  body { max-width: 44rem; margin: 2rem auto; padding: 0 1rem; font-family: system-ui, sans-serif; line-height: 1.6; color: #1c1b19; }
  img { max-width: 100%; }
  pre { overflow-x: auto; background: #f5f4f1; padding: .75rem; border-radius: 6px; }
  code { background: #f5f4f1; padding: .1em .3em; border-radius: 4px; }
  blockquote { border-left: 3px solid #e8e6e2; margin-left: 0; padding-left: 1rem; color: #5a5850; }
  a { color: #ff5c28; }
  table { border-collapse: collapse; }
  td, th { border: 1px solid #e8e6e2; padding: .3rem .5rem; }${pdf ? `
  @page { size: ${pdf.formato}; margin: 18mm; }
  body { margin: 0 auto; max-width: none; zoom: ${pdf.escala / 100}; }` : ""}
</style>
<h1>${escapa(a.icono ?? "")}${escapa(a.titulo)}</h1>
${a.cuerpo}
</html>`;
}
