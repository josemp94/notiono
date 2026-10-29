/**
 * «Información de la página» (al pie del menú ⋯, como el recuento de palabras de Notion):
 * palabras, caracteres, casillas hechas/total, imágenes y adjuntos. Función pura sobre los
 * bloques de BlockNote; la usa el servidor (`app.info`) para la web y la app por igual, y se
 * comprueba en scripts/check.ts.
 */
type Inline = { type?: string; text?: string; content?: unknown; props?: Record<string, unknown> };
type Bloque = { type?: string; props?: Record<string, unknown>; content?: unknown; children?: unknown };

export type InfoPagina = { palabras: number; caracteres: number; casillas: number; hechas: number; imagenes: number; adjuntos: number };

function textoInline(c: unknown): string {
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) {
    // Tabla: { rows: [{ cells: [inline[] | { content }] }] }
    const rows = (c as { rows?: { cells?: unknown[] }[] } | null)?.rows;
    return rows ? rows.flatMap((r) => (r.cells ?? []).map((x) => textoInline(Array.isArray(x) ? x : (x as { content?: unknown })?.content))).join(" ") : "";
  }
  return (c as Inline[])
    .map((n) =>
      n.type === "link" ? textoInline(n.content)
      : n.type === "mention" ? String(n.props?.title ?? "")
      : n.type === "personMention" ? String(n.props?.name ?? "")
      : n.text ?? "",
    )
    .join("");
}

export function infoPagina(bloques: unknown): InfoPagina {
  const info: InfoPagina = { palabras: 0, caracteres: 0, casillas: 0, hechas: 0, imagenes: 0, adjuntos: 0 };
  const lineas: string[] = [];
  const mira = (bs: unknown) => {
    if (!Array.isArray(bs)) return;
    for (const b of bs as Bloque[]) {
      if (b?.type === "checkListItem") {
        info.casillas++;
        if (b.props?.checked) info.hechas++;
      }
      if (b?.type === "image" || (b?.type === "drawing" && b.props?.imagen)) info.imagenes++;
      if (b?.type === "file" || b?.type === "audio" || b?.type === "video") info.adjuntos++;
      const t = b?.type === "drawing" ? String(b.props?.texto ?? "") : textoInline(b?.content);
      if (t) lineas.push(t);
      mira(b?.children);
    }
  };
  mira(bloques);
  const todo = lineas.join("\n");
  info.palabras = (todo.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;
  // Caracteres con espacios (como Notion), sin contar los saltos entre bloques.
  info.caracteres = [...lineas.join("")].length;
  return info;
}
