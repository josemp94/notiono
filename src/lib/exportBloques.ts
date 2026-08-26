/**
 * Prepara los bloques para exportar (Markdown/HTML): lo que BlockNote no sabe
 * serializar se traduce ANTES, sobre el JSON llano, sin tocar el documento real.
 * - columnList: las columnas se leen de izquierda a derecha → sus hijos, en secuencia.
 * - database: el contenido vive en el servidor → un enlace a su página (el
 *   export a ZIP ya adjunta el CSV de cada BD aparte).
 */
type B = {
  type?: string;
  children?: B[];
  props?: Record<string, unknown>;
  [k: string]: unknown;
};

export function aplanarParaExport(bloques: unknown): unknown {
  if (!Array.isArray(bloques)) return bloques;
  const out: B[] = [];
  for (const b of bloques as B[]) {
    if (b?.type === "columnList") {
      for (const col of b.children ?? []) out.push(...(aplanarParaExport(col.children ?? []) as B[]));
      continue;
    }
    if (b?.type === "database") {
      const pid = (b.props as { pageId?: string } | undefined)?.pageId ?? "";
      const origen = typeof location !== "undefined" ? location.origin : "";
      out.push({
        type: "paragraph",
        content: [
          {
            type: "link",
            href: `${origen}/p/${pid}`,
            content: [{ type: "text", text: "📊 Base de datos", styles: {} }],
          },
        ],
      });
      continue;
    }
    out.push(b?.children?.length ? { ...b, children: aplanarParaExport(b.children) as B[] } : b);
  }
  return out;
}
